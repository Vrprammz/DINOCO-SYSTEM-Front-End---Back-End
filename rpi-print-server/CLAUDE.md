# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DINOCO B2B Smart Order System — a Raspberry Pi-based print server that polls a WordPress REST API for B2B order print jobs, renders invoices/labels/picking lists as PDFs, and dispatches them to A4 and thermal printers. Includes a Flask dashboard and touchscreen kiosk UI for warehouse operations.

## Running the Services

```bash
cd rpi-print-server
source venv/bin/activate

# Print polling daemon
python3 print_client.py --daemon

# Flask dashboard (default port 5555)
python3 dashboard.py --port 5555

# Production (systemd on Raspberry Pi)
sudo systemctl start dinoco-print
sudo systemctl start dinoco-dashboard
journalctl -u dinoco-print -f   # live logs
```

## Installation

```bash
cd rpi-print-server
sudo bash install.sh   # installs CUPS, Python venv, Thai fonts, systemd services
cp config.example.json config.json  # then edit with real values
```

## Architecture

All active code lives in `rpi-print-server/`. There is no test suite or linter configured.

### Core Python Files

- **`print_client.py`** — Polling daemon. Fetches jobs from WordPress (`/wp-json/b2b/v1/print-jobs`), renders HTML→PDF via WeasyPrint, prints via CUPS or USB direct, then ACKs back to WordPress. Runs as a loop with adaptive polling (10s active → 30s idle).
- **`printer.py`** — `PrinterManager` class abstracting CUPS and thermal printers. Handles PDF→TSPL and PDF→ESC-POS conversion for thermal labels. Supports USB direct bypass for XP-420B.
- **`dashboard.py`** — Flask app serving the admin dashboard and kiosk UI. Proxies WordPress API calls and reads shared state from `/tmp/dinoco-print-state.json`.

### Print Job Flow

WordPress API → `print_client.py` polls → renders Jinja2 templates → WeasyPrint PDF → CUPS (A4) or TSPL/ESC-POS (thermal) → ACK back to WordPress.

The dashboard reads job state from a shared `/tmp/dinoco-print-state.json` file written by the print client.

### Templates (`rpi-print-server/templates/`)

- `invoice.html` — A4 invoice with Thai fonts
- `shipping_label.html` — 100×180mm thermal label with barcode/QR
- `picking_list.html` / `picking_list_thermal.html` — A4 and thermal picking lists
- `dashboard.html` — Admin web UI
- `kiosk.html` — 480×320 touchscreen UI (3 tabs: Packing KPIs, Pipeline, System)

### Key Dashboard API Routes

All routes require `X-Print-Key` header or `?key=` query param matching `config.json` api_key.

- `POST /api/test-print` — test print
- `POST /api/reprint` — re-queue a print job
- `POST /api/accept-order` — accept checking_stock order
- `POST /api/flash-ready` — call courier for pickup
- `POST /api/flash-box-packed` — mark box packed
- `POST /api/flash-ship-packed` — ship packed boxes
- `GET /api/wp-summary` — cached WordPress dashboard data

## Configuration

`config.json` (gitignored) — copy from `config.example.json`. Key fields:

- `wp_url` / `api_key` — WordPress endpoint and auth key
- `printer_invoice` / `printer_label` — CUPS printer names
- `label_thermal` / `label_thermal_protocol` — thermal mode (`tspl` or `escpos`)
- `label_usb_direct` — optional USB vendor/product IDs for XP-420B bypass
- `poll_interval` — seconds between polls (default 10)

## Dependencies

Python deps in `requirements.txt`: requests, weasyprint, flask, pycups, pyusb, qrcode, segno, python-barcode, jinja2.

System deps (installed by `install.sh`): CUPS, poppler-utils (pdftoppm), Thai fonts (fonts-sarabun, fonts-noto-cjk), ALSA utils.

## Security Notes

- API key must not be committed to git (`config.json` is gitignored)
- Dashboard commands use `subprocess.run()` with explicit arg lists to avoid shell injection
- Dashboard auth is via shared API key header — no per-user auth
