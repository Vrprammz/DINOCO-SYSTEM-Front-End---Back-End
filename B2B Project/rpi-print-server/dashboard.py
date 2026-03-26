#!/usr/bin/env python3
"""
DINOCO B2B -- RPi Print Server Dashboard
Web UI for monitoring printers, testing prints, and viewing logs.

Usage:
    python3 dashboard.py                # Run on port 5555
    python3 dashboard.py --port 8080    # Custom port

Access at http://dinocoth.local:5555
"""

import json
import os
import re
import time
import subprocess
import argparse
import tempfile
import functools
from datetime import datetime, timezone, timedelta

import requests as http_requests
from flask import Flask, render_template, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
LOG_PATH = os.path.join(BASE_DIR, 'print_client.log')

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'))


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {}


def require_auth(f):
    """Decorator to require API key authentication."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        config = load_config()
        key = request.headers.get('X-Print-Key') or request.args.get('key')
        if key != config.get('api_key'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


def wp_api_get(url, config):
    """Make authenticated GET request to WordPress API."""
    return http_requests.get(url, headers={'X-Print-Key': config['api_key']}, timeout=15)


def wp_api_post(url, data, config):
    """Make authenticated POST request to WordPress API."""
    return http_requests.post(url, json=data, headers={'X-Print-Key': config['api_key']}, timeout=15)


def run_cmd(args, timeout=5):
    """Run a command safely. Args must be a list."""
    try:
        if isinstance(args, str):
            import shlex
            args = shlex.split(args)
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 'Error: command timed out'
    except Exception as e:
        return f'Error: {e}'


# -- Routes --

@app.route('/')
def index():
    return render_template('dashboard.html')


@app.route('/api/status')
def api_status():
    """Overall system status."""
    config = load_config()

    svc_status = run_cmd(['systemctl', 'is-active', 'dinoco-print']) or 'stopped'
    svc_uptime = run_cmd(
        ['systemctl', 'show', 'dinoco-print', '--property=ActiveEnterTimestamp', '--value']
    )
    cups_status = run_cmd(['systemctl', 'is-active', 'cups']) or 'stopped'

    hostname = run_cmd(['hostname'])
    ip_raw = run_cmd(['hostname', '-I'])
    ip_addr = ip_raw.split()[0] if ip_raw else ''
    uptime = run_cmd(['uptime', '-p'])
    try:
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as _f:
            cpu_temp = _f.read().strip()
    except Exception:
        cpu_temp = ''
    if cpu_temp and cpu_temp.isdigit():
        cpu_temp = f"{int(cpu_temp) / 1000:.1f}C"
    else:
        cpu_temp = 'N/A'

    disk_raw = run_cmd(['df', '-h', '/'])
    disk_usage = disk_raw.split('\n')[-1].split()[4] if disk_raw and len(disk_raw.split('\n')) > 1 else 'N/A'
    now = datetime.now(timezone(timedelta(hours=7)))

    return jsonify({
        'service': {'status': svc_status, 'started_at': svc_uptime},
        'cups': {'status': cups_status},
        'config': {
            'wp_url': config.get('wp_url', ''),
            'poll_interval': config.get('poll_interval', 10),
            'printer_invoice': config.get('printer_invoice', ''),
            'printer_label': config.get('printer_label', ''),
            'sound_enabled': config.get('sound_enabled', True),
        },
        'system': {
            'hostname': hostname,
            'ip': ip_addr,
            'uptime': uptime,
            'cpu_temp': cpu_temp,
            'disk_usage': disk_usage,
        },
        'time': now.strftime('%d/%m/%Y %H:%M:%S'),
    })


@app.route('/api/printers')
def api_printers():
    """List CUPS printers and their status."""
    raw = run_cmd(['lpstat', '-p', '-d'])
    printers = []
    for line in raw.splitlines():
        if line.startswith('printer'):
            parts = line.split()
            name = parts[1] if len(parts) > 1 else 'unknown'
            low = line.lower()
            if 'idle' in low:
                status = 'idle'
            elif 'printing' in low:
                status = 'printing'
            elif 'disabled' in low:
                status = 'disabled'
            else:
                status = 'unknown'
            printers.append({'name': name, 'status': status, 'raw': line})
    return jsonify({'printers': printers})


@app.route('/api/queue')
def api_queue():
    """Current CUPS print queue."""
    raw = run_cmd(['lpstat', '-o'])
    jobs = [line.strip() for line in raw.splitlines() if line.strip()]
    return jsonify({'jobs': jobs, 'count': len(jobs)})


@app.route('/api/logs')
@require_auth
def api_logs():
    """Read recent log lines."""
    lines = min(int(request.args.get('lines', 50)), 500)
    if os.path.exists(LOG_PATH):
        raw = run_cmd(['tail', '-n', str(lines), LOG_PATH])
        source = 'file'
    else:
        raw = run_cmd(['journalctl', '-u', 'dinoco-print', '--no-pager', '-n', str(lines)])
        source = 'journalctl'
    return jsonify({'logs': raw, 'source': source})


@app.route('/api/test-print', methods=['POST'])
@require_auth
def api_test_print():
    """Send a test print to verify printer connectivity."""
    printer = request.json.get('printer', '')
    if not printer:
        return jsonify({'success': False, 'error': 'No printer specified'}), 400
    if not re.match(r'^[A-Za-z0-9_\-]+$', printer):
        return jsonify({'success': False, 'error': 'Invalid printer name'}), 400

    now = datetime.now(timezone(timedelta(hours=7)))
    test_html = f"""<html>
<body style="font-family:sans-serif;padding:20mm;text-align:center">
<h1>DINOCO B2B Print Test</h1><hr>
<p style="font-size:24px">Printer: <strong>{printer}</strong></p>
<p style="font-size:18px">Time: {now.strftime('%d/%m/%Y %H:%M:%S')}</p>
<p style="font-size:18px">Host: {run_cmd(['hostname'])}</p>
<hr>
<p style="color:green;font-size:20px">If you can read this, printing works!</p>
</body></html>"""

    # Convert HTML to PDF before sending to printer
    pdf_tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    pdf_tmp.close()
    try:
        from weasyprint import HTML as WeasyHTML
        WeasyHTML(string=test_html).write_pdf(pdf_tmp.name)
    except Exception as e:
        os.unlink(pdf_tmp.name)
        return jsonify({'success': False, 'message': f'PDF render failed: {e}'})

    lp_result = subprocess.run(
        ['lp', '-d', printer, pdf_tmp.name],
        capture_output=True, text=True, timeout=15
    )
    result = (lp_result.stdout + lp_result.stderr).strip()
    os.unlink(pdf_tmp.name)

    success = 'request id' in result.lower() or not result.startswith('Error')
    return jsonify({'success': success, 'message': result})


@app.route('/api/service/<action>', methods=['POST'])
@require_auth
def api_service(action):
    """Control dinoco-print service (start/stop/restart)."""
    if action not in ('start', 'stop', 'restart'):
        return jsonify({'success': False, 'error': 'Invalid action'}), 400

    result = run_cmd(['sudo', 'systemctl', action, 'dinoco-print'], timeout=10)
    new_status = run_cmd(['systemctl', 'is-active', 'dinoco-print'])
    return jsonify({'success': True, 'message': result, 'status': new_status})


# ── Kiosk Dashboard ────────────────────────────────────────────────

_wp_summary_cache = {'data': None, 'ts': 0}

@app.route('/kiosk')
def kiosk():
    config = load_config()
    return render_template('kiosk.html', api_key=config.get('api_key', ''))

@app.route('/api/wp-summary')
def api_wp_summary():
    """Fetch dashboard summary from WordPress, cached for 15s."""
    now = time.time()
    if _wp_summary_cache['data'] and now - _wp_summary_cache['ts'] < 15:
        return jsonify(_wp_summary_cache['data'])

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        url = f'{wp_url}/wp-json/b2b/v1/rpi-dashboard'
        resp = wp_api_get(url, config)
        resp.raise_for_status()
        data = resp.json()
        _wp_summary_cache['data'] = data
        _wp_summary_cache['ts'] = now
        return jsonify(data)
    except Exception as e:
        # Return cached data if available, even if stale
        if _wp_summary_cache['data']:
            return jsonify(_wp_summary_cache['data'])
        return jsonify({'error': str(e)}), 502

@app.route('/api/print-state')
def api_print_state():
    """Read current print job state from shared state file."""
    state_file = '/tmp/dinoco-print-state.json'
    try:
        if os.path.exists(state_file):
            with open(state_file, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({'state': 'idle'})
    except Exception:
        return jsonify({'state': 'idle'})

@app.route('/api/reprint', methods=['POST'])
@require_auth
def api_reprint():
    """Re-queue a print job via WordPress API."""
    tid = request.json.get('ticket_id') if request.json else None
    if not tid:
        return jsonify({'success': False, 'message': 'Missing ticket_id'}), 400

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/print-requeue/{tid}'
        resp = http_requests.post(url, headers={'X-Print-Key': api_key}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 502

@app.route('/api/accept-order', methods=['POST'])
@require_auth
def api_accept_order():
    """Accept a checking_stock order from kiosk screen."""
    tid = request.json.get('ticket_id') if request.json else None
    if not tid:
        return jsonify({'success': False, 'message': 'Missing ticket_id'}), 400

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/rpi-accept-order'
        resp = http_requests.post(url, json={'ticket_id': tid}, headers={'X-Print-Key': api_key}, timeout=10)
        # Invalidate summary cache so dashboard refreshes immediately
        _wp_summary_cache['ts'] = 0
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 502


@app.route('/api/ticket-lookup/<int:ticket_id>')
def api_ticket_lookup(ticket_id):
    """Lookup ticket info from WordPress for scanner QR code."""
    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/ticket-lookup/{ticket_id}'
        resp = http_requests.get(url, headers={'X-Print-Key': api_key}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 502


@app.route('/api/pno-lookup/<pno>')
def api_pno_lookup(pno):
    """Lookup ticket by Flash PNO tracking number."""
    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/pno-lookup/{pno}'
        resp = http_requests.get(url, headers={'X-Print-Key': api_key}, timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 502


@app.route('/api/flash-ready', methods=['POST'])
@require_auth
def api_flash_ready():
    """Call courier for pickup via WordPress rpi-flash-ready API."""
    tid = request.json.get('ticket_id') if request.json else None
    if not tid:
        return jsonify({'success': False, 'message': 'Missing ticket_id'}), 400

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/rpi-flash-ready'
        resp = http_requests.post(
            url, json={'ticket_id': int(tid)},
            headers={'X-Print-Key': api_key}, timeout=35  # Flash API=30s + overhead
        )
        # Invalidate summary cache so dashboard refreshes immediately
        _wp_summary_cache['ts'] = 0
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 502


@app.route('/api/flash-box-packed', methods=['POST'])
@require_auth
def api_flash_box_packed():
    """V.37: Mark individual box as packed via PNO scan."""
    pno = request.json.get('pno') if request.json else None
    if not pno:
        return jsonify({'success': False, 'message': 'Missing pno'}), 400

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/rpi-flash-box-packed'
        resp = http_requests.post(
            url, json={'pno': pno},
            headers={'X-Print-Key': api_key}, timeout=35
        )
        _wp_summary_cache['ts'] = 0
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 502


@app.route('/api/flash-ship-packed', methods=['POST'])
@require_auth
def api_flash_ship_packed():
    """V.37: Ship only packed boxes (partial shipment after timeout)."""
    tid = request.json.get('ticket_id') if request.json else None
    if not tid:
        return jsonify({'success': False, 'message': 'Missing ticket_id'}), 400

    config = load_config()
    try:
        wp_url = config.get('wp_url', '').rstrip('/')
        api_key = config.get('api_key', '')
        url = f'{wp_url}/wp-json/b2b/v1/flash-ship-packed'
        resp = http_requests.post(
            url, json={'ticket_id': int(tid)},
            headers={'X-Print-Key': api_key}, timeout=35
        )
        _wp_summary_cache['ts'] = 0
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 502


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='DINOCO Print Dashboard')
    parser.add_argument('--port', type=int, default=5555)
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()

    print(f'DINOCO Print Dashboard: http://0.0.0.0:{args.port}')
    app.run(host=args.host, port=args.port, debug=False)
