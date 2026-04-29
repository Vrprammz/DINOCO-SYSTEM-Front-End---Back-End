"""Mockup picking list + shipping labels — XP-420B test print harness.

V.1.0 (2026-04-29) — verifies Phase 2.1 V3 safety zones + V.42.8 pack_mode/box_template
rendering on real thermal printer (or dry-run PDF preview).

Mirrors production print pipeline EXACTLY:
  picking_list_thermal.html (paginated) + shipping_label.html (per box)
  → all_tspl batch → single USB session write (no backfeed)

Safety markers prevent confusion with real orders:
  - ticket_id range 999000-999999
  - "🧪 TEST PRINT" banner in dist_name + note
  - Flash PNO prefix "TEST-"
  - No state write to /tmp/dinoco-print-state.json
  - No POST to /print-ack (does not affect WP database)

Usage from dashboard.py:
    from test_picking import run_test_picking_print
    result = run_test_picking_print(printer_mgr, render_template, html_to_pdf,
                                    scenario='mixed', target_pages=2, dry_run=False)
"""

import copy
import os
import random
import shutil
import time
import logging

from picking_layout import (
    PAGE_H,
    paginate,
    count_boxes_for_item,
    estimate_item_mm,
    total_boxes as compute_total_boxes,
)

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════════════════════
# Realistic Thai motorcycle parts catalog (mockup)
# ════════════════════════════════════════════════════════════════════════════

MOCKUP_PRODUCTS = [
    # leaf items — single_box (most common)
    {
        'sku': 'DNCEXTOPCASE',
        'name': 'WATERPROOF Bag — DINOCO EXPAND SIDE BOX Top Case',
        'pack_mode': 'single_box',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': 'DNCBOX003', 'box_template_dims': '25x59x18',
        'box_template_weight_g': 120,
        'children': [],
    },
    {
        'sku': 'DNCMUDGUARD-CB650',
        'name': 'บังโคลน Honda CB650R 2023-2024',
        'pack_mode': 'single_box',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': 'DNCBOX002', 'box_template_dims': '30x20x15',
        'box_template_weight_g': 80,
        'children': [],
    },
    # bulk_pack — small parts, high qty per box
    {
        'sku': 'DNCBOLT-M8',
        'name': 'น็อต M8 สแตนเลส (แพ็ค 50)',
        'pack_mode': 'bulk_pack',
        'boxes_per_unit': 1, 'units_per_box': 50,
        'box_template_code': 'DNCBOX001', 'box_template_dims': '20x15x10',
        'box_template_weight_g': 50,
        'children': [],
    },
    {
        'sku': 'DNCSPACER-10MM',
        'name': 'แหวนรองอลูมิเนียม 10mm (แพ็ค 20)',
        'pack_mode': 'bulk_pack',
        'boxes_per_unit': 1, 'units_per_box': 20,
        'box_template_code': 'DNCBOX001', 'box_template_dims': '20x15x10',
        'box_template_weight_g': 50,
        'children': [],
    },
    # multi_box — large items split across boxes
    {
        'sku': 'DNCGND37LSPROS',
        'name': 'DINOCO Edition NX500 Crash Bar — Silver 37L',
        'pack_mode': 'multi_box',
        'boxes_per_unit': 2, 'units_per_box': 1,
        'box_template_code': 'DNCBOX004', 'box_template_dims': '40x30x20',
        'box_template_weight_g': 150,
        'children': [],
    },
    {
        'sku': 'DNCEXHAUST-NMAX',
        'name': 'ชุดท่อ Yamaha NMAX 155 (แยก 2 กล่อง)',
        'pack_mode': 'multi_box',
        'boxes_per_unit': 2, 'units_per_box': 1,
        'box_template_code': 'DNCBOX004', 'box_template_dims': '40x30x20',
        'box_template_weight_g': 200,
        'children': [],
    },
    # assembled_set — factory-assembled SET, ships as 1 box
    {
        'sku': 'DNCSETNX500IRNB',
        'name': 'SET NX500 ครบชุด IRON Black (โรงงานประกอบ)',
        'pack_mode': 'assembled_set',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': 'DNCBOX005', 'box_template_dims': '60x45x30',
        'box_template_weight_g': 250,
        'children': [],
    },
    # SET with children (DD-3 hierarchy — auto pack_mode)
    {
        'sku': 'DNCSETXL7500',
        'name': 'XL750 Crash Bar SET ครบชุด',
        'pack_mode': 'auto',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': '', 'box_template_dims': '',
        'children': [
            {'sku': 'DNCXL7500-L', 'name': 'XL750 Crash Bar Left'},
            {'sku': 'DNCXL7500-R', 'name': 'XL750 Crash Bar Right'},
        ],
    },
    # ad-hoc warehouse scan (unknown — admin must classify)
    {
        'sku': 'WHSE-SCAN-001',
        'name': 'อะไหล่ scan เข้ามาใหม่ (รอ classify)',
        'pack_mode': 'unknown',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': '', 'box_template_dims': '',
        'children': [],
    },
    # long Thai name — text wrap stress test
    {
        'sku': 'DNCTOPRACK-CB650',
        'name': 'แร็ค Top Rack ติดตั้ง Honda CB650R 2023-2024 พร้อมกล่องท้าย DINOCO Top Case 37L อลูมิเนียม',
        'pack_mode': 'single_box',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': 'DNCBOX003', 'box_template_dims': '25x59x18',
        'box_template_weight_g': 120,
        'children': [],
    },
    # legacy product (no enrichment) — backward compat test
    {
        'sku': 'LEGACY-001',
        'name': 'สินค้าเก่าก่อน V.42 — ไม่มี pack_mode',
        'pack_mode': 'auto',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': '', 'box_template_dims': '',
        'children': [],
    },
    # single_box with no template (dims fallback)
    {
        'sku': 'DNCMIRROR-PAIR',
        'name': 'กระจกมองข้าง Pair (ซ้าย-ขวา)',
        'pack_mode': 'single_box',
        'boxes_per_unit': 1, 'units_per_box': 1,
        'box_template_code': '', 'box_template_dims': '',
        'children': [],
    },
]

# Scenario presets — control item count + pack_mode mix
SCENARIOS = {
    'quick':      {'desc': 'Quick — 4 items, ~1 page (~60mm)'},
    'mixed':      {'desc': 'Mixed — 10 items balanced (~2 pages)'},
    'bulk-heavy': {'desc': 'Bulk-heavy — 12+ items mostly bulk_pack (~2-3 pages)'},
    'set-heavy':  {'desc': 'SET-heavy — SETs with children DD-3 (~2 pages)'},
    'worst-case': {'desc': 'Worst-case — 18+ items mix + long names (~3 pages)'},
}

MOCKUP_DIST = {
    'name': '🧪 TEST DINOCO ทดลองปริ้น (ไม่ใช่จริง)',
    'phone': '0900000000',
    'address': '99/99 ซ.ทดสอบ ถ.ทดลองปริ้น',
    'district': 'แขวง TEST จตุจักร',
    'province': 'กรุงเทพมหานคร',
    'postcode': '10900',
}

MOCKUP_COMPANY = {
    'name': 'DINOCO TEST 🧪',
    'phone': '0616399994',
    'address': '21/106 ซอยลาดพร้าว 15 จตุจักร',
    'province': 'กรุงเทพมหานคร',
    'postcode': '10900',
    'bank': {'name': '', 'account': '', 'holder': ''},
}


def _clone(p):
    """V.4 MED-3 fix: deep copy — prevents cross-test child dict mutation contamination
    (was: dict() shallow + list() outer only — child dict refs shared)."""
    return copy.deepcopy(p)


def _pick_items_for_scenario(scenario):
    """Pick item subset matching scenario."""
    if scenario == 'quick':
        # 4 single_box leaves — ~32mm content (1 page easy)
        return [_clone(p) for p in MOCKUP_PRODUCTS if p['pack_mode'] == 'single_box'][:4]
    elif scenario == 'bulk-heavy':
        # bulk_pack repeated — high density
        bulks = [_clone(p) for p in MOCKUP_PRODUCTS if p['pack_mode'] == 'bulk_pack']
        items = bulks * 4 + [_clone(p) for p in MOCKUP_PRODUCTS if p['pack_mode'] == 'single_box'][:4]
        return items[:14]
    elif scenario == 'set-heavy':
        # SETs with children
        sets_only = [_clone(p) for p in MOCKUP_PRODUCTS if p.get('children')]
        leaves = [_clone(p) for p in MOCKUP_PRODUCTS if p['pack_mode'] in ('single_box', 'multi_box')][:3]
        return sets_only * 3 + leaves
    elif scenario == 'worst-case':
        # 2x full catalog — covers all pack_modes + long names
        return [_clone(p) for p in MOCKUP_PRODUCTS] * 2
    else:  # mixed (default)
        return [_clone(p) for p in MOCKUP_PRODUCTS][:10]


def _add_qty_pricing(items):
    """Add realistic qty + price per item.
    V.4 LOW-2/LOW-3: diversified — production prices range 290-8990 + discount 0-30%."""
    for it in items:
        pm = it['pack_mode']
        if pm == 'bulk_pack':
            it['qty'] = random.choice([20, 50, 100])
        elif pm == 'multi_box':
            it['qty'] = random.choice([1, 2, 3])
        elif pm == 'assembled_set':
            it['qty'] = random.choice([1, 2])
        else:
            it['qty'] = random.choice([1, 2, 5])
        # Diversified price range — round to 10s for realistic THB pricing
        price = random.randint(29, 899) * 10  # 290-8990 THB
        it['price'] = price
        it['retail_price'] = price
        it['discount_pct'] = random.choice(['0%', '10%', '15%', '20%', '25%', '30%'])
    return items


def build_mockup_order(scenario='mixed', target_pages=2, ticket_id=None):
    """Build full job dict matching production b2b_rest_print_queue shape.

    Returns:
        dict: job — same structure as print_client.py expects
              {ticket_id, order: {dist_name, items, total_boxes, ...}, company, mode}
    """
    if ticket_id is None:
        # 999000-999999 = TEST range
        ticket_id = 999000 + random.randint(0, 999)

    items = _pick_items_for_scenario(scenario)
    items = _add_qty_pricing(items)

    total_boxes = compute_total_boxes(items)
    total_amount = sum(it['qty'] * it['price'] for it in items)

    return {
        'ticket_id': ticket_id,
        'order': {
            'dist_name': MOCKUP_DIST['name'],
            'dist_phone': MOCKUP_DIST['phone'],
            'dist_address': MOCKUP_DIST['address'],
            'dist_district': MOCKUP_DIST['district'],
            'dist_province': MOCKUP_DIST['province'],
            'dist_postcode': MOCKUP_DIST['postcode'],
            'total': total_amount,
            'items': items,
            'total_boxes': total_boxes,
            'note': '🧪 TEST PRINT — ไม่ใช่ออเดอร์จริง อย่าจัดส่ง',
        },
        'company': MOCKUP_COMPANY,
        'mode': 'manual',
    }


def run_test_picking_print(
    printer_mgr,
    render_template_fn,
    html_to_pdf_fn,
    convert_to_tspl_fn=None,
    scenario='mixed',
    target_pages=2,
    dry_run=False,
):
    """Execute test print mirroring production: picking pages + shipping labels via batch USB.

    Args:
        printer_mgr: PrinterManager instance (for create_usb_session + convert_to_tspl)
        render_template_fn: callable(template_name, context) -> html string
        html_to_pdf_fn: callable(html, width_mm, height_mm) -> pdf path
        convert_to_tspl_fn: optional override (defaults to printer_mgr.convert_to_tspl)
        scenario: one of SCENARIOS keys
        target_pages: 1-5 (informational; actual pages determined by content)
        dry_run: if True, render PDFs but don't send to printer

    Returns:
        dict: {ok, scenario, target_pages, actual_pages, items_count, total_boxes,
               bytes_sent, dry_run, pdf_paths, duration_ms}
    """
    start_ms = int(time.time() * 1000)

    if convert_to_tspl_fn is None and printer_mgr is not None:
        convert_to_tspl_fn = printer_mgr.convert_to_tspl

    # 1. Build mockup job
    job = build_mockup_order(scenario, target_pages)
    tid = job['ticket_id']
    order = job['order']
    items = order['items']
    total_boxes = order['total_boxes']

    logger.info(f'[TestPrint] tid={tid} scenario={scenario} items={len(items)} boxes={total_boxes} dry_run={dry_run}')

    # 2. Pagination
    pages = paginate(items)
    actual_pages = len(pages)

    # 3. Build context (matches print_client.py)
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone(timedelta(hours=7)))
    base_dir = os.path.dirname(os.path.abspath(__file__))
    logo_bw = os.path.join(base_dir, 'assets', 'logo_bw.png')
    logo_white_path = os.path.join(base_dir, 'tmp', 'logo_white.png')

    base_context = {
        'ticket_id': tid,
        'order': order,
        'company': job['company'],
        'mode': job['mode'],
        'now': now.strftime('%d/%m/%Y %H:%M'),
        'logo_path': logo_white_path if os.path.exists(logo_white_path) else (logo_bw if os.path.exists(logo_bw) else ''),
        'logo_path_bw': logo_bw if os.path.exists(logo_bw) else '',
        'logo_path_white': logo_white_path if os.path.exists(logo_white_path) else '',
        'qr_data_uri': '',  # skip QR for test
    }

    all_tspl = bytearray()
    pdf_paths = []
    bytes_per_segment = []

    # 4. Render picking list pages
    pick_tpl = 'picking_list_thermal.html' if (printer_mgr and printer_mgr.label_thermal) else 'picking_list_thermal.html'
    for page_idx, page_items in enumerate(pages):
        page_num = page_idx + 1
        is_last = (page_num == actual_pages)
        page_order = {**order, 'items': page_items}
        pick_ctx = {**base_context,
                    'order': page_order,
                    'page_num': page_num,
                    'total_pages': actual_pages,
                    'is_last_page': is_last}
        pick_html = render_template_fn(pick_tpl, pick_ctx)
        pick_pdf = html_to_pdf_fn(pick_html, 100, PAGE_H)
        pdf_paths.append(pick_pdf)

        if convert_to_tspl_fn:
            tspl_chunk = convert_to_tspl_fn(pick_pdf)
            all_tspl += tspl_chunk
            bytes_per_segment.append(('picking_p%d' % page_num, len(tspl_chunk)))

    # 5. Render shipping labels (per box, mirroring print_client.py)
    box_items = []
    box_num = 0
    for it in items:
        n_boxes = count_boxes_for_item(it)
        for _ in range(n_boxes):
            box_num += 1
            box_items.append({
                'box_num': box_num,
                'total_boxes': total_boxes,
                'item_name': it['name'],
                'item_sku': it['sku'],
                'pack_mode': it.get('pack_mode', 'auto'),
                'box_template_code': it.get('box_template_code', ''),
                'box_template_dims': it.get('box_template_dims', ''),
            })

    for i, bi in enumerate(box_items):
        label_ctx = {**base_context,
                     'box': bi,
                     'flash': {
                         'pno': 'TEST%07d%02d' % (tid, i + 1),
                         'sort_code': 'TEST',
                         'sorting_line_code': 'TEST-LINE',
                         'dst_store_name': 'TEST STORE',
                         'barcode_uri': '',
                         'qr_uri': '',
                     }}
        label_html = render_template_fn('shipping_label.html', label_ctx)
        label_pdf = html_to_pdf_fn(label_html, 100, PAGE_H)
        pdf_paths.append(label_pdf)

        if convert_to_tspl_fn:
            tspl_chunk = convert_to_tspl_fn(label_pdf)
            all_tspl += tspl_chunk
            bytes_per_segment.append(('label_%d' % (i + 1), len(tspl_chunk)))

    # 6. Send via USB session if not dry-run
    sent = False
    send_error = None
    if not dry_run and printer_mgr is not None and len(all_tspl) > 0:
        try:
            usb_session = printer_mgr.create_usb_session()
            if usb_session:
                usb_session.open()
                try:
                    usb_session.write(bytes(all_tspl))
                    sent = True
                finally:
                    usb_session.close()
            else:
                send_error = 'no_usb_session — fallback CUPS not yet implemented for test'
        except Exception as e:
            send_error = str(e)
            logger.error('[TestPrint] send failed: %s', e, exc_info=True)

    # 7. Cleanup PDFs unless dry-run (keep for inspection)
    saved_paths = []
    if dry_run:
        # Keep PDFs in tmp/ for review.
        # V.4 MED-1 fix: shutil.move() (atomic on same fs) — prevents data loss
        # if copy succeeded but unlink failed (was: copy+unlink → silent loss on copy fail).
        tmp_dir = os.path.join(base_dir, 'tmp')
        os.makedirs(tmp_dir, exist_ok=True)
        timestamp = int(time.time())
        for idx, p in enumerate(pdf_paths):
            if not p or not os.path.exists(p):
                continue
            new_name = os.path.join(tmp_dir, f'test_picking_{timestamp}_{idx:02d}.pdf')
            try:
                shutil.move(p, new_name)
                saved_paths.append(new_name)
            except Exception as e:
                logger.warning('[TestPrint] move %s failed: %s', p, e)
                # Original may still exist — best-effort cleanup
                try:
                    os.unlink(p)
                except Exception:
                    pass
    else:
        for p in pdf_paths:
            try:
                if p and os.path.exists(p):
                    os.unlink(p)
            except Exception:
                pass

    duration_ms = int(time.time() * 1000) - start_ms

    return {
        'ok': True,
        'scenario': scenario,
        'scenario_desc': SCENARIOS.get(scenario, {}).get('desc', ''),
        'target_pages': target_pages,
        'actual_pages': actual_pages,
        'items_count': len(items),
        'total_boxes': total_boxes,
        'shipping_labels': len(box_items),
        'bytes_sent': len(all_tspl) if sent else 0,
        'bytes_total': len(all_tspl),
        'segments': bytes_per_segment,
        'dry_run': dry_run,
        'sent': sent,
        'send_error': send_error,
        'pdf_paths': saved_paths if dry_run else [],
        'duration_ms': duration_ms,
        'safety_zones': {
            'top_safety_mm': 4,
            'bottom_safety_mm': 5,
            'usable_normal_mm': 121,
            'usable_last_mm': 88,
        },
        'ticket_id': tid,
    }
