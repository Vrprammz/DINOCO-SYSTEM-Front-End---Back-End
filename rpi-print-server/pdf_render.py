"""PDF rendering helpers — Jinja2 template + WeasyPrint HTML→PDF.

V.1.0 (2026-04-29) — extracted from print_client.py to fix:
  "signal only works in main thread of the main interpreter"
when dashboard.py (Flask request handler thread) imports print_client.py.
print_client.py registers signal.signal(SIGINT/SIGTERM) at module load for
daemon mode → fails when imported from non-main thread.

This module has NO signal handlers — safe to import from any thread.
print_client.py daemon imports from here too (single source of truth).
"""

import os
import tempfile

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')

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


def html_to_pdf(html_string, width_mm=None, height_mm=None, margin_mm=0):
    """Convert HTML string to a temporary PDF file path."""
    page_css = None
    if width_mm and height_mm:
        page_css = CSS(string=f'@page {{ size: {width_mm}mm {height_mm}mm; margin: {margin_mm}mm; }}')

    tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    tmp.close()

    HTML(string=html_string).write_pdf(
        tmp.name,
        stylesheets=[page_css] if page_css else None
    )
    return tmp.name
