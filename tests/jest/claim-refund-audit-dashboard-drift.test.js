/**
 * Claim Refund Audit Dashboard drift detector — Sprint 29 Phase 4 Batch B Item 2.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Claim Charges Schema (V.0.7) — REST endpoint
 *   • [Admin System] DINOCO Service Center & Claims (V.34.6) — admin section
 *
 * Verifies future edits do not regress:
 *   - Endpoint registration (/refund-audit, method GET)
 *   - Filter support (status whitelist + from/to Y-m-d + approver + requester)
 *   - Pagination (page + per_page cap 1..200)
 *   - PII mask helpers (consent_token first 8 + "..." · SEC-L3 uid)
 *   - permission_callback manage_options
 *   - LEFT JOIN charges table
 *   - Derived `state` field (pending|consumed|expired)
 *   - Admin section markup + scoped CSS (.dnc-ra-*)
 *   - Server-side gate via dinoco_claim_payment_enabled
 *   - UX-H3 data-action event delegation (NO inline onclick)
 *   - Version pins
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 2.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO, '[Admin System] DINOCO Claim Charges Schema');
const SC_PATH     = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');

const SCHEMA_SRC = fs.readFileSync(SCHEMA_PATH, 'utf8');
const SC_SRC     = fs.readFileSync(SC_PATH, 'utf8');

function stripPhpBlockComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
const SCHEMA_CODE = stripPhpBlockComments(SCHEMA_SRC);
const SC_CODE     = stripPhpBlockComments(SC_SRC);

describe('Claim Refund Audit Dashboard — Phase 4 Batch B Item 2 drift detector', () => {

    // ─── Schema snippet V.0.7 contract ────────────────────────────────

    test('Schema version stamped V.0.7 (Sprint 29 Phase 4 Batch B Item 2)', () => {
        expect(SCHEMA_SRC).toMatch(/Version:\s*V\.0\.7\s*\(2026-05-14\)/);
    });

    test('Schema registers GET /refund-audit REST route', () => {
        expect(SCHEMA_CODE).toMatch(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/refund-audit['"]/);
    });

    test('Schema REST method is GET', () => {
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/refund-audit['"][\s\S]+?\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]methods['"]\s*=>\s*['"]GET['"]/);
    });

    test('Schema permission_callback gates on manage_options', () => {
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/refund-audit['"][\s\S]+?\)\s*;/);
        expect(block[0]).toMatch(/current_user_can\(\s*['"]manage_options['"]\s*\)/);
    });

    test('Schema route declares filter args (status / from / to / approver / requester / page / per_page)', () => {
        // Span the full route block up to the outer closing `) );` (3 levels deep: args→route→register_rest_route).
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/refund-audit['"][\s\S]+?\)\s*\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]status['"]\s*=>/);
        expect(block[0]).toMatch(/['"]from['"]\s*=>/);
        expect(block[0]).toMatch(/['"]to['"]\s*=>/);
        expect(block[0]).toMatch(/['"]approver['"]\s*=>/);
        expect(block[0]).toMatch(/['"]requester['"]\s*=>/);
        expect(block[0]).toMatch(/['"]page['"]\s*=>/);
        expect(block[0]).toMatch(/['"]per_page['"]\s*=>/);
    });

    test('Schema per_page is capped 1..200', () => {
        const block = SCHEMA_CODE.match(/register_rest_route\s*\(\s*['"]dinoco-claim\/v1['"]\s*,\s*['"]\/refund-audit['"][\s\S]+?\)\s*\)\s*;/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/['"]minimum['"]\s*=>\s*1/);
        expect(block[0]).toMatch(/['"]maximum['"]\s*=>\s*200/);
    });

    test('Schema handler exists', () => {
        expect(SCHEMA_CODE).toMatch(/function\s+dinoco_claim_charges_rest_refund_audit\s*\(/);
    });

    test('Schema validates status whitelist (pending|consumed|expired)', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+?return new WP_REST_Response[\s\S]+?\}\s*\}/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/['"]pending['"]/);
        expect(handlerBlock[0]).toMatch(/['"]consumed['"]/);
        expect(handlerBlock[0]).toMatch(/['"]expired['"]/);
    });

    test('Schema validates from/to are strict Y-m-d', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/createFromFormat\(\s*['"]Y-m-d['"]/);
    });

    test('Schema does LEFT JOIN on charges table', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/LEFT\s+JOIN/i);
    });

    test('Schema masks consent_token via dinoco_claim_charges_mask_token helper', () => {
        // Helper exists
        expect(SCHEMA_CODE).toMatch(/function\s+dinoco_claim_charges_mask_token\s*\(/);
        // Helper is CALLED in the audit handler
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/dinoco_claim_charges_mask_token\(/);
        // Mask format: substr 0,8 + "..."
        expect(SCHEMA_CODE).toMatch(/substr\([^)]+,\s*0,\s*8\s*\)\s*\.\s*['"]\.\.\.['"]/);
    });

    test('Schema masks approver+requester+executor via SEC-L3 mask_uid helper', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        // All three should pass through mask_uid helper
        const requesterMask = /['"]requester['"]\s*=>\s*dinoco_claim_charges_mask_uid\(/;
        const approverMask  = /['"]approver['"]\s*=>\s*dinoco_claim_charges_mask_uid\(/;
        expect(handlerBlock[0]).toMatch(requesterMask);
        expect(handlerBlock[0]).toMatch(approverMask);
    });

    test('Schema derives state field (pending/consumed/expired) per row', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        // Inline derivation logic with consumed/pending/expired branches
        expect(handlerBlock[0]).toMatch(/['"]consumed['"]/);
        expect(handlerBlock[0]).toMatch(/['"]pending['"]/);
        expect(handlerBlock[0]).toMatch(/['"]expired['"]/);
        // Must assign to 'state' key in the items array
        expect(handlerBlock[0]).toMatch(/['"]state['"]\s*=>/);
    });

    test('Schema returns items + meta { total, page, per_page, pages }', () => {
        const handlerBlock = SCHEMA_CODE.match(/function\s+dinoco_claim_charges_rest_refund_audit\b[\s\S]+/);
        expect(handlerBlock[0]).toMatch(/['"]items['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/['"]meta['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/['"]total['"]\s*=>/);
        expect(handlerBlock[0]).toMatch(/['"]pages['"]\s*=>/);
    });

    test('Schema obs_capture uses R11 3-arg signature', () => {
        // info path on success
        expect(SCHEMA_CODE).toMatch(/dinoco_obs_capture\(\s*['"]info['"]\s*,\s*['"]claim_refund_audit_query_ok['"]/);
        // error path on exception
        expect(SCHEMA_CODE).toMatch(/dinoco_obs_capture\(\s*['"]error['"]\s*,\s*['"]claim_refund_audit_(?:count|select)_threw['"]/);
    });

    // ─── Service Center V.34.6 UI contract ─────────────────────────────

    test('Service Center version stamped V.34.6', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.6\s*\(2026-05-14\)/);
    });

    test('Service Center renders #sc-refund-audit-section gated by dinoco_claim_payment_enabled', () => {
        // server-side gate uses same pattern as Charges section.
        const sectionBlock = SC_CODE.match(/<div\s+id="sc-refund-audit-section"[\s\S]+?<\/div>\s*<\/div>/);
        expect(sectionBlock).not.toBeNull();
        expect(sectionBlock[0]).toMatch(/data-enabled="<\?php\s+echo\s+\(int\)\s+get_option\(\s*['"]dinoco_claim_payment_enabled['"]\s*,\s*0\s*\)/);
    });

    test('Service Center renders 4 state filter chips (ทั้งหมด + 3 states)', () => {
        const chipsBlock = SC_CODE.match(/id="dnc-ra-state-chips"[\s\S]+?<\/div>/);
        expect(chipsBlock).not.toBeNull();
        expect(chipsBlock[0]).toMatch(/data-state=""/);
        expect(chipsBlock[0]).toMatch(/data-state="pending"/);
        expect(chipsBlock[0]).toMatch(/data-state="consumed"/);
        expect(chipsBlock[0]).toMatch(/data-state="expired"/);
    });

    test('Service Center renders from/to/approver/requester filter inputs', () => {
        expect(SC_CODE).toMatch(/id="dnc-ra-from"/);
        expect(SC_CODE).toMatch(/id="dnc-ra-to"/);
        expect(SC_CODE).toMatch(/id="dnc-ra-approver"/);
        expect(SC_CODE).toMatch(/id="dnc-ra-requester"/);
    });

    test('Service Center renders pagination controls (prev + next + page-info)', () => {
        expect(SC_CODE).toMatch(/data-action="dnc-ra-prev"/);
        expect(SC_CODE).toMatch(/data-action="dnc-ra-next"/);
        expect(SC_CODE).toMatch(/id="dnc-ra-page-info"/);
    });

    test('Service Center wires click handlers via $(document).on event delegation (UX-H3)', () => {
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-ra-pick-state"\]['"]/);
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-ra-apply"\]['"]/);
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-ra-reset"\]['"]/);
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-ra-prev"\]['"]/);
        expect(SC_CODE).toMatch(/\$\(document\)\.on\(\s*['"]click['"]\s*,\s*['"]\[data-action="dnc-ra-next"\]['"]/);
    });

    test('Service Center NO inline onclick in refund audit section markup (UX-H3 strict)', () => {
        const sectionBlock = SC_CODE.match(/<div\s+id="sc-refund-audit-section"[\s\S]+?<\/div>\s*<\/div>/);
        expect(sectionBlock).not.toBeNull();
        expect(sectionBlock[0]).not.toMatch(/\bonclick\s*=/i);
    });

    test('Service Center exposes scLoadRefundAudit function', () => {
        expect(SC_CODE).toMatch(/function\s+scLoadRefundAudit\s*\(/);
        // Exported from IIFE return
        expect(SC_CODE).toMatch(/scLoadRefundAudit/);
    });

    test('Service Center scLoadRefundAudit called from openManage data-loaded branch', () => {
        // Mirror scLoadFlashList pattern
        expect(SC_CODE).toMatch(/scLoadRefundAudit\(\s*tid\s*\)/);
    });

    test('Service Center fetches /wp-json/dinoco-claim/v1/refund-audit', () => {
        expect(SC_CODE).toMatch(/\/wp-json\/dinoco-claim\/v1\/refund-audit/);
    });

    test('Service Center sends X-WP-Nonce header on refund-audit fetch', () => {
        // _raFetch handler must inject nonce — find _raFetch function body.
        const fetchBlock = SC_CODE.match(/function\s+_raFetch\b[\s\S]+?\}\s*\)\s*;/);
        expect(fetchBlock).not.toBeNull();
        expect(fetchBlock[0]).toMatch(/wpApiSettings/);
        expect(fetchBlock[0]).toMatch(/X-WP-Nonce/);
    });

    test('Service Center renders state badges with scoped CSS classes', () => {
        // CSS class declarations exist
        expect(SC_CODE).toMatch(/\.dnc-ra-state-pending\s*\{/);
        expect(SC_CODE).toMatch(/\.dnc-ra-state-consumed\s*\{/);
        expect(SC_CODE).toMatch(/\.dnc-ra-state-expired\s*\{/);
    });

    test('Service Center default page=1 + per_page=50 in _raFetch', () => {
        const fetchBlock = SC_CODE.match(/function\s+_raFetch\b[\s\S]+?\}\s*\)\s*;/);
        expect(fetchBlock).not.toBeNull();
        expect(fetchBlock[0]).toMatch(/page:\s*_raCurrentPage/);
        expect(fetchBlock[0]).toMatch(/per_page:\s*_raPerPage/);
    });

    test('Service Center _raPerPage initialized to 50', () => {
        expect(SC_CODE).toMatch(/var\s+_raPerPage\s*=\s*50/);
    });

    test('Service Center renders charge_id badge + amount + state in row template', () => {
        // _raRenderList spans until the next "function _raRender" or "$(document).on" call.
        const renderBlock = SC_CODE.match(/function\s+_raRenderList\b[\s\S]+?(?=function\s+_raRenderPagination|\$\(document\)\.on)/);
        expect(renderBlock).not.toBeNull();
        expect(renderBlock[0]).toMatch(/dnc-ra-charge-id/);
        expect(renderBlock[0]).toMatch(/dnc-ra-amount/);
        expect(renderBlock[0]).toMatch(/dnc-ra-state-badge/);
        expect(renderBlock[0]).toMatch(/dnc-ra-token/);
    });

    test('Service Center uses Buddhist year formatter _cfFmtDate for dates', () => {
        const renderBlock = SC_CODE.match(/function\s+_raRenderList\b[\s\S]+?(?=function\s+_raRenderPagination|\$\(document\)\.on)/);
        expect(renderBlock).not.toBeNull();
        expect(renderBlock[0]).toMatch(/_cfFmtDate\(it\.created_at\)/);
    });

    test('Service Center wires aria-selected on chip toggle (a11y)', () => {
        // chip handler must update aria-selected
        const handlerBlock = SC_CODE.match(/\[data-action="dnc-ra-pick-state"\][\s\S]+?\}\);/);
        expect(handlerBlock).not.toBeNull();
        expect(handlerBlock[0]).toMatch(/aria-selected/);
    });

    test('Service Center scoped CSS uses .dnc-claim-refund-audit prefix (NO leakage)', () => {
        expect(SC_CODE).toMatch(/\.dnc-claim-refund-audit\s+\.dnc-ra-/);
    });
});
