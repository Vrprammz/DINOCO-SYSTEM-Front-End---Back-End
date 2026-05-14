/**
 * Claim Bank Settings drift detector — Sprint 9 Phase 1 Task 1.9
 *
 * Pins the foundation shipped in Service Center V.33.0 (DB_ID 27):
 *   - Helper `dinoco_claim_bank_resolve($use_walkin)` defined with 3-tier fallback
 *   - Helper `dinoco_claim_bank_code_whitelist()` defined with Slip2Go canonical codes
 *   - Helper `dinoco_claim_bank_validate($payload, $bucket)` defined with all 5 rules
 *   - Helper `dinoco_claim_bank_field_keys($bucket)` defined
 *   - Shortcode `[dinoco_claim_bank_settings]` registered (admin-only)
 *   - 3 REST routes registered with manage_options permission + nonce
 *   - One-time migration hook on admin_init with idempotency flag
 *   - Dual-channel audit log: dinoco_audit_log + dinoco_flag_audit_log (both function_exists guarded)
 *   - Module Registry self-registration
 *   - Cross-snippet refs use [#NNNN] format (no DB_ID drift detector false-positive)
 *   - Service Center version bumped to V.33.0
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §6.4 V.2.3
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SC = fs.readFileSync(path.join(REPO, '[Admin System] DINOCO Service Center & Claims'), 'utf8');

describe('Claim Bank Settings — Sprint 9 Phase 1 Task 1.9 drift detector', () => {

    // ─── Version + DB_ID integrity ────────────────────────────────────

    test('Service Center version bumped to V.33.0', () => {
        expect(SC).toMatch(/Version: V\.33\.0 \(2026-05-13\)/);
    });

    test('Service Center DB_ID still 27 (unchanged)', () => {
        expect(SC).toMatch(/DB_ID:\s*27\b/);
    });

    test('Sprint 9 header documents Phase 1 Task 1.9 scope', () => {
        expect(SC).toMatch(/Sprint 9 Phase 1 Task 1\.9: Claim Bank Settings/);
        // Phase 1 status note — ALL Phase 1 done after this sprint
        expect(SC).toMatch(/Phase 1 status after Sprint 9/);
    });

    // ─── Cross-snippet references use [#NNNN] format ──────────────────

    test('cross-snippet refs use [#NNNN] not (DB_ID NNNN) to avoid drift detector false-positive', () => {
        // Audit Log [#1187] + Flag Audit Log [#1193] referenced in V.33.0 header
        expect(SC).toMatch(/Audit Log \[#1187\]/);
        expect(SC).toMatch(/Flag Audit Log \[#1193\]/);
    });

    // ─── Helpers defined ──────────────────────────────────────────────

    test('dinoco_claim_bank_code_whitelist() function defined', () => {
        expect(SC).toMatch(/function\s+dinoco_claim_bank_code_whitelist\s*\(\s*\)/);
    });

    test('whitelist contains canonical Slip2Go bank codes (004 KBANK, 014 SCB, 002 BBL)', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_code_whitelist\s*\(\s*\)\s*\{[\s\S]*?\n\s*\}\s*\}/);
        expect(m).not.toBeNull();
        const body = m[0];
        expect(body).toMatch(/'002'\s*=>\s*'Bangkok Bank'/);
        expect(body).toMatch(/'004'\s*=>\s*'KBANK'/);
        expect(body).toMatch(/'014'\s*=>\s*'SCB'/);
    });

    test('dinoco_claim_bank_field_keys($bucket) defined with options + constants prefixes', () => {
        expect(SC).toMatch(/function\s+dinoco_claim_bank_field_keys\s*\(\s*\$bucket/);
        expect(SC).toMatch(/'dinoco_claim_walkin_bank_'/);
        expect(SC).toMatch(/'dinoco_claim_bank_'/);
        expect(SC).toMatch(/'DINOCO_CLAIM_WALKIN_BANK_'/);
        expect(SC).toMatch(/'DINOCO_CLAIM_BANK_'/);
    });

    test('dinoco_claim_bank_resolve($use_walkin = false) defined with 3-tier semantics', () => {
        expect(SC).toMatch(/function\s+dinoco_claim_bank_resolve\s*\(\s*\$use_walkin\s*=\s*false\s*\)/);
        // Tier 1 → wp_options → if empty, Tier 2 → constants → if empty, Tier 3 → sentinel
        expect(SC).toMatch(/'no_claim_bank_configured'/);
        // Walk-in fallback to default
        expect(SC).toMatch(/walkin_via_default/);
    });

    test('dinoco_claim_bank_read_bucket() internal helper defined', () => {
        expect(SC).toMatch(/function\s+dinoco_claim_bank_read_bucket\s*\(\s*\$bucket\s*\)/);
        // bank_name_en auto-fill from whitelist when blank
        expect(SC).toMatch(/Auto-fill bank_name_en from whitelist if empty/);
    });

    test('dinoco_claim_bank_validate() defined with all 5 validation rules', () => {
        expect(SC).toMatch(/function\s+dinoco_claim_bank_validate\s*\(\s*\$payload/);
        // bank_account regex
        expect(SC).toMatch(/preg_match\(\s*'\/\^\[0-9-\]\{8,20\}\$\/'/);
        // bank_code whitelist
        expect(SC).toMatch(/dinoco_claim_bank_code_whitelist\(\s*\)/);
        // bank_holder max 128
        expect(SC).toMatch(/mb_strlen\(\s*\$holder\s*\)\s*>\s*128/);
        // bank_name max 64
        expect(SC).toMatch(/mb_strlen\(\s*\$name\s*\)\s*>\s*64/);
        // logo https-only
        expect(SC).toMatch(/preg_match\(\s*'#\^https:\/\/#i'/);
    });

    // ─── Shortcode + Module Registry ──────────────────────────────────

    test('shortcode [dinoco_claim_bank_settings] registered', () => {
        expect(SC).toMatch(/add_shortcode\(\s*'dinoco_claim_bank_settings'\s*,\s*'dinoco_claim_bank_settings_render'\s*\)/);
    });

    test('shortcode permission gate is manage_options only', () => {
        // Match from function header through to the add_shortcode call (tight scope to
        // shortcode body, avoids matching Module Registry block below).
        const m = SC.match(/function\s+dinoco_claim_bank_settings_render[\s\S]+?add_shortcode\(\s*'dinoco_claim_bank_settings'/);
        expect(m).not.toBeNull();
        // Reject if not logged in
        expect(m[0]).toMatch(/is_user_logged_in\(\s*\)/);
        // Reject if not admin
        expect(m[0]).toMatch(/current_user_can\(\s*'manage_options'\s*\)/);
    });

    test('shortcode renders scoped CSS prefix .dnc-cb-* (no conflicts)', () => {
        expect(SC).toMatch(/\.dnc-cb-root/);
        expect(SC).toMatch(/\.dnc-cb-card/);
        expect(SC).toMatch(/\.dnc-cb-btn/);
    });

    test('shortcode renders Thai labels (boss directive — Thai UI)', () => {
        expect(SC).toMatch(/ตั้งค่าบัญชีรับเงินสำหรับเคลม/);
        expect(SC).toMatch(/บัญชีหลัก \(Default\)/);
        expect(SC).toMatch(/บัญชี Walk-in/);
    });

    test('shortcode form fields have touch targets ≥44px (mobile)', () => {
        // min-height: 44px on inputs + buttons
        expect(SC).toMatch(/\.dnc-cb-field\s+input[^{]*\{[^}]*min-height:\s*44px/);
        expect(SC).toMatch(/\.dnc-cb-btn\b[^{]*\{[^}]*min-height:\s*44px/);
    });

    test('module registry self-registers with claim_bank key + manage_options cap', () => {
        const m = SC.match(/dinoco_register_admin_module\(\s*array\(\s*'key'\s*=>\s*'claim_bank'[\s\S]*?\)\s*\);/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/'shortcode'\s*=>\s*'dinoco_claim_bank_settings'/);
        expect(m[0]).toMatch(/'capability'\s*=>\s*'manage_options'/);
        expect(m[0]).toMatch(/'section'\s*=>\s*'system'/);
    });

    // ─── REST API endpoints ───────────────────────────────────────────

    test('3 REST routes registered under /dinoco-claim/v1/bank-settings', () => {
        // GET
        expect(SC).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/bank-settings'\s*,\s*array\(\s*'methods'\s*=>\s*'GET'/);
        // POST save
        expect(SC).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/bank-settings'\s*,\s*array\(\s*'methods'\s*=>\s*'POST'/);
        // POST test
        expect(SC).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/bank-settings\/test'/);
    });

    test('all 3 REST routes gated by manage_options', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_register_rest[\s\S]*?\n\s*\}\s*\}/);
        expect(m).not.toBeNull();
        // The $perm closure returns current_user_can('manage_options')
        expect(m[0]).toMatch(/current_user_can\(\s*'manage_options'\s*\)/);
        // Used as permission_callback for all 3 routes
        const permRefs = m[0].match(/'permission_callback'\s*=>\s*\$perm/g) || [];
        expect(permRefs.length).toBeGreaterThanOrEqual(3);
    });

    test('REST GET returns default + walkin + whitelist + seeded_flag', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_rest_get[\s\S]+?function\s+dinoco_claim_bank_rest_save/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/'default'/);
        expect(m[0]).toMatch(/'walkin'/);
        expect(m[0]).toMatch(/'whitelist'/);
        expect(m[0]).toMatch(/'seeded_flag'/);
    });

    test('REST POST save returns 422 with errors[] when validation fails', () => {
        // Bound to next function definition for tight scope
        const m = SC.match(/function\s+dinoco_claim_bank_rest_save[\s\S]+?function\s+dinoco_claim_bank_rest_test/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/'claim_bank_validation_failed'/);
        expect(m[0]).toMatch(/'status'\s*=>\s*422/);
        expect(m[0]).toMatch(/dinoco_claim_bank_validate\(/);
    });

    test('REST POST test endpoint is PREVIEW ONLY (no actual LINE push)', () => {
        // Bound to next function definition or end of REST block
        const m = SC.match(/function\s+dinoco_claim_bank_rest_test[\s\S]+?function\s+dinoco_claim_bank_settings_render/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/'preview_only'\s*=>\s*true/);
        // Must NOT call b2b_line_push, b2b_push_guaranteed, or similar
        expect(m[0]).not.toMatch(/b2b_line_push|b2b_push_guaranteed|wp_remote_post.*line/i);
    });

    // ─── Migration from constants ─────────────────────────────────────

    test('one-time migration hooked on admin_init', () => {
        expect(SC).toMatch(/add_action\(\s*'admin_init'\s*,\s*'dinoco_claim_bank_maybe_migrate_constants'\s*\)/);
    });

    test('migration uses idempotency flag dinoco_claim_bank_seeded_from_constants', () => {
        // Use a more permissive match capturing the whole function body via the
        // add_action hook line as endpoint (function ends right before it).
        const m = SC.match(/function\s+dinoco_claim_bank_maybe_migrate_constants[\s\S]+?add_action\(\s*'admin_init'\s*,\s*'dinoco_claim_bank_maybe_migrate_constants'/);
        expect(m).not.toBeNull();
        // Reads flag first
        expect(m[0]).toMatch(/get_option\(\s*'dinoco_claim_bank_seeded_from_constants'\s*,\s*''\s*\)/);
        // Writes flag at end
        expect(m[0]).toMatch(/update_option\(\s*'dinoco_claim_bank_seeded_from_constants'\s*,\s*'1'/);
    });

    test('migration handles both default + walkin buckets', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_maybe_migrate_constants[\s\S]+?add_action\(\s*'admin_init'\s*,\s*'dinoco_claim_bank_maybe_migrate_constants'/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/foreach\s*\(\s*array\(\s*'default'\s*,\s*'walkin'\s*\)/);
    });

    test('migration does NOT overwrite existing wp_options (only seeds when empty)', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_maybe_migrate_constants[\s\S]+?add_action\(\s*'admin_init'\s*,\s*'dinoco_claim_bank_maybe_migrate_constants'/);
        expect(m).not.toBeNull();
        // Skip continue if wp_option already has a value
        expect(m[0]).toMatch(/if\s*\(\s*\$current\s*!==\s*''[\s\S]{0,40}\)\s*continue/);
    });

    // ─── Dual-channel audit log ───────────────────────────────────────

    test('audit save calls dinoco_audit_log (Channel 1 — primary forensic)', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_audit_save[\s\S]+?function\s+dinoco_claim_bank_build_preview_flex/);
        expect(m).not.toBeNull();
        // function_exists guard
        expect(m[0]).toMatch(/function_exists\(\s*'dinoco_audit_log'\s*\)/);
        // Call with event_type
        expect(m[0]).toMatch(/'event_type'\s*=>\s*'claim_bank_settings_changed'/);
    });

    test('audit save calls dinoco_flag_audit_log per-key (Channel 2 — per-key mirror)', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_audit_save[\s\S]+?function\s+dinoco_claim_bank_build_preview_flex/);
        expect(m).not.toBeNull();
        // function_exists guard
        expect(m[0]).toMatch(/function_exists\(\s*'dinoco_flag_audit_log'\s*\)/);
        // per-key foreach over diff
        expect(m[0]).toMatch(/foreach\s*\(\s*\$diff\s+as\s+\$opt_key\s*=>\s*\$delta\s*\)/);
        // reason = 'claim_bank_settings_save'
        expect(m[0]).toMatch(/'claim_bank_settings_save'/);
    });

    test('REST save handler invokes audit only when diff is non-empty', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_rest_save[\s\S]+?function\s+dinoco_claim_bank_rest_test/);
        expect(m).not.toBeNull();
        // Only audit when there's a real change
        expect(m[0]).toMatch(/if\s*\(\s*!\s*empty\(\s*\$diff\s*\)\s*\)/);
        expect(m[0]).toMatch(/dinoco_claim_bank_audit_save\(\s*\$diff\s*,\s*\$bucket\s*\)/);
    });

    // ─── Flex preview builder ─────────────────────────────────────────

    test('Flex preview builder labels "Preview — ไม่ได้ส่งจริง" to admin', () => {
        const m = SC.match(/function\s+dinoco_claim_bank_build_preview_flex[\s\S]+?function\s+dinoco_claim_bank_register_rest/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/Preview\s*—\s*ไม่ได้ส่งจริง/);
        expect(m[0]).toMatch(/'type'\s*=>\s*'bubble'/);
    });

    // ─── JS UI handlers ───────────────────────────────────────────────

    test('JS uses Modal Helpers (_scCfm equivalent cbCfm) with native fallback', () => {
        expect(SC).toMatch(/async function cbCfm\s*\(/);
        expect(SC).toMatch(/window\.dinocoModal\.confirm/);
        // native fallback inside try/catch
        expect(SC).toMatch(/catch\s*\(\s*e\s*\)\s*\{\s*return confirm\(msg\)/);
    });

    test('JS sends X-WP-Nonce header on both save + test calls', () => {
        // At least 2 fetch calls with X-WP-Nonce
        const nonceCalls = SC.match(/'X-WP-Nonce':\s*nonce/g) || [];
        expect(nonceCalls.length).toBeGreaterThanOrEqual(2);
    });

    test('JS uses event delegation for save + test buttons', () => {
        expect(SC).toMatch(/closest\(\s*'\.js-dnc-cb-save'\s*\)/);
        expect(SC).toMatch(/closest\(\s*'\.js-dnc-cb-test'\s*\)/);
    });

    // ─── Phase 2 scope guard — must NOT leak into V.33.0 ──────────────

    // Phase 2 scope guards — only inspect the V.33.0 code block (not the
    // header comment which legitimately enumerates what Phase 2 will add).
    function getV330CodeBlock() {
        // Code begins after the version-header comment closes (`*/`) and the
        // first `// ====` separator that marks the V.33.0 section.
        const startMarker = '// V.33.0 — CLAIM BANK SETTINGS';
        const idx = SC.indexOf(startMarker);
        return idx === -1 ? '' : SC.slice(idx);
    }

    test('Phase 1 V.33.0 does NOT create wp_dinoco_claim_charges schema (Phase 2 scope)', () => {
        const code = getV330CodeBlock();
        expect(code.length).toBeGreaterThan(0);
        // Must not contain dbDelta for claim charges table
        expect(code).not.toMatch(/dbDelta[\s\S]{0,200}wp_dinoco_claim_charges/);
        expect(code).not.toMatch(/CREATE TABLE[\s\S]{0,100}dinoco_claim_charges/);
    });

    test('Phase 1 V.33.0 does NOT call Slip2Go API (Phase 2 scope)', () => {
        const code = getV330CodeBlock();
        expect(code.length).toBeGreaterThan(0);
        // No slip verification helper invocations in V.33.0 path (executable lines only)
        expect(code).not.toMatch(/dinoco_verify_slip_for_claim\s*\(/);
        // b2f_verify_slip_image lives in B2F Snippet 1 — not in Service Center
        expect(code).not.toMatch(/b2f_verify_slip_image\s*\(/);
    });

    test('Phase 1 V.33.0 does NOT extend b2b_get_bank_info (Phase 2.3 B-3 scope)', () => {
        const code = getV330CodeBlock();
        expect(code.length).toBeGreaterThan(0);
        // V.33.0 introduces an isolated resolver — no modification to B2B helper
        expect(code).not.toMatch(/function\s+b2b_get_bank_info\s*\(/);
    });

    // ─── Integration: shortcode renders Service Center patterns ───────

    test('shortcode reuses dinocoModal pattern (cbAlert + cbCfm wrappers)', () => {
        expect(SC).toMatch(/async function cbAlert\s*\(/);
        expect(SC).toMatch(/window\.dinocoModal\.alert/);
    });

    test('walk-in toggle hides/shows form via [hidden] attribute', () => {
        // Toggle handler binds 'change' event
        expect(SC).toMatch(/walkinToggle\.addEventListener\(\s*'change'/);
        // Sets / removes 'hidden' attr
        expect(SC).toMatch(/setAttribute\(\s*'hidden'/);
        expect(SC).toMatch(/removeAttribute\(\s*'hidden'/);
    });

    test('feature flag spec compliance: REG-029 byte-identical no-op for existing claim flow', () => {
        // V.33.0 section must be appended AFTER V.31.1 SC Quick Lookup module registration —
        // verify all V.33.0 code lives after that marker (additive, no edits to claim flow)
        const sccLookupIdx = SC.indexOf("'key'         => 'sc_lookup'");
        const claimBankIdx = SC.indexOf("'key'         => 'claim_bank'");
        expect(sccLookupIdx).toBeGreaterThan(0);
        expect(claimBankIdx).toBeGreaterThan(sccLookupIdx); // claim_bank appended after sc_lookup
    });
});
