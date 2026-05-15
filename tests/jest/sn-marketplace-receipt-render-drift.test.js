/**
 * Drift detector — Phase 6 W19+ marketplace receipt HTML render (V.0.50).
 *
 * Closes "Receipt PDF rendering deferred to W17" stub. Non-VAT บัญชีบุคคล
 * scope (boss decision 2026-05-15) → plain ใบเสร็จธรรมดา HTML, browser-
 * printable, no GD/PDF library dependency.
 */

const fs = require('fs');
const path = require('path');

const SN_REST = path.join(__dirname, '..', '..', '[System] DINOCO SN REST API');

describe('SN marketplace receipt render — Phase 6 W19+ (V.0.50)', () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(SN_REST, 'utf8');
  });

  test('render route registered alongside /receipt', () => {
    expect(content).toMatch(/\/marketplace\/\(\?P<id>\\d\+\)\/receipt\/render/);
    expect(content).toMatch(/'callback'\s*=>\s*'dinoco_sn_rest_marketplace_receipt_render'/);
  });

  test('render handler defined with function_exists guard', () => {
    expect(content).toMatch(/function_exists\(\s*'dinoco_sn_rest_marketplace_receipt_render'\s*\)/);
    expect(content).toMatch(/function\s+dinoco_sn_rest_marketplace_receipt_render\s*\(\s*\$req\s*\)/);
  });

  test('owner gate via user_id match + admin bypass', () => {
    const fn = content.match(/dinoco_sn_rest_marketplace_receipt_render\s*\(\s*\$req\s*\)\s*\{[\s\S]{0,5000}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/\(int\)\s*\$ext->user_id\s*!==\s*\$user_id\s*&&\s*!\s*current_user_can\(\s*'manage_options'\s*\)/);
  });

  test('paid-only gate (422 on pending/rejected)', () => {
    expect(content).toMatch(/\$ext->payment_status\s*!==\s*'paid'[\s\S]{0,200}status_header\(\s*422\s*\)/);
  });

  test('Content-Type text/html header + exit (not JSON)', () => {
    expect(content).toMatch(/header\(\s*'Content-Type:\s*text\/html;\s*charset=utf-8'\s*\)/);
  });

  test('non-VAT plain receipt — emits ใบเสร็จธรรมดา in rendered HTML body', () => {
    // Scope to actual function body (post-docblock) by matching from
    // `function dinoco_sn_rest_marketplace_receipt_render` onward.
    const bodyMatch = content.match(/function\s+dinoco_sn_rest_marketplace_receipt_render[\s\S]{0,8000}/);
    expect(bodyMatch).toBeTruthy();
    expect(bodyMatch[0]).toMatch(/ใบเสร็จธรรมดา/);
    // Handler body must NOT emit tax-invoice / VAT line items
    expect(bodyMatch[0]).not.toMatch(/<.*>ใบกำกับภาษี<\/|VAT 7%[^"]*<\/div>/);
  });

  test('stub URL removed from /receipt JSON endpoint', () => {
    expect(content).not.toMatch(/render-stub/);
    expect(content).not.toMatch(/Receipt PDF rendering deferred to W17/);
  });

  test('JSON endpoint now points at /receipt/render', () => {
    expect(content).toMatch(/\/marketplace\/'\s*\.\s*\$extension_id\s*\.\s*'\/receipt\/render/);
  });

  test('print button + @media print rules for browser PDF save', () => {
    expect(content).toMatch(/window\.print\(\)/);
    expect(content).toMatch(/@media print/);
  });

  test('version header bumped to V.0.50', () => {
    expect(content).toMatch(/Version: V\.0\.50.*marketplace receipt/);
  });

  test('V.0.51 logo branding — 3-tier resolver chain', () => {
    // Resolves via dinoco_brand_logo_url('dark') → b2b_get_logo_url() → hardcoded URL.
    const fn = content.match(/function\s+dinoco_sn_rest_marketplace_receipt_render[\s\S]{0,8000}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/dinoco_brand_logo_url\(\s*'dark'\s*\)/);
    expect(fn[0]).toMatch(/b2b_get_logo_url\(\)/);
    expect(fn[0]).toMatch(/dinoco\.in\.th\/wp-content\/uploads\/2026\/02\/logodnc\.png/);
  });

  test('V.0.51 logo emitted in HTML brand strip + esc_url sanitization', () => {
    const fn = content.match(/function\s+dinoco_sn_rest_marketplace_receipt_render[\s\S]{0,8000}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/\$esc_logo\s*=\s*esc_url\(\s*\$brand_logo\s*\)/);
    expect(fn[0]).toMatch(/<img src="' \. \$esc_logo \. '"/);
    expect(fn[0]).toMatch(/'<div class="brand">'/);
  });

  test('V.0.51 version header bumped', () => {
    expect(content).toMatch(/Version: V\.0\.51.*Receipt branding.*DINOCO logo/);
  });
});
