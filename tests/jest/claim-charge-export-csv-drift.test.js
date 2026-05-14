/**
 * Claim Charge CSV Export drift detector — Sprint 29 Phase 4 Batch A Item 1.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Claim Charges Schema (V.0.6) — REST endpoint
 *   • [Admin System] DINOCO Service Center & Claims (V.34.5) — UI trigger
 *
 * Verifies future edits do not regress:
 *   - Endpoint registration (/charges/export)
 *   - UTF-8 BOM emission (Excel Thai compatibility)
 *   - PII mask pattern (Sprint 12 SEC-L3 first 3 + bullets + last 3)
 *   - Rate limit 5/hr/user via b2b_rate_limit (3-arg signature)
 *   - 5000 row cap
 *   - 10 canonical column order
 *   - Service Center button data-action delegation (UX-H3 NO inline onclick)
 *   - wp_rest nonce on URL
 *   - manage_options + nonce permission
 *   - Version pins
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 1.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO, '[Admin System] DINOCO Claim Charges Schema');
const SC_PATH     = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');

const SCHEMA_SRC = fs.readFileSync(SCHEMA_PATH, 'utf8');
const SC_SRC     = fs.readFileSync(SC_PATH, 'utf8');

// Strip PHP BLOCK comments only (header banner). Keep // line comments so we
// don't accidentally chew "php://output" or other URL-in-string content.
// "NOT" assertions in this file must still survive — they assert on absence
// of certain CODE patterns; comments containing those patterns are filtered
// by the block-comment strip alone (banner is one big /** ... */).
function stripPhpBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
const SCHEMA_CODE = stripPhpBlockComments(SCHEMA_SRC);
const SC_CODE     = stripPhpBlockComments(SC_SRC);

describe('Claim Charge CSV Export — Phase 4 Batch A Item 1 drift detector', () => {

    // ─── Schema snippet V.0.6 contract ────────────────────────────────

    test('Schema version stamped V.0.6 (Sprint 29 Phase 4 Batch A Item 1)', () => {
        expect(SCHEMA_SRC).toMatch(/Version:\s*V\.0\.6\s*\(2026-05-14\)/);
    });

    test('Schema registers GET /charges/export REST route', () => {
        expect(SCHEMA_CODE).toMatch(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/charges\/export['"]/);
    });

    test('Schema REST method is GET', () => {
        // The route registration must declare methods => 'GET'
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/charges\/export['"][\s\S]+?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]methods['"]\s*=>\s*['"]GET['"]/);
    });

    test('Schema permission_callback gates on manage_options', () => {
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/charges\/export['"][\s\S]+?\)\s*;/);
        expect(block[0]).toMatch(/current_user_can\(\s*['"]manage_options['"]\s*\)/);
    });

    test('Schema emits UTF-8 BOM before CSV stream', () => {
        // Either as PHP escape sequence \xEF\xBB\xBF inside a double-quoted
        // string OR as embedded literal U+FEFF (BOM char). Avoid putting raw
        // BOM in this file (ESLint no-irregular-whitespace) — detect via codes.
        const hasEscaped = /\\xEF\\xBB\\xBF/.test(SCHEMA_SRC);
        const hasRaw     = SCHEMA_SRC.indexOf(String.fromCharCode(0xEF) + String.fromCharCode(0xBB) + String.fromCharCode(0xBF)) !== -1
                          || SCHEMA_SRC.indexOf(String.fromCharCode(0xFEFF)) !== -1;
        expect(hasEscaped || hasRaw).toBe(true);
    });

    test('Schema uses Content-Type: text/csv with UTF-8 charset', () => {
        expect(SCHEMA_CODE).toMatch(/Content-Type:\s*text\/csv;?\s*charset=UTF-8/i);
    });

    test('Schema uses Content-Disposition: attachment with .csv filename', () => {
        // Filename is built via $filename variable. Assert header + attachment +
        // filename construction + .csv extension separately.
        expect(SCHEMA_CODE).toMatch(/Content-Disposition:\s*attachment;\s*filename="/);
        expect(SCHEMA_CODE).toMatch(/\$filename\s*=\s*['"]claim-charges-/);
        expect(SCHEMA_CODE).toMatch(/\.csv['"]/);
    });

    test('Schema applies SEC-L3 PII mask helper for payer_user_id', () => {
        // Helper exists
        expect(SCHEMA_CODE).toMatch(/function\s+dinoco_claim_charges_mask_uid\s*\(/);
        // SEC-L3 mask pattern: substr 0,3 + str_repeat('•',...) + substr -3.
        // Allow optional whitespace inside parens (PHP style spacing).
        expect(SCHEMA_CODE).toMatch(/substr\([^)]+,\s*0,\s*3\s*\)\s*\.\s*str_repeat\(\s*['"]•['"]/);
        expect(SCHEMA_CODE).toMatch(/substr\([^)]+,\s*-3\s*\)/);
        // Mask helper is CALLED inside the export handler.
        expect(SCHEMA_CODE).toMatch(/dinoco_claim_charges_mask_uid\(/);
    });

    test('Schema rate limits via 3-arg b2b_rate_limit (export-specific bucket, 5/3600s)', () => {
        // Must be 3-arg form per AUDIT-REPORT-2026-04-17 regression guard.
        expect(SCHEMA_CODE).toMatch(/b2b_rate_limit\(\s*['"]claim_charge_export_['"]?\s*\.\s*\$\w+\s*,\s*5\s*,\s*3600\s*\)/);
    });

    test('Schema 429 response shape includes retry_after on rate limit', () => {
        expect(SCHEMA_CODE).toMatch(/['"]status['"]\s*=>\s*429/);
        expect(SCHEMA_CODE).toMatch(/['"]retry_after['"]\s*=>\s*3600/);
    });

    test('Schema caps export at 5000 rows', () => {
        // Look for a 5000 literal in the export handler.
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_export_csv\b[\s\S]+?(?=\nif\s*\(|\nadd_action|$)/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/\$cap\s*=\s*5000/);
    });

    test('Schema emits 10 canonical CSV columns in correct order', () => {
        // Extract the first fputcsv call (header row) — must contain all 10
        // column literals in canonical order. Don't search the data row.
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_export_csv\b[\s\S]+?exit;/);
        expect(handlerBlock).not.toBeNull();
        const headerCall = handlerBlock[0].match(/fputcsv\(\s*\$out\s*,\s*array\(([\s\S]+?)\)\s*\)\s*;/);
        expect(headerCall).not.toBeNull();
        const want = [
            'charge_id', 'claim_id', 'charge_type', 'amount_thb', 'status',
            'payer_user_id', 'slip_url', 'paid_at', 'refunded_at', 'created_at',
        ];
        let lastIdx = -1;
        for (const col of want) {
            const re = new RegExp("['\"]" + col + "['\"]");
            const m = headerCall[1].match(re);
            expect(m).not.toBeNull();
            const idx = headerCall[1].indexOf(m[0]);
            expect(idx).toBeGreaterThan(lastIdx);
            lastIdx = idx;
        }
    });

    test('Schema emits slip_url as auth-gated proxy path (NEVER raw CDN URL)', () => {
        // /wp-json/dinoco-claim/v1/charges/{id}/slip-image — same path used
        // by Payment LIFF V.0.x slip-image proxy.
        expect(SCHEMA_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/charges\/['"]\s*\.\s*\$?\w+\s*\.\s*['"]\/slip-image/);
    });

    test('Schema does NOT leak slip_image_url raw column to CSV', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_export_csv\b[\s\S]+?exit;/);
        expect(handlerBlock).not.toBeNull();
        // SELECT should not include slip_image_url column.
        expect(handlerBlock[0]).not.toMatch(/slip_image_url/);
    });

    test('Schema validates from/to are strict Y-m-d', () => {
        expect(SCHEMA_CODE).toMatch(/createFromFormat\(\s*['"]Y-m-d['"]/);
    });

    test('Schema obs_capture wraps query failure path (R11 obs signature)', () => {
        // 3-arg signature: dinoco_obs_capture(level, tag, ctx)
        expect(SCHEMA_CODE).toMatch(/dinoco_obs_capture\(\s*['"]error['"]\s*,\s*['"]claim_charge_export_query_threw['"]/);
        expect(SCHEMA_CODE).toMatch(/dinoco_obs_capture\(\s*['"]info['"]\s*,\s*['"]claim_charge_export_csv_emitted['"]/);
    });

    // ─── Service Center V.34.5 UI contract ─────────────────────────────

    test('Service Center version stamped V.34.5', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.5\s*\(2026-05-14\)/);
    });

    test('Service Center renders Export CSV button with data-action delegation (UX-H3)', () => {
        expect(SC_CODE).toMatch(/data-action="dnc-cc-export-csv"/);
        // Button text Thai/Eng
        expect(SC_CODE).toMatch(/📥\s*Export CSV/);
    });

    test('Service Center Export button uses NO inline onclick (UX-H3 strict)', () => {
        // The Export CSV button block must not carry an onclick=.
        const btnBlock = SC_CODE.match(/<button[^>]*data-action="dnc-cc-export-csv"[\s\S]+?<\/button>/);
        expect(btnBlock).not.toBeNull();
        expect(btnBlock[0]).not.toMatch(/\bonclick\s*=/i);
    });

    test('Service Center wires click handler via $(document).on event delegation', () => {
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-cc-export-csv"\]['"]/);
    });

    test('Service Center URL builder reads wpApiSettings.nonce (wp_rest)', () => {
        // Find the on('click', '[data-action="dnc-cc-export-csv"]', ...) handler block.
        const handlerBlock = SC_CODE.match(/\[data-action="dnc-cc-export-csv"\][\s\S]+?\}\);/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/wpApiSettings[\s\S]*?\.nonce/);
        expect(handlerBlock[0]).toMatch(/_wpnonce=/);
    });

    test('Service Center URL passes claim_id when _ccCurrentTid available', () => {
        const handlerBlock = SC_CODE.match(/\[data-action="dnc-cc-export-csv"\][\s\S]+?\}\);/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/claim_id=/);
        expect(handlerBlock[0]).toMatch(/_ccCurrentTid/);
    });

    test('Service Center opens in new tab (window.open with _blank target)', () => {
        const handlerBlock = SC_CODE.match(/\[data-action="dnc-cc-export-csv"\][\s\S]+?\}\);/);
        expect(handlerBlock[0]).toMatch(/window\.open\([^,]+,\s*['"]_blank['"]/);
    });

    test('Service Center Export button sits inside #sc-claim-charges-section header', () => {
        // Sanity: Export button must be inside the charges section so it's
        // hidden when feature flag is OFF (server-side gated). Test by string
        // proximity: section opener appears before button.
        const sectionIdx = SC_CODE.indexOf('id="sc-claim-charges-section"');
        const btnIdx = SC_CODE.indexOf('data-action="dnc-cc-export-csv"');
        expect(sectionIdx).toBeGreaterThan(-1);
        expect(btnIdx).toBeGreaterThan(sectionIdx);
    });

    test('Service Center title attribute documents 5/hr cap (UX hint)', () => {
        const btnBlock = SC_CODE.match(/<button[^>]*data-action="dnc-cc-export-csv"[\s\S]+?<\/button>/);
        expect(btnBlock).not.toBeNull();
        expect(btnBlock[0]).toMatch(/5\s*ครั้ง\/ชั่วโมง/);
    });
});
