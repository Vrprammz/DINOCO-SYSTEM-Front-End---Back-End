#!/usr/bin/env python3
"""
DINOCO B2B — Print Client Daemon V.2.1 (Raspberry Pi)
Supports two modes:
  1. WebSocket (Pusher) — real-time, instant print triggers
  2. Polling fallback   — if Pusher unavailable, polls every 10s

Usage:
    python3 print_client.py              # Run once (poll)
    python3 print_client.py --daemon     # WebSocket + polling fallback
    python3 print_client.py --poll-only  # Force polling mode (no WebSocket)

systemd runs this with --daemon flag.

V.2.0 — Picking List prints FIRST (before labels), auto-cut between each page
"""

import json
import os
import sys
import time
import signal
import logging
from logging.handlers import RotatingFileHandler
import tempfile
import argparse
from datetime import datetime, timezone, timedelta

import base64
import io

import requests
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

# ── Setup ──────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
SOUND_DIR = os.path.join(BASE_DIR, 'sounds')
STATE_FILE = '/tmp/dinoco-print-state.json'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        RotatingFileHandler(os.path.join(BASE_DIR, 'print_client.log'), maxBytes=5*1024*1024, backupCount=2),
    ]
)
logger = logging.getLogger('dinoco-print')

# Graceful shutdown
running = True
def signal_handler(sig, frame):
    global running
    logger.info('Shutting down gracefully...')
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def write_state(state, **kwargs):
    """Write current print state to file for kiosk dashboard to read."""
    data = {'state': state, 'updated_at': time.time()}
    data.update(kwargs)
    try:
        tmp = STATE_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        logger.debug(f'write_state failed: {e}')


# ── Config ──────────────────────────────────────────────────────────

def load_config():
    """Load configuration from config.json."""
    if not os.path.exists(CONFIG_PATH):
        logger.error(f'Config not found: {CONFIG_PATH}')
        sys.exit(1)
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)


# ── Sound ───────────────────────────────────────────────────────────

def play_sound(config):
    """Play notification sound when new orders arrive."""
    if not config.get('sound_enabled', True):
        return
    sound_file = os.path.join(SOUND_DIR, 'new_order.wav')
    if not os.path.exists(sound_file):
        logger.warning(f'Sound file not found: {sound_file}')
        return
    try:
        import subprocess
        volume = int(config.get('sound_volume', 80))
        subprocess.run(['amixer', 'set', 'Master', f'{volume}%'], capture_output=True, timeout=5)
        subprocess.Popen(['aplay', '-q', sound_file])
    except Exception as e:
        logger.warning(f'Sound playback failed: {e}')


# ── QR Code Generation ─────────────────────────────────────────────

def generate_qr_data_uri(text, box_size=6, border=1):
    """Generate a QR code as a base64 data URI for embedding in HTML templates.

    Tries qrcode library first, then segno as fallback.

    Args:
        text: The text to encode in the QR code
        box_size: Size of each QR module in pixels
        border: Border width in modules

    Returns:
        str: data:image/png;base64,... URI, or empty string on failure
    """
    logger.info(f'Generating QR code for: {text}')
    uri = _qr_via_qrcode(text, box_size, border)
    if uri:
        logger.info(f'QR code generated OK via qrcode lib ({len(uri)} chars)')
        return uri
    uri = _qr_via_segno(text, border)
    if uri:
        logger.info(f'QR code generated OK via segno lib ({len(uri)} chars)')
        return uri
    logger.error(f'QR code generation FAILED for: {text} — all methods exhausted')
    return ''


def _qr_via_qrcode(text, box_size=6, border=1):
    """Generate QR using qrcode library."""
    try:
        import qrcode
        logger.debug('qrcode library imported OK')
        qr = qrcode.QRCode(version=1, box_size=box_size, border=border,
                           error_correction=qrcode.constants.ERROR_CORRECT_M)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return f'data:image/png;base64,{b64}'
    except ImportError:
        logger.warning('qrcode library not installed')
        return ''
    except Exception as e:
        logger.error(f'qrcode library error: {e}', exc_info=True)
        return ''


def _qr_via_segno(text, border=1):
    """Fallback QR generation using segno (pure Python, no Pillow needed)."""
    try:
        import segno
        logger.debug('segno library imported OK')
        qr = segno.make(text, error='M')
        buf = io.BytesIO()
        qr.save(buf, kind='png', scale=6, border=border)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return f'data:image/png;base64,{b64}'
    except ImportError:
        logger.warning('segno library not installed')
        return ''
    except Exception as e:
        logger.error(f'segno library error: {e}', exc_info=True)
        return ''


def create_white_logo(src_path):
    """Create a white version of the logo (for black background) by inverting colors.

    WeasyPrint doesn't support CSS filter:invert(), so we create the inverted image file.

    Returns:
        str: path to the white logo file, or empty string on failure
    """
    white_path = src_path.replace('.png', '_white.png')
    # Return cached version if already exists and newer than source
    if os.path.exists(white_path) and os.path.getmtime(white_path) >= os.path.getmtime(src_path):
        return white_path
    try:
        from PIL import Image, ImageOps
        img = Image.open(src_path)
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        # Split channels, invert RGB, keep alpha
        r, g, b, a = img.split()
        r = ImageOps.invert(r)
        g = ImageOps.invert(g)
        b = ImageOps.invert(b)
        img_white = Image.merge('RGBA', (r, g, b, a))
        img_white.save(white_path, 'PNG')
        logger.info(f'Created white logo: {white_path}')
        return white_path
    except ImportError:
        logger.warning('Pillow not installed — cannot create white logo')
        return ''
    except Exception as e:
        logger.warning(f'White logo creation failed: {e}')
        return ''


# ── Barcode Generation ─────────────────────────────────────────────

def generate_barcode_data_uri(text, barcode_type='code128', width=650, height=120):
    """Generate a Code128 barcode as a base64 data URI for embedding in HTML.

    Args:
        text: The text to encode (e.g. Flash pno tracking number)
        barcode_type: Barcode type (default: code128 per Flash spec)
        width: Image width in pixels
        height: Image height in pixels

    Returns:
        str: data:image/png;base64,... URI
    """
    try:
        import barcode
        from barcode.writer import ImageWriter

        from PIL import Image as PILImage

        writer = ImageWriter()
        writer.set_options({
            'module_width': 0.4,
            'module_height': 12,
            'font_size': 0,
            'text_distance': 0,
            'write_text': False,   # Completely suppress text rendering in barcode image
            'quiet_zone': 2,
        })
        code = barcode.get(barcode_type, text, writer=writer)
        buf = io.BytesIO()
        code.write(buf)

        # Crop text below bars: scan TOP→BOTTOM to find the white gap between bars and text
        # (some python-barcode versions still render text even with write_text=False)
        buf.seek(0)
        bc_img = PILImage.open(buf).convert('L')
        w, h = bc_img.size
        pixels = bc_img.load()

        # Strategy: find first white-gap row AFTER bars started → crop there
        in_bars = False
        crop_h = h
        for y in range(h):
            row_dark = sum(1 for x in range(w) if pixels[x, y] < 128)
            dark_pct = row_dark / w
            if dark_pct > 0.10:
                in_bars = True
            elif in_bars and dark_pct < 0.01:
                # Found the gap between bars and any text below
                crop_h = y
                break

        # Safety: never crop above 40% of image height
        crop_h = max(crop_h, int(h * 0.4))
        logger.info(f'Barcode image {w}x{h}, crop at y={crop_h}')
        bc_img = bc_img.crop((0, 0, w, crop_h))
        buf2 = io.BytesIO()
        bc_img.save(buf2, format='PNG')
        b64 = base64.b64encode(buf2.getvalue()).decode('ascii')
        return f'data:image/png;base64,{b64}'
    except ImportError:
        logger.warning('python-barcode library not installed — skipping barcode generation')
        return ''
    except Exception as e:
        logger.warning(f'Barcode generation failed: {e}')
        return ''


# ── Template Rendering ──────────────────────────────────────────────

_jinja_env = None

def _get_jinja_env():
    """Get or create a cached Jinja2 Environment (singleton)."""
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
        _jinja_env.filters['number_format'] = lambda v: f'{v:,.0f}' if v else '0'
        _jinja_env.filters['number_format_2'] = lambda v: f'{v:,.2f}' if v else '0.00'
    return _jinja_env


def render_template(template_name, context):
    """Render a Jinja2 template to HTML string."""
    env = _get_jinja_env()
    template = env.get_template(template_name)
    return template.render(**context)


def html_to_pdf(html_string, width_mm=None, height_mm=None):
    """Convert HTML string to a temporary PDF file path."""
    from weasyprint import CSS

    page_css = None
    if width_mm and height_mm:
        page_css = CSS(string=f'@page {{ size: {width_mm}mm {height_mm}mm; margin: 3mm; }}')

    tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    tmp.close()

    HTML(string=html_string).write_pdf(
        tmp.name,
        stylesheets=[page_css] if page_css else None
    )
    return tmp.name


# ── Print Job Processing ────────────────────────────────────────────

def download_flash_label(pno, config):
    """Download Flash label PDF from WordPress REST API."""
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/flash-label'
        resp = requests.post(url, json={'pno': pno}, headers={'X-Print-Key': api_key}, timeout=30)
        if resp.status_code == 200 and resp.headers.get('Content-Type', '').startswith('application/pdf'):
            tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False, dir=tempfile.gettempdir())
            tmp.write(resp.content)
            tmp.close()
            logger.info(f'  Downloaded Flash label for {pno}: {tmp.name}')
            return tmp.name
        else:
            logger.warning(f'  Flash label download failed for {pno}: HTTP {resp.status_code}')
            return None
    except Exception as e:
        logger.error(f'  Flash label download error for {pno}: {e}')
        return None


def process_job(job, config, printer_mgr):
    """
    Process a single print job:
    1. Render invoice → PDF → print on Printer 1 (A4)
    2. Render picking list → PDF → print on Printer 2 (Label) — FIRST so staff can pick
    3. Render shipping labels × N (1 per box) → PDF → print on Printer 2 (Label) — auto-cut each
    4. POST ack back to WordPress
    """
    tid = job['ticket_id']
    order = job['order']
    company = job['company']
    mode = job.get('mode', 'manual')

    # Write state for kiosk dashboard
    write_state('printing', job={
        'ticket_id': tid,
        'shop': order.get('dist_name', ''),
        'total': order.get('total', 0),
        'items': order.get('items', []),
        'total_boxes': order.get('total_boxes', 0),
    })

    logger.info(f'Processing #{tid} — {order["dist_name"]} — {order.get("total_boxes", 0)} boxes')

    details = {
        'invoice': False,
        'labels_printed': 0,
        'labels_total': order.get('total_boxes', 0),
        'picking_list': False,
    }

    now = datetime.now(timezone(timedelta(hours=7)))
    # Color logo for invoice (EPSON inkjet), black logo for thermal labels
    logo_color = os.path.join(BASE_DIR, 'assets', 'logo.png')
    logo_bw = os.path.join(BASE_DIR, 'assets', 'logo_bw.png')
    # Create white logo for black background (WeasyPrint doesn't support CSS filter:invert)
    logo_white = create_white_logo(logo_bw) if os.path.exists(logo_bw) else ''
    qr_data_uri = generate_qr_data_uri(f'DINOCO#{tid}')
    context = {
        'ticket_id': tid,
        'order': order,
        'company': company,
        'mode': mode,
        'now': now.strftime('%d/%m/%Y %H:%M'),
        'now_iso': now.isoformat(),
        'logo_path': logo_color if os.path.exists(logo_color) else (logo_bw if os.path.exists(logo_bw) else ''),
        'logo_path_bw': logo_bw if os.path.exists(logo_bw) else '',
        'logo_path_white': logo_white,
        'qr_data_uri': qr_data_uri,
    }

    errors = []
    job_state = {'ticket_id': tid, 'shop': order.get('dist_name', ''),
                 'total': order.get('total', 0), 'items': order.get('items', []),
                 'total_boxes': order.get('total_boxes', 0)}

    # 1. Invoice (A4) — continue to labels even if this fails
    try:
        logger.info(f'  Rendering invoice #{tid}...')
        inv_html = render_template('invoice.html', context)
        inv_pdf = html_to_pdf(inv_html)
        printer_mgr.print_invoice(inv_pdf, tid)
        details['invoice'] = True
        os.unlink(inv_pdf)
    except Exception as e:
        logger.error(f'  Invoice print error #{tid}: {e}', exc_info=True)
        errors.append(f'Invoice: {e}')

    # 2. Picking List — คำนวณหน้าก่อนปริ้น (100×180mm per page)
    try:
        logger.info(f'  Rendering picking list #{tid}...')
        pick_tpl = 'picking_list_thermal.html' if printer_mgr.label_thermal else 'picking_list.html'

        # คำนวณจำนวน rows ทั้งหมด (items + children)
        all_items = order.get('items', [])
        all_rows = []
        for it in all_items:
            all_rows.append(it)
            for child in it.get('children', []):
                all_rows.append({'name': child.get('name', child.get('sku', '')), 'sku': child.get('sku', ''), 'is_child': True})

        # คำนวณหน้า: header 35mm + totals 25mm + addr 20mm + footer 8mm = ~88mm fixed
        # แต่ละ row ~15mm, page height 180mm → rows per page = (180 - 88) / 15 ≈ 6 rows per page
        FIXED_MM = 88
        ROW_MM = 15
        PAGE_H = 180
        rows_per_page = max(1, int((PAGE_H - FIXED_MM) / ROW_MM))
        total_pages = max(1, -(-len(all_rows) // rows_per_page))  # ceil division

        logger.info(f'  Picking list #{tid}: {len(all_rows)} rows, {total_pages} pages ({rows_per_page} rows/page)')

        # ปริ้นทีละหน้า
        for page_idx in range(total_pages):
            page_num = page_idx + 1
            start = page_idx * rows_per_page
            end = start + rows_per_page
            page_items = all_rows[start:end]

            # สร้าง page_items ที่แปลงกลับเป็น format ที่ template เข้าใจ
            # (template ใช้ item.sku, item.name, item.qty, item.boxes_per_unit, item.children)
            page_order_items = []
            for row in page_items:
                if row.get('is_child'):
                    # child rows ถูกรวมเข้า parent แล้ว — skip (จะแสดงผ่าน parent.children)
                    continue
                # หา original item จาก all_items เพื่อเอา children + fields ครบ
                orig = next((it for it in all_items if it.get('sku') == row.get('sku')), row)
                page_order_items.append(orig)

            # Override order items เป็นเฉพาะหน้านี้
            page_order = {**order, 'items': page_order_items}

            # สร้าง context สำหรับหน้านี้
            pick_ctx = {**context,
                        'order': page_order,
                        'page_num': page_num,
                        'total_pages': total_pages,
                        'is_last_page': page_num == total_pages,
                        'logo_path': context.get('logo_path_bw', '') or context.get('logo_path_white', '')}

            # คำนวณความสูงหน้า — บังคับ 180mm ทุกหน้า (ตรงกับ label stock 100x180mm)
            pick_h = PAGE_H

            pick_html = render_template(pick_tpl, pick_ctx)
            pick_pdf = html_to_pdf(pick_html, 100, pick_h)
            printer_mgr.print_picking_list(pick_pdf, tid)
            os.unlink(pick_pdf)

        details['picking_list'] = True
        details['picking_pages'] = total_pages
    except Exception as e:
        logger.error(f'  Picking list print error #{tid}: {e}', exc_info=True)
        errors.append(f'PickingList: {e}')

    # ── Delay 10s ระหว่าง Picking List กับ Shipping Labels ──
    # ให้ XP-420B จัดหน้า+ตัดกระดาษเสร็จก่อน ป้องกัน feed ซ้อนกัน
    import time
    logger.info(f'  Waiting 10s before shipping labels #{tid}...')
    time.sleep(10)

    # 3. Shipping Labels — one label per box, each auto-cut separately
    try:
        flash_pnos = job.get('flash_label_pnos', [])
        flash_meta = job.get('flash_meta', {})
        total_boxes = order.get('total_boxes', 0)

        if total_boxes > 0:
            label_w = config.get('label_width_mm', 100)
            label_h = config.get('label_height_mm', 180)
            label_pdfs = []

            box_num = 0
            box_items = []
            for item in order.get('items', []):
                bpu = item.get('boxes_per_unit', 1)
                item_boxes = item['qty'] * bpu
                for _ in range(item_boxes):
                    box_num += 1
                    box_items.append({
                        'box_num': box_num,
                        'total_boxes': total_boxes,
                        'item_name': item['name'],
                        'item_sku': item['sku'],
                    })

            # Guard: ถ้าจำนวนกล่องจริงไม่ตรงกับ total_boxes → ใช้จำนวนจริง
            if len(box_items) != total_boxes:
                logger.warning(f'  #{tid} total_boxes mismatch: WP={total_boxes} actual={len(box_items)}')
                for bi in box_items:
                    bi['total_boxes'] = len(box_items)

            for i, bi in enumerate(box_items):
                label_ctx = {**context, 'box': bi,
                             'logo_path': context.get('logo_path_white', '') or context.get('logo_path_bw', '')}
                # Add Flash Express data if available
                pno = flash_pnos[i] if i < len(flash_pnos) else ''
                if pno:
                    label_ctx['flash'] = {
                        'pno': pno,
                        'sort_code': flash_meta.get('sort_code', ''),
                        'sorting_line_code': flash_meta.get('sorting_line_code', ''),
                        'dst_store_name': flash_meta.get('dst_store_name', ''),
                        'barcode_uri': generate_barcode_data_uri(pno),
                        'qr_uri': generate_qr_data_uri(pno, box_size=8, border=1),
                    }
                label_html = render_template('shipping_label.html', label_ctx)
                pdf_path = html_to_pdf(label_html, label_w, label_h)
                label_pdfs.append(pdf_path)

            logger.info(f'  Printing {len(label_pdfs)} labels #{tid}...')
            details['labels_printed'] = printer_mgr.print_labels(label_pdfs, tid)

            for p in label_pdfs:
                os.unlink(p)
    except Exception as e:
        logger.error(f'  Label print error #{tid}: {e}', exc_info=True)
        errors.append(f'Labels: {e}')

    # Determine final status
    if not errors:
        write_state('done', job=job_state, result=details)
        return 'done', '', details
    elif details['invoice'] or details.get('labels_printed', 0) > 0:
        # Some steps succeeded, some failed
        err_msg = '; '.join(errors)
        write_state('error', job=job_state, error=err_msg, result=details)
        return 'partial', err_msg, details
    else:
        err_msg = '; '.join(errors)
        write_state('error', job=job_state, error=err_msg, result=details)
        return 'error', err_msg, details


def process_job_with_retry(job, config, printer_mgr, max_retries=2):
    """Process a print job with automatic retry on transient failures."""
    tid = job['ticket_id']
    for attempt in range(max_retries + 1):
        status, message, details = process_job(job, config, printer_mgr)
        if status == 'done':
            return status, message, details
        retryable_keywords = ['connection', 'cups', 'timeout', 'busy', 'temporary']
        is_retryable = any(kw in message.lower() for kw in retryable_keywords)
        if is_retryable and attempt < max_retries:
            delay = 5 * (2 ** attempt)
            logger.warning(f'  Retrying #{tid} in {delay}s (attempt {attempt+1}/{max_retries}): {message}')
            write_state('retrying', job={
                'ticket_id': tid,
                'shop': job.get('order', {}).get('dist_name', ''),
                'attempt': attempt + 1,
                'max_retries': max_retries,
            })
            time.sleep(delay)
            printer_mgr.conn = None
            continue
        return status, message, details
    return status, message, details


def process_test_job(test_job, config, printer_mgr):
    """Process a test print job from WordPress admin."""
    test_type = test_job.get('type', 'label')
    logger.info(f'Processing test print: {test_type}')

    now = datetime.now(timezone(timedelta(hours=7)))
    logo_color = os.path.join(BASE_DIR, 'assets', 'logo.png')
    logo_bw = os.path.join(BASE_DIR, 'assets', 'logo_bw.png')
    logo_file = logo_color if os.path.exists(logo_color) else logo_bw
    logo_white = create_white_logo(logo_bw) if os.path.exists(logo_bw) else ''
    qr_data_uri = generate_qr_data_uri('DINOCO#TEST')
    context = {
        'ticket_id': 'TEST',
        'qr_data_uri': qr_data_uri,
        'logo_path_bw': logo_bw if os.path.exists(logo_bw) else '',
        'logo_path_white': logo_white,
        'order': {
            'dist_name': 'ร้านทดสอบ (Test)',
            'dist_phone': '0812345678',
            'dist_address': '123 ถนนทดสอบ',
            'dist_district': 'จตุจักร',
            'dist_province': 'กรุงเทพมหานคร',
            'dist_postcode': '10900',
            'total': 1234.0,
            'items': [
                {'name': 'สินค้าทดสอบ A', 'sku': 'TEST-001', 'qty': 2, 'price': 1000.0,
                 'retail_price': 625.0, 'discount_pct': '20.0%', 'boxes_per_unit': 1},
                {'name': 'สินค้าทดสอบ B', 'sku': 'TEST-002', 'qty': 1, 'price': 234.0,
                 'retail_price': 0, 'discount_pct': '', 'boxes_per_unit': 1},
            ],
            'note': 'Test Print',
            'total_boxes': 3,
            'due_date': now.strftime('%d/%m/%Y'),
            'credit_term': 30,
            'dist_rank': 'gold',
            'doc_type': 'invoice',
            'baht_text': '(หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน)',
            'total_retail': 1250.0,
            'total_discount': 16.0,
            'creator': 'DINOCO System',
            'customer_note': '',
        },
        'company': {
            'name': 'DINOCO THAILAND',
            'address': '',
            'phone': '',
            'bank': {'name': '-', 'account': '-', 'holder': '-'},
        },
        'now': now.strftime('%d/%m/%Y %H:%M'),
        'now_iso': now.isoformat(),
        'logo_path': logo_file if os.path.exists(logo_file) else '',
    }

    try:
        if test_type == 'invoice':
            html = render_template('invoice.html', context)
            pdf = html_to_pdf(html)
            printer_mgr.print_invoice(pdf, 'TEST')
            os.unlink(pdf)
        elif test_type in ('label', 'picking'):
            label_w = config.get('label_width_mm', 100)
            label_h = config.get('label_height_mm', 180)
            test_pno = 'TH0117B8TF2A'
            box_ctx = {
                **context,
                'logo_path': context.get('logo_path_white', '') or context.get('logo_path_bw', ''),
                'box': {'box_num': 1, 'total_boxes': 1, 'item_name': 'สินค้าทดสอบ', 'item_sku': 'TEST-001'},
                'flash': {
                    'pno': test_pno,
                    'sort_code': '21B-21258-01',
                    'sorting_line_code': 'D02',
                    'dst_store_name': '5BKT_PDC-บางขุนเทียน',
                    'barcode_uri': generate_barcode_data_uri(test_pno),
                    'qr_uri': generate_qr_data_uri(test_pno, box_size=8, border=1),
                },
            }
            html = render_template('shipping_label.html', box_ctx)
            pdf = html_to_pdf(html, label_w, label_h)
            printer_mgr.print_labels([pdf], 'TEST')
            os.unlink(pdf)
        logger.info(f'Test print {test_type} completed')
    except Exception as e:
        logger.error(f'Test print {test_type} failed: {e}')


# ── Remote Command Handler ─────────────────────────────────────────

def handle_remote_command(cmd, config):
    """Execute a remote command from admin and ack back to WordPress."""
    import subprocess

    cmd_id = cmd.get('id', '')
    command = cmd.get('command', '')
    logger.info(f'[Remote] Received command: {command} (id: {cmd_id})')

    wp_url = config['wp_url'].rstrip('/')
    api_key = config['api_key']
    ack_url = f'{wp_url}/wp-json/b2b/v1/rpi-command-ack'
    ack_headers = {'X-Print-Key': api_key}

    status = 'done'
    output = ''

    try:
        if command == 'restart_service':
            result = subprocess.run(
                ['sudo', 'systemctl', 'restart', 'dinoco-print'],
                capture_output=True, text=True, timeout=30
            )
            output = result.stdout or result.stderr or 'Service restarted'

        elif command == 'reboot':
            # Ack first before rebooting
            try:
                requests.post(ack_url, json={'cmd_id': cmd_id, 'status': 'done', 'output': 'Rebooting now...'}, headers=ack_headers, timeout=5)
            except Exception:
                pass
            subprocess.run(['sudo', 'reboot'], timeout=5)
            return  # Won't reach here after reboot

        elif command == 'update_client':
            result = subprocess.run(
                ['git', '-C', '/home/dinocoth/rpi-print-server', 'pull', 'origin', 'main'],
                capture_output=True, text=True, timeout=60
            )
            output = result.stdout or result.stderr or 'Updated'
            # Restart after update
            subprocess.Popen(['sudo', 'systemctl', 'restart', 'dinoco-print'])

        elif command == 'get_logs':
            result = subprocess.run(
                ['journalctl', '-u', 'dinoco-print', '--no-pager', '-n', '30', '--output=short-iso'],
                capture_output=True, text=True, timeout=15
            )
            output = result.stdout[-500:] if result.stdout else 'No logs'

        else:
            status = 'error'
            output = f'Unknown command: {command}'

    except subprocess.TimeoutExpired:
        status = 'error'
        output = f'Command timed out: {command}'
    except Exception as e:
        status = 'error'
        output = str(e)

    # Send ack back
    try:
        requests.post(ack_url, json={'cmd_id': cmd_id, 'status': status, 'output': output}, headers=ack_headers, timeout=10)
        logger.info(f'[Remote] Command {command} — {status}: {output[:100]}')
    except Exception as e:
        logger.error(f'[Remote] Ack failed: {e}')


def poll_and_print(config, printer_mgr):
    """Poll WordPress for new print jobs and process them."""
    wp_url = config['wp_url'].rstrip('/')
    api_key = config['api_key']
    url = f'{wp_url}/wp-json/b2b/v1/print-queue'
    headers = {'X-Print-Key': api_key}

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        logger.warning(f'Poll failed: {e}')
        return 0

    # Handle test print job
    test_job = data.get('test_job')
    if test_job:
        process_test_job(test_job, config, printer_mgr)

    # V.25: Handle remote commands from admin
    remote_cmds = data.get('remote_commands', [])
    for cmd in remote_cmds:
        handle_remote_command(cmd, config)

    if not data.get('success') or not data.get('jobs'):
        # Only reset to idle if enough time passed since last job (60s)
        try:
            if os.path.exists(STATE_FILE):
                with open(STATE_FILE, 'r') as f:
                    st = json.load(f)
                if st.get('state') in ('done', 'error') and time.time() - st.get('updated_at', 0) > 60:
                    write_state('idle')
            else:
                write_state('idle')
        except Exception:
            write_state('idle')
        return 0

    jobs = data['jobs']
    logger.info(f'Got {len(jobs)} print job(s)')

    # Play notification sound
    play_sound(config)

    processed = 0
    for job in jobs:
        tid = job['ticket_id']
        status, message, details = process_job_with_retry(job, config, printer_mgr)

        # Send ack back to WordPress
        ack_url = f'{wp_url}/wp-json/b2b/v1/print-ack'
        now = datetime.now(timezone(timedelta(hours=7)))
        ack_body = {
            'ticket_id': tid,
            'status': status,
            'message': message,
            'printed_at': now.isoformat(),
            'details': details,
        }
        try:
            ack_resp = requests.post(ack_url, json=ack_body, headers=headers, timeout=15)
            ack_resp.raise_for_status()
            logger.info(f'  Ack #{tid}: {status}')
        except Exception as e:
            logger.error(f'  Ack failed #{tid}: {e}')

        processed += 1

    return processed


# ── Heartbeat ──────────────────────────────────────────────────────

def get_system_info():
    """Gather RPi system info for heartbeat."""
    import subprocess

    def _cmd(args):
        try:
            return subprocess.check_output(args, text=True, timeout=5).strip()
        except Exception:
            return ''

    hostname = _cmd(['hostname'])
    ip_raw = _cmd(['hostname', '-I'])
    ip = ip_raw.split()[0] if ip_raw else ''
    uptime = _cmd(['uptime', '-p'])
    disk_raw = _cmd(['df', '-h', '/'])
    disk = disk_raw.split('\n')[-1].split()[4] if disk_raw and len(disk_raw.split('\n')) > 1 else ''

    cpu_temp = _cmd(['cat', '/sys/class/thermal/thermal_zone0/temp'])
    if cpu_temp and cpu_temp.isdigit():
        cpu_temp = f'{int(cpu_temp) / 1000:.1f}°C'
    else:
        cpu_temp = 'N/A'

    return {
        'hostname': hostname,
        'ip': ip,
        'cpu_temp': cpu_temp,
        'uptime': uptime,
        'disk_usage': disk,
    }


def send_heartbeat(config, printer_mgr=None):
    """Send device status to WordPress, including CUPS printer details."""
    wp_url = config['wp_url'].rstrip('/')
    api_key = config['api_key']
    url = f'{wp_url}/wp-json/b2b/v1/print-heartbeat'
    headers = {'X-Print-Key': api_key}

    try:
        info = get_system_info()
        # Use CUPS API for detailed printer status instead of lpstat
        if printer_mgr:
            info['printers'] = printer_mgr.get_printer_status()
        resp = requests.post(url, json=info, headers=headers, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        logger.debug(f'Heartbeat failed: {e}')


# ── Pusher WebSocket ───────────────────────────────────────────────

def start_pusher_listener(config, printer_mgr):
    """Start Pusher WebSocket listener for real-time print triggers.
    Falls back to polling if pysher not installed or connection fails.
    Returns True if Pusher is running, False if should use polling."""

    pusher_key = config.get('pusher_key', '')
    pusher_cluster = config.get('pusher_cluster', 'ap1')

    if not pusher_key:
        logger.info('[Pusher] No pusher_key in config — using polling mode')
        return False

    try:
        import pysher
    except ImportError:
        logger.warning('[Pusher] pysher not installed — pip install pysher — using polling mode')
        return False

    pusher_connected = {'value': False}

    def on_connect(data):
        logger.info('[Pusher] Connected! Subscribing to dinoco-print channel')
        channel = pusher_client.subscribe('dinoco-print')
        channel.bind('new-job', on_new_job)
        channel.bind('test-print', on_test_print)
        pusher_connected['value'] = True

    def on_disconnect(data):
        logger.warning('[Pusher] Disconnected — will auto-reconnect')
        pusher_connected['value'] = False

    def on_error(data):
        logger.error(f'[Pusher] Error: {data}')

    def on_new_job(data):
        """Triggered when WordPress queues a new print job."""
        logger.info(f'[Pusher] New print job received: {data}')
        try:
            job_data = json.loads(data) if isinstance(data, str) else data
            # Immediately poll WordPress for the actual job data
            poll_and_print(config, printer_mgr)
        except Exception as e:
            logger.error(f'[Pusher] Error processing job: {e}')

    def on_test_print(data):
        """Triggered for test print from admin dashboard."""
        logger.info(f'[Pusher] Test print triggered: {data}')
        try:
            poll_and_print(config, printer_mgr)
        except Exception as e:
            logger.error(f'[Pusher] Test print error: {e}')

    try:
        pusher_client = pysher.Pusher(pusher_key, cluster=pusher_cluster)
        pusher_client.connection.bind('pusher:connection_established', on_connect)
        pusher_client.connection.bind('pusher:connection_failed', on_error)
        pusher_client.connection.bind('pusher:disconnected', on_disconnect)
        pusher_client.connect()
        logger.info(f'[Pusher] Connecting to cluster {pusher_cluster}...')

        # Wait up to 10 seconds for connection
        for _ in range(20):
            if pusher_connected['value']:
                return True
            time.sleep(0.5)

        logger.warning('[Pusher] Connection timeout — falling back to polling')
        return False
    except Exception as e:
        logger.error(f'[Pusher] Failed to start: {e} — falling back to polling')
        return False


# ── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='DINOCO B2B Print Client')
    parser.add_argument('--daemon', action='store_true', help='Run as daemon (WebSocket + polling fallback)')
    parser.add_argument('--poll-only', action='store_true', help='Force polling mode (no WebSocket)')
    args = parser.parse_args()

    config = load_config()
    logger.info(f'DINOCO Print Client starting — WP: {config["wp_url"]}')

    # Import printer manager
    from printer import PrinterManager
    printer_mgr = PrinterManager(config)

    # List available printers
    printers = printer_mgr.list_printers()
    logger.info(f'Available printers: {printers}')

    if args.daemon:
        # Try Pusher WebSocket first (unless --poll-only)
        pusher_active = False
        if not args.poll_only:
            pusher_active = start_pusher_listener(config, printer_mgr)

        if pusher_active:
            logger.info('🟢 WebSocket mode — real-time print via Pusher (polling every 30s as safety net)')

        base_interval = config.get('poll_interval', 10)
        # If Pusher is active, poll less frequently (safety net only)
        poll_interval = 30 if pusher_active else base_interval
        max_interval = 60 if pusher_active else 30
        current_interval = poll_interval
        idle_count = 0
        logger.info(f'Daemon mode — polling every {poll_interval}s' + (' (WebSocket primary)' if pusher_active else ' (polling primary)'))

        # Screen sleep schedule (21:00 - 10:00 Bangkok time)
        screen_sleep_start = config.get('screen_sleep_start', 21)  # 21:00
        screen_sleep_end = config.get('screen_sleep_end', 10)      # 10:00
        _screen_is_off = False

        def _check_screen_sleep():
            nonlocal _screen_is_off
            bkk = timezone(timedelta(hours=7))
            hour = datetime.now(bkk).hour
            # 21:00-23:59 or 00:00-09:59 = sleep
            should_sleep = hour >= screen_sleep_start or hour < screen_sleep_end
            if should_sleep and not _screen_is_off:
                logger.info(f'Screen sleep — turning off display ({hour}:00 Bangkok)')
                try:
                    os.system('vcgencmd display_power 0 2>/dev/null || xset dpms force off 2>/dev/null || wlr-randr --output HDMI-A-1 --off 2>/dev/null')
                except Exception as e:
                    logger.debug(f'Screen off error: {e}')
                _screen_is_off = True
            elif not should_sleep and _screen_is_off:
                logger.info(f'Screen wake — turning on display ({hour}:00 Bangkok)')
                try:
                    os.system('vcgencmd display_power 1 2>/dev/null || xset dpms force on 2>/dev/null || wlr-randr --output HDMI-A-1 --on 2>/dev/null')
                except Exception as e:
                    logger.debug(f'Screen on error: {e}')
                _screen_is_off = False

        last_heartbeat = 0
        while running:
            _check_screen_sleep()
            try:
                processed = poll_and_print(config, printer_mgr)
                if processed and processed > 0:
                    idle_count = 0
                    current_interval = poll_interval
                else:
                    idle_count += 1
                    if idle_count >= 6:
                        current_interval = min(current_interval + base_interval, max_interval)
            except Exception as e:
                logger.error(f'Unexpected error: {e}')

            # Send heartbeat every 25 seconds
            now_ts = time.time()
            if now_ts - last_heartbeat >= 25:
                last_heartbeat = now_ts
                try:
                    send_heartbeat(config, printer_mgr)
                except Exception as e:
                    logger.debug(f'Heartbeat error: {e}')

            # Sleep in small increments for responsive shutdown
            for _ in range(current_interval * 2):
                if not running:
                    break
                time.sleep(0.5)
    else:
        # Single run
        count = poll_and_print(config, printer_mgr)
        logger.info(f'Done — processed {count} job(s)')


if __name__ == '__main__':
    main()
