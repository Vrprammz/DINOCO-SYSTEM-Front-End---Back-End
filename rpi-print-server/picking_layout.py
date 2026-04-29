"""Picking list pagination + layout constants — XP-420B safety-aware.

V.1.0 (2026-04-29) — extracted from print_client.py for test reuse.

Constants account for XP-420B feed roller grip zone + cut clearance.
Without these safety zones, content prints to physical edges → paper drop /
cumulative drift across 5+ labels → wrong page breaks / clipped content.

References:
- printer.py V.2.2 — GAP 2mm pre-cut labels (was 0mm — caused cumulative feed drift)
- print_client.py V.2.0+ — BATCH MODE single TSPL stream (no backfeed)
"""

# Page geometry (matches config.json label_width_mm × label_height_mm = 100×180)
PAGE_W = 100
PAGE_H = 180

# XP-420B safety zones (V.42.2 NEW — Phase 2.1 V3)
TOP_SAFETY_MM = 4        # feed roller grip zone — prevent paper drop
BOTTOM_SAFETY_MM = 5     # cut clearance + drift buffer (4 labels of error tolerance)

# Existing reservations (do not change without regression test)
HEADER_MM = 38           # logo + ticket info + qr
FOOTER_NORMAL_MM = 12    # page number row
FOOTER_LAST_MM = 45      # totals + recipient address (last page only)

# Computed usable space per page
USABLE_NORMAL = PAGE_H - TOP_SAFETY_MM - HEADER_MM - FOOTER_NORMAL_MM - BOTTOM_SAFETY_MM  # 121mm
USABLE_LAST   = PAGE_H - TOP_SAFETY_MM - HEADER_MM - FOOTER_LAST_MM   - BOTTOM_SAFETY_MM  # 88mm


def estimate_item_mm(item):
    """Content-aware item height (mm). Matches picking_list_thermal.html layout V.2.3+.

    Returns:
        int: estimated height in mm

    Layout per item:
        - Base row (SKU + name + qty + box count): 8mm
        - Optional meta-row (pack badge + box chip combined): +5mm if pack_mode!=auto OR box_template
        - Per-child indented row: +8mm each (DD-3 hierarchy)
    """
    h = 8  # base: SKU + name + qty + box count (1 line)
    pm = item.get('pack_mode', 'auto') or 'auto'
    has_extras = (pm != 'auto') or bool(item.get('box_template_code'))
    if has_extras:
        h += 5  # combined meta-row (pack badge + box chip)
    h += 8 * len(item.get('children', []) or [])
    return h


def paginate(items):
    """Split items into pages respecting USABLE_NORMAL + USABLE_LAST budgets.

    Args:
        items: list of item dicts

    Returns:
        list[list[item]]: pages — each is a list of items
    """
    pages = []
    current_page = []
    current_mm = 0

    for it in items:
        item_mm = estimate_item_mm(it)
        if current_page and (current_mm + item_mm) > USABLE_NORMAL:
            pages.append(current_page)
            current_page = []
            current_mm = 0
        current_page.append(it)
        current_mm += item_mm

    if current_page:
        pages.append(current_page)

    # Last page has bigger footer (totals + address) — check fit + overflow if needed
    if pages:
        last = pages[-1]
        last_mm = sum(estimate_item_mm(it) for it in last)
        if last_mm > USABLE_LAST and len(last) > 1:
            overflow = last.pop()
            pages.append([overflow])

    return pages


def count_boxes_for_item(item):
    """pack_mode-aware Flash PNO count per item. Matches picking_list template logic.

    Args:
        item: dict with qty, boxes_per_unit, units_per_box, pack_mode

    Returns:
        int: number of Flash PNOs (and shipping labels) needed
    """
    pm = item.get('pack_mode', 'auto')
    bpu = int(item.get('boxes_per_unit', 1) or 1)
    upb = int(item.get('units_per_box', 1) or 1)
    qty = int(item.get('qty', 0) or 0)

    if pm == 'bulk_pack' and upb > 1:
        return (qty + upb - 1) // upb  # ceiling division
    elif pm == 'multi_box' and bpu > 1:
        return qty * bpu
    elif pm == 'assembled_set':
        return qty
    return qty * bpu  # single_box / auto / unknown fallback


def total_boxes(items):
    """Sum of count_boxes_for_item across all items."""
    return sum(count_boxes_for_item(it) for it in items)
