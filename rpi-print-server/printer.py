"""
DINOCO B2B — CUPS Printer Wrapper V.2.3
Handles printing PDFs to configured CUPS printers.
For thermal label printers: converts PDF → image → TSPL or ESC/POS raster.
XP-420B: sends TSPL via USB directly (pyusb) since usblp driver doesn't claim it.

V.2.2 — Configurable GAP + DIRECTION for TSPL
  - GAP and DIRECTION read from config (no more hardcode)
  - GAP 2mm default for pre-cut 100x180mm labels (was 0mm — caused cumulative feed drift)
  - DIRECTION configurable (default 1 = bottom-to-top)

V.2.1 — UsbSession + TSPL Status Query
  - UsbSession: keep USB connection open for multiple prints in one order
  - TSPL status query via IN endpoint (busy-wait instead of blind sleep)
  - Eliminates USB re-enumeration between documents (root cause of errno 32/110)

V.2.0 — Page break + auto-cut between Picking List and Labels
  - TSPL: CUT command after each page (auto-cutter)
  - ESC/POS: GS V 1 (partial cut) after each page instead of only at end
"""

import cups
import os
import struct
import subprocess
import tempfile
import logging

logger = logging.getLogger('dinoco-print')

# ── USB Session (persistent connection) ───────────────────────────

class UsbSession:
    """Keep USB connection open for multiple prints in one order.
    Eliminates re-enumeration between documents (root cause of errno 32/110).
    Supports TSPL status query via IN endpoint for busy-wait instead of blind sleep.
    """

    def __init__(self, vendor_id, product_id):
        self.vid = vendor_id
        self.pid = product_id
        self.dev = None
        self.ep_out = None
        self.ep_in = None

    def open(self):
        import usb.core, usb.util
        self.dev = usb.core.find(idVendor=self.vid, idProduct=self.pid)
        if self.dev is None:
            raise RuntimeError(f'USB device {self.vid:#06x}:{self.pid:#06x} not found')
        try:
            if self.dev.is_kernel_driver_active(0):
                self.dev.detach_kernel_driver(0)
        except Exception:
            pass

        # Retry set_configuration
        import time
        for attempt in range(5):
            try:
                self.dev.set_configuration()
                break
            except usb.core.USBError as e:
                if attempt < 4 and e.errno in (16, 32, 110):
                    logger.warning(f'USB session open retry {attempt+1}/5: errno {e.errno}')
                    time.sleep(2)
                else:
                    raise

        cfg = self.dev.get_active_configuration()
        intf = cfg[(0, 0)]
        self.ep_out = usb.util.find_descriptor(
            intf,
            custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT,
        )
        self.ep_in = usb.util.find_descriptor(
            intf,
            custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN,
        )
        if self.ep_out is None:
            raise RuntimeError('USB OUT endpoint not found')
        logger.info(f'USB session opened: OUT={self.ep_out.bEndpointAddress:#04x}, IN={"yes" if self.ep_in else "no"}')

    def write(self, data):
        """Send raw data to printer."""
        chunk_size = 64 * 1024
        for offset in range(0, len(data), chunk_size):
            self.ep_out.write(data[offset:offset + chunk_size])

    def wait_ready(self, timeout=30):
        """Poll TSPL status until printer is idle. Returns True if ready."""
        if not self.ep_in:
            # No IN endpoint — fallback to fixed delay
            import time
            time.sleep(1)
            return True

        import time
        start = time.time()
        while time.time() - start < timeout:
            try:
                # TSPL status query: ESC ! ?
                self.ep_out.write(b'\x1b!?\r\n')
                status = self.ep_in.read(1, timeout=2000)
                if len(status) > 0:
                    busy = bool(status[0] & 0x20)  # bit 5 = printing
                    error = bool(status[0] & 0x80)  # bit 7 = error
                    if error:
                        logger.warning(f'Printer error status: {status[0]:#04x}')
                    if not busy:
                        return True
            except Exception:
                pass  # read timeout = printer still processing
            time.sleep(0.3)

        logger.warning(f'Printer not ready after {timeout}s, proceeding anyway')
        return False

    def close(self):
        import usb.util
        if self.dev:
            try:
                usb.util.dispose_resources(self.dev)
            except Exception:
                pass
            self.dev = None
            self.ep_out = None
            self.ep_in = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.close()


# ── USB Direct (pyusb) — single-shot, kept for backward compat ───

def usb_send(vendor_id, product_id, data):
    """Send raw bytes to a USB device using pyusb.

    Args:
        vendor_id: USB vendor ID (e.g. 0x2d37 for Xprinter)
        product_id: USB product ID (e.g. 0x83d7 for XP-420B)
        data: bytes to send
    """
    import time
    import usb.core
    import usb.util

    dev = usb.core.find(idVendor=vendor_id, idProduct=product_id)
    if dev is None:
        raise RuntimeError(
            f'USB device {vendor_id:#06x}:{product_id:#06x} not found. '
            'Check USB connection.'
        )

    # Detach kernel driver if active
    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception as e:
        logger.debug(f'USB kernel driver detach: {e}')

    # Retry set_configuration — handle busy (16), pipe error (32), timeout (110)
    retryable = {16, 32, 110}  # Resource busy, Pipe error, Timeout
    for attempt in range(5):
        try:
            dev.set_configuration()
            break
        except usb.core.USBError as e:
            if attempt < 4 and e.errno in retryable:
                wait = 2 * (attempt + 1)  # 2s, 4s, 6s, 8s
                logger.warning(f'USB error {e.errno}, retry {attempt+1}/5 in {wait}s...')
                usb.util.dispose_resources(dev)
                time.sleep(wait)
                dev = usb.core.find(idVendor=vendor_id, idProduct=product_id)
                if dev is None:
                    raise RuntimeError('USB device lost during retry')
                try:
                    if dev.is_kernel_driver_active(0):
                        dev.detach_kernel_driver(0)
                except Exception:
                    pass
            else:
                raise

    try:
        # Find OUT endpoint
        cfg = dev.get_active_configuration()
        intf = cfg[(0, 0)]
        ep_out = usb.util.find_descriptor(
            intf,
            custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress)
            == usb.util.ENDPOINT_OUT,
        )
        if ep_out is None:
            raise RuntimeError('USB OUT endpoint not found')

        # Send data in chunks (max 64KB per transfer) with retry
        chunk_size = 64 * 1024
        for offset in range(0, len(data), chunk_size):
            chunk = data[offset:offset + chunk_size]
            for wr_attempt in range(3):
                try:
                    ep_out.write(chunk)
                    break
                except usb.core.USBError as we:
                    if wr_attempt < 2 and we.errno in retryable:
                        logger.warning(f'USB write error {we.errno} at offset {offset}, retry {wr_attempt+1}/3 in 3s...')
                        time.sleep(3)
                    else:
                        raise

        logger.info(f'USB direct: sent {len(data)} bytes to {vendor_id:#06x}:{product_id:#06x}')
    finally:
        # Always release USB resources to prevent [Errno 16] Resource busy
        try:
            usb.util.dispose_resources(dev)
        except Exception as e:
            logger.debug(f'USB resource cleanup: {e}')


# ── PDF Conversion ─────────────────────────────────────────────────

def pdf_to_tspl(pdf_path, max_width=832, dpi=203, invert=True, gap_mm=2, direction=1,
                paper_width_mm=100, paper_height_mm=180):
    """Convert a PDF to TSPL bitmap commands for Xprinter XP-420B and similar.

    Args:
        pdf_path: Path to PDF file
        max_width: Max width in dots (832 for 108mm at 203 DPI)
        dpi: Printer resolution (203 DPI for XP-420B)
        invert: Invert bitmap polarity. True for printers where
                bit 0 = print black (XP-420B), False for standard TSPL
                where bit 1 = print black.
        gap_mm: Gap between pre-cut labels in mm (0 for continuous roll,
                2-3 for standard pre-cut 100x180mm labels).
        direction: Print direction (0=top-to-bottom, 1=bottom-to-top).
        paper_width_mm: Physical paper width (used in SIZE command).
        paper_height_mm: Physical paper height (used in SIZE command).

    Returns:
        bytes: TSPL command data ready to send to printer
    """
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmpdir:
        out_prefix = os.path.join(tmpdir, 'page')
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), pdf_path, out_prefix],
            check=True, capture_output=True,
        )

        pages = sorted(f for f in os.listdir(tmpdir) if f.endswith('.png'))
        if not pages:
            raise RuntimeError('pdftoppm produced no output')

        if len(pages) > 1:
            logger.warning(f'PDF has {len(pages)} pages — expected 1 for thermal label. '
                           f'Only printing page 1. Content may overflow.')

        data = bytearray()

        for page_file in pages[:1]:  # Only print first page — prevent blank label
            img = Image.open(os.path.join(tmpdir, page_file))

            # Resize to fit printer width
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)))

            # Convert to 1-bit black/white
            img = img.convert('1')

            width_bytes = (img.width + 7) // 8
            height = img.height

            # TSPL commands — SIZE ใช้ค่าจาก config (กระดาษจริง) ไม่คำนวณจาก pixel
            data += f'SIZE {paper_width_mm} mm, {paper_height_mm} mm\r\n'.encode()
            data += f'GAP {gap_mm} mm, 0 mm\r\n'.encode()
            data += f'DIRECTION {direction},0\r\n'.encode()
            data += b'CLS\r\n'

            # BITMAP x, y, width_bytes, height, mode, data
            # mode 0 = overwrite
            data += f'BITMAP 0,0,{width_bytes},{height},0,'.encode()

            # Build bitmap data row by row
            # Build bitmap: bit 1 = black source pixel, bit 0 = white
            pixels = img.load()
            for y in range(height):
                row = bytearray(width_bytes)  # all 0x00
                for x in range(img.width):
                    if pixels[x, y] == 0:  # Black pixel → set bit
                        row[x // 8] |= (0x80 >> (x % 8))
                # XP-420B and many thermal printers: bit 0 = print black
                # Standard TSPL spec says bit 1 = print black
                # invert=True flips polarity for printers like XP-420B
                if invert:
                    row = bytearray(b ^ 0xFF for b in row)
                data += row

            data += b'\r\nPRINT 1,1\r\n'
            # Auto-cut after each page (supported by XP-420B and similar cutters)
            data += b'CUT\r\n'

    return bytes(data)


def pdf_to_escpos(pdf_path, max_width=576):
    """Convert a PDF to ESC/POS raster image data for thermal printers.

    Args:
        pdf_path: Path to PDF file
        max_width: Max width in dots (576 for 80mm, 384 for 58mm printers)

    Returns:
        bytes: ESC/POS command data ready to send to printer
    """
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmpdir:
        out_prefix = os.path.join(tmpdir, 'page')
        subprocess.run(
            ['pdftoppm', '-png', '-r', '203', pdf_path, out_prefix],
            check=True, capture_output=True,
        )

        pages = sorted(f for f in os.listdir(tmpdir) if f.endswith('.png'))
        if not pages:
            raise RuntimeError('pdftoppm produced no output')

        data = bytearray()
        data += b'\x1b\x40'  # ESC @ — Initialize printer

        for page_file in pages:
            img = Image.open(os.path.join(tmpdir, page_file))

            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)))

            img = img.convert('1')
            width_bytes = (img.width + 7) // 8
            height = img.height
            data += b'\x1d\x76\x30\x00'
            data += struct.pack('<HH', width_bytes, height)

            pixels = img.load()
            for y in range(height):
                row = bytearray(width_bytes)
                for x in range(img.width):
                    if pixels[x, y] == 0:
                        row[x // 8] |= (0x80 >> (x % 8))
                data += row

            data += b'\n'
            # Feed + partial cut after each page (separate each label/picking list)
            data += b'\n\n\n'
            data += b'\x1d\x56\x01'  # GS V 1 — Partial cut

    return bytes(data)


# ── Printer Manager ────────────────────────────────────────────────

class PrinterManager:
    """Manages CUPS printing for invoice (A4) and label (10x15cm) printers."""

    def __init__(self, config):
        self.printer_invoice = config.get('printer_invoice', '')
        self.printer_label = config.get('printer_label', '')
        self.label_thermal = config.get('label_thermal', False)
        self.label_thermal_protocol = config.get('label_thermal_protocol', 'tspl')
        # USB direct mode for printers not supported by usblp/CUPS
        # e.g. XP-420B: {"vendor_id": "0x2d37", "product_id": "0x83d7"}
        self.label_usb_direct = config.get('label_usb_direct', None)
        # TSPL bitmap invert: True for XP-420B (bit 0 = print black)
        self.label_tspl_invert = config.get('label_tspl_invert', True)
        # TSPL GAP (mm between pre-cut labels) and DIRECTION (0=top-down, 1=bottom-up)
        self.label_gap_mm = config.get('label_gap_mm', 2)
        self.label_direction = config.get('label_direction', 1)
        # Physical paper size (for TSPL SIZE command — must match real paper)
        self.label_width_mm = config.get('label_width_mm', 100)
        self.label_height_mm = config.get('label_height_mm', 180)
        self.conn = None

    def _get_conn(self):
        """Get or create CUPS connection."""
        if self.conn is None:
            try:
                self.conn = cups.Connection()
            except Exception as e:
                logger.error(f'CUPS connection failed: {e}')
                raise
        return self.conn

    def list_printers(self):
        """List available CUPS printers."""
        try:
            conn = self._get_conn()
            return list(conn.getPrinters().keys())
        except Exception as e:
            logger.error(f'Cannot list printers: {e}')
            return []

    def print_pdf(self, pdf_path, printer_name, title='DINOCO Print', copies=1):
        """Print a PDF file to a specific CUPS printer."""
        if not printer_name:
            raise ValueError('No printer configured')

        conn = self._get_conn()
        printers = conn.getPrinters()
        if printer_name not in printers:
            available = ', '.join(printers.keys()) or '(none)'
            raise ValueError(f'Printer "{printer_name}" not found. Available: {available}')

        options = {
            'media': 'A4',
            'fit-to-page': 'true',
        }
        if copies > 1:
            options['copies'] = str(copies)

        job_id = conn.printFile(printer_name, pdf_path, title, options)
        logger.info(f'Print job {job_id} sent to {printer_name}: {title}')
        return job_id

    def print_thermal(self, pdf_path, printer_name, title='DINOCO Label'):
        """Print PDF on thermal printer by converting to TSPL or ESC/POS raster.
        Uses USB direct if configured, otherwise falls back to CUPS lp."""
        if not printer_name:
            raise ValueError('No label printer configured')

        protocol = self.label_thermal_protocol
        logger.info(f'Converting PDF to {protocol.upper()} for thermal printer: {title}')

        if protocol == 'tspl':
            raw_data = pdf_to_tspl(pdf_path, max_width=832, invert=self.label_tspl_invert,
                                   gap_mm=self.label_gap_mm, direction=self.label_direction,
                                   paper_width_mm=self.label_width_mm,
                                   paper_height_mm=self.label_height_mm)
        else:
            raw_data = pdf_to_escpos(pdf_path)

        # USB direct mode — bypass CUPS for printers not supported by usblp
        if self.label_usb_direct:
            vid = int(self.label_usb_direct['vendor_id'], 16)
            pid = int(self.label_usb_direct['product_id'], 16)
            usb_send(vid, pid, raw_data)
            logger.info(f'Thermal print ({protocol}) via USB direct to {printer_name}: {title}')
            return

        # Fallback: send via CUPS lp raw
        with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as f:
            f.write(raw_data)
            tmp_path = f.name

        try:
            result = subprocess.run(
                ['lp', '-d', printer_name, '-o', 'raw', tmp_path],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                raise RuntimeError(f'lp failed: {result.stderr}')
            logger.info(f'Thermal print ({protocol}) sent to {printer_name}: {title}')
        finally:
            os.unlink(tmp_path)

    def create_usb_session(self):
        """Create a UsbSession for batch printing. Returns None if not USB direct."""
        if not self.label_usb_direct:
            return None
        vid = int(self.label_usb_direct['vendor_id'], 16)
        pid = int(self.label_usb_direct['product_id'], 16)
        return UsbSession(vid, pid)

    def print_thermal_session(self, pdf_path, usb_session, title='DINOCO Label'):
        """Print PDF via existing USB session (no re-enumerate)."""
        protocol = self.label_thermal_protocol
        logger.info(f'Converting PDF to {protocol.upper()} for thermal printer: {title}')

        if protocol == 'tspl':
            raw_data = pdf_to_tspl(pdf_path, max_width=832, invert=self.label_tspl_invert,
                                   gap_mm=self.label_gap_mm, direction=self.label_direction,
                                   paper_width_mm=self.label_width_mm,
                                   paper_height_mm=self.label_height_mm)
        else:
            raw_data = pdf_to_escpos(pdf_path)

        usb_session.write(raw_data)
        logger.info(f'Thermal print ({protocol}) via USB session: {title}')

    def print_invoice(self, pdf_path, ticket_id):
        """Print A4 invoice on the invoice printer."""
        return self.print_pdf(
            pdf_path, self.printer_invoice,
            title=f'Invoice #{ticket_id}'
        )

    def print_labels(self, pdf_paths, ticket_id):
        """Print shipping labels on the label printer."""
        import time
        printed = 0
        for i, path in enumerate(pdf_paths):
            title = f'Label #{ticket_id} ({i+1}/{len(pdf_paths)})'
            if self.label_thermal:
                # Pause between USB prints to let XP-420B finish cut + feed
                if i > 0 and self.label_usb_direct:
                    time.sleep(3)
                self.print_thermal(path, self.printer_label, title=title)
            else:
                self.print_pdf(path, self.printer_label, title=title)
            printed += 1
        return printed

    def print_picking_list(self, pdf_path, ticket_id):
        """Print picking list on the label printer (XP-420B thermal)."""
        title = f'PickingList #{ticket_id}'
        if self.label_thermal:
            self.print_thermal(pdf_path, self.printer_label, title=title)
            return None
        else:
            printer = self.printer_label or self.printer_invoice
            return self.print_pdf(pdf_path, printer, title=title)

    def get_printer_status(self):
        """Get detailed CUPS printer status including state-reasons."""
        result = []
        try:
            conn = self._get_conn()
            printers = conn.getPrinters()
            for name, info in printers.items():
                state = info.get('printer-state', 0)
                state_map = {3: 'idle', 4: 'printing', 5: 'stopped'}
                status = state_map.get(state, 'unknown')

                reasons = info.get('printer-state-reasons', '')
                if isinstance(reasons, list):
                    reasons = ', '.join(reasons)
                if reasons == 'none':
                    reasons = ''

                result.append({
                    'name': name,
                    'status': status,
                    'state_reasons': reasons,
                })
        except Exception as e:
            logger.error(f'Cannot get printer status: {e}')
        return result
