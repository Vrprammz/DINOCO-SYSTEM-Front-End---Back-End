/**
 * Claim Charge Create drift detector — Sprint 17 Phase 2.6.
 *
 * Pins:
 *   • [System] DINOCO Claim Payment LIFF V.0.6 — POST /charges +
 *     GET /charges/{id} + GET /charges?claim_id= endpoints registered with
 *     proper permission_callback + args schema.
 *   • amount_thb_at_create set at INSERT (CHECK chk_amount_snapshot).
 *   • GET_LOCK + transaction pattern.
 *   • Idempotency body hash uses amount_cents int.
 *   • POST-COMMIT action fire `dinoco/claim/charge_state_changed`.
 *   • Bangkok-local date() for expires_at (Sprint 16 C2 lesson — NOT gmdate).
 *   • [Admin System] DINOCO Service Center & Claims V.34.0 — charges section
 *     HTML structure + scoped CSS class + data-action delegation.
 */

const fs = require('fs');
const path = require('path');

const REPO        = path.resolve(__dirname, '../..');
const LIFF_PATH   = path.join(REPO, '[System] DINOCO Claim Payment LIFF');
const SC_PATH     = path.join(REPO, '[Admin System] DINOCO Service Center & Claims');
const LIFF_SRC    = fs.readFileSync(LIFF_PATH, 'utf8');
const SC_SRC      = fs.readFileSync(SC_PATH, 'utf8');

// Comment-stripped view — prevents version-header documentation triggering
// negative-assertion false-positives (S/N R11 lesson).
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(line => line.replace(/\s*\/\/.*$/, ''))
        .join('\n');
}
const LIFF_CODE = stripComments(LIFF_SRC);
const SC_CODE   = stripComments(SC_SRC);

describe('Sprint 17 Phase 2.6 — Claim Charge Create + Tiered Read drift', () => {

    // ─── LIFF V.0.8 header + version stamp (Sprint 20 pin) ───────────

    test('LIFF V.0.8 latest + V.0.6 history preserved in header', () => {
        // Sprint 20 V.0.8 is current; older rows preserved in changelog
        expect(LIFF_SRC).toMatch(/Version:\s*V\.0\.8\s*\(2026-05-14\)\s*—\s*Sprint 20/);
        expect(LIFF_SRC).toMatch(/Version:\s*V\.0\.6\s*\(2026-05-14\)\s*—\s*Sprint 17/);
    });

    test('LIFF defines DINOCO_CLAIM_PAYMENT_LIFF_LOADED = 0.9 (Sprint 22)', () => {
        expect(LIFF_CODE).toMatch(/DINOCO_CLAIM_PAYMENT_LIFF_LOADED['"][^;]*['"]0\.9['"]/);
    });

    // ─── REST route registrations ────────────────────────────────────

    test('POST /charges registered with admin permission_callback + args schema', () => {
        expect(LIFF_CODE).toMatch(/register_rest_route\s*\(\s*\$base\s*,\s*['"]\/charges['"]/);
        expect(LIFF_CODE).toMatch(/dinoco_claim_payment_rest_charge_create/);
        expect(LIFF_CODE).toMatch(/dinoco_claim_payment_perm_admin/);
        expect(LIFF_CODE).toMatch(/['"]amount_thb['"]\s*=>\s*array/);
        expect(LIFF_CODE).toMatch(/['"]reason['"]\s*=>\s*array/);
        expect(LIFF_CODE).toMatch(/['"]bank_context['"]\s*=>\s*array/);
        expect(LIFF_CODE).toMatch(/['"]expires_in_days['"]\s*=>\s*array/);
    });

    test('GET /charges/{id} route registered with logged-in permission_callback (tier resolved inside)', () => {
        expect(LIFF_CODE).toMatch(/register_rest_route\s*\(\s*\$base\s*,\s*['"]\/charges\/\(\?P<id>\\\\d\+\)['"]/);
        expect(LIFF_CODE).toMatch(/dinoco_claim_payment_rest_charge_read/);
        expect(LIFF_CODE).toMatch(/is_user_logged_in/);
    });

    test('GET /charges (list) route registered with admin permission_callback', () => {
        expect(LIFF_CODE).toMatch(/dinoco_claim_payment_rest_charges_list/);
    });

    // ─── amount_thb_at_create at INSERT (chk_amount_snapshot) ────────

    test('handler sets BOTH amount_thb and amount_thb_at_create at INSERT', () => {
        // Both columns must appear in insert_data array — equality enforced
        // by chk_amount_snapshot CHECK constraint (V.0.5 Sprint 16 C1).
        expect(LIFF_CODE).toMatch(/['"]amount_thb['"]\s*=>\s*\$amount_thb/);
        expect(LIFF_CODE).toMatch(/['"]amount_thb_at_create['"]\s*=>\s*\$amount_thb/);
    });

    // ─── GET_LOCK + transaction ──────────────────────────────────────

    test('handler uses GET_LOCK with 5s timeout', () => {
        expect(LIFF_CODE).toMatch(/GET_LOCK\([^)]+,\s*%d\)['"]\s*,\s*\$lock_key\s*,\s*5/);
    });

    test('handler wraps INSERT in START TRANSACTION / COMMIT', () => {
        expect(LIFF_CODE).toMatch(/START TRANSACTION/);
        expect(LIFF_CODE).toMatch(/\$wpdb->query\(\s*['"]COMMIT['"]/);
        // ROLLBACK on failure path
        expect(LIFF_CODE).toMatch(/\$wpdb->query\(\s*['"]ROLLBACK['"]/);
    });

    test('handler uses try/finally with RELEASE_LOCK', () => {
        expect(LIFF_CODE).toMatch(/finally\s*\{[\s\S]*?RELEASE_LOCK/);
    });

    // ─── Idempotency cents-int hash ──────────────────────────────────

    test('idempotency body hash uses amount_cents int (not float)', () => {
        // Body hash MUST include amount_cents — never raw float — to prevent
        // drift across PHP versions / locales.
        expect(LIFF_CODE).toMatch(/['"]amount_cents['"]/);
        expect(LIFF_CODE).toMatch(/round\s*\(\s*\$amount_thb\s*\*\s*100/);
    });

    test('idempotency body hash includes actor_user_id', () => {
        // Round 30+ idempotency pattern requires actor_user_id discriminator.
        expect(LIFF_CODE).toMatch(/['"]actor_user_id['"]\s*=>\s*\$uid/);
    });

    test('idempotency namespace is claim-charge-create', () => {
        expect(LIFF_CODE).toMatch(/\$idem_namespace\s*=\s*['"]claim-charge-create['"]/);
    });

    // ─── POST-COMMIT action fire ─────────────────────────────────────

    test('handler fires dinoco/claim/charge_state_changed POST-COMMIT', () => {
        // The do_action must appear AFTER the COMMIT line, not before it.
        const commitIdx = LIFF_CODE.indexOf("$wpdb->query( 'COMMIT' )");
        const actionMatch = LIFF_CODE.indexOf("'dinoco/claim/charge_state_changed'");
        expect(commitIdx).toBeGreaterThan(-1);
        expect(actionMatch).toBeGreaterThan(-1);
        // Find the action fire that appears in the charge_create handler
        const after = LIFF_CODE.indexOf("do_action( 'dinoco/claim/charge_state_changed'", commitIdx);
        expect(after).toBeGreaterThan(commitIdx);
    });

    // ─── Bangkok-local date() (Sprint 16 C2 lesson) ──────────────────

    test('Sprint 19 MED-1 — expires_at uses wp_date(wp_timezone()) for Bangkok-local semantics', () => {
        // Sprint 17 used date() — Sprint 19 MED-1 upgraded to wp_date() with
        // wp_timezone() because date() reads PHP default tz (UTC on most WP
        // installs) while current_time('mysql') is Bangkok-local → 7hr drift.
        // wp_date() honors wp_timezone() so DB read/write semantics match.
        expect(LIFF_CODE).toMatch(/wp_date\s*\(\s*['"]Y-m-d H:i:s['"][\s\S]*?wp_timezone\(\)/);
        // function_exists guard — date() retained as fallback for very old WP installs
        expect(LIFF_CODE).toMatch(/function_exists\(\s*['"]wp_date['"]\s*\)/);
    });

    test('handler does NOT use gmdate() for expires_at', () => {
        // Negative assertion — gmdate() must not appear in the create handler's
        // expires_at calculation. (Other gmdate uses elsewhere in the LIFF are
        // fine; this scoped check focuses on the new code.)
        const createIdx = LIFF_CODE.indexOf('function dinoco_claim_payment_rest_charge_create');
        const expiresIdx = LIFF_CODE.indexOf('$expires_at =', createIdx);
        const snippet = LIFF_CODE.substring(expiresIdx, expiresIdx + 200);
        expect(snippet).not.toMatch(/gmdate/);
    });

    // ─── payment_ref CLM-CHG format ──────────────────────────────────

    test('payment_ref generator emits CLM-CHG-NNNN-XXXX format', () => {
        expect(LIFF_CODE).toMatch(/CLM-CHG-['"]\s*\.\s*str_pad/);
    });

    test('payment_ref generator uses Crockford-style alphabet (no I/L/O/U)', () => {
        // ABCDEFGHJKMNPQRSTVWXYZ23456789 — excludes I, L, O, U, 0, 1
        const alphaMatch = LIFF_CODE.match(/\$alpha\s*=\s*['"]([A-Z0-9]+)['"]/);
        expect(alphaMatch).not.toBeNull();
        if (alphaMatch) {
            const alpha = alphaMatch[1];
            ['I', 'L', 'O', 'U', '0', '1'].forEach(banned => {
                expect(alpha).not.toContain(banned);
            });
        }
    });

    // ─── Active-charge rejection (409) ───────────────────────────────

    test('handler rejects creating when claim already has active charge (409)', () => {
        expect(LIFF_CODE).toMatch(/charge_active_exists/);
        expect(LIFF_CODE).toMatch(/IN\s*\(\s*'pending_payment'\s*,\s*'pending_review'\s*,\s*'verified'\s*\)/);
    });

    // ─── Reason whitelist enforcement ────────────────────────────────

    test('handler validates reason against DINOCO_CLAIM_CHARGES_REASON_WHITELIST', () => {
        expect(LIFF_CODE).toMatch(/DINOCO_CLAIM_CHARGES_REASON_WHITELIST/);
        expect(LIFF_CODE).toMatch(/invalid_reason/);
    });

    // ─── Bank context input mapping ──────────────────────────────────

    test('handler maps bank_context input default/walkin → schema claim/claim_walkin', () => {
        expect(LIFF_CODE).toMatch(/\$use_walkin\s*=\s*\(\s*\$bank_context_in\s*===\s*['"]walkin['"]\s*\)/);
        expect(LIFF_CODE).toMatch(/['"]claim_walkin['"]\s*:\s*['"]claim['"]/);
    });

    test('handler calls dinoco_claim_bank_resolve to snapshot bank', () => {
        expect(LIFF_CODE).toMatch(/dinoco_claim_bank_resolve\s*\(\s*\$use_walkin\s*\)/);
    });

    test('handler returns bank_snapshot_incomplete on resolver error', () => {
        expect(LIFF_CODE).toMatch(/bank_snapshot_incomplete/);
    });

    // ─── Rate limit ──────────────────────────────────────────────────

    test('charge create rate limit = 30/hr/admin', () => {
        expect(LIFF_CODE).toMatch(/b2b_rate_limit\s*\(\s*['"]claim_charge_create_['"]\s*\.\s*\$uid\s*,\s*30\s*,\s*3600\s*\)/);
    });

    test('charge read rate limit = 60/min/user (cheap probe defense)', () => {
        expect(LIFF_CODE).toMatch(/b2b_rate_limit\s*\(\s*['"]claim_charge_read_['"]\s*\.\s*\$uid\s*,\s*60\s*,\s*60\s*\)/);
    });

    // ─── Tiered read 404 anti-enumeration ────────────────────────────

    test('read handler returns 404 (NOT 403) on owner mismatch (anti-enumeration)', () => {
        // R3 HIGH-5 / Sprint 14 H3 pattern — mask existence.
        const readIdx = LIFF_CODE.indexOf('function dinoco_claim_payment_rest_charge_read');
        expect(readIdx).toBeGreaterThan(-1);
        const readBlock = LIFF_CODE.substring(readIdx, readIdx + 2500);
        expect(readBlock).toMatch(/charge_not_found/);
        expect(readBlock).toMatch(/['"]status['"]\s*=>\s*404/);
    });

    test('read handler masks bank_account for non-admin tier', () => {
        const readIdx = LIFF_CODE.indexOf('function dinoco_claim_payment_rest_charge_read');
        const readBlock = LIFF_CODE.substring(readIdx, readIdx + 4000);
        expect(readBlock).toMatch(/dinoco_claim_payment_mask_account/);
    });

    test('read handler caches per-tier with 60s TTL', () => {
        // Two assertions are global to the LIFF code-only view since the read
        // handler body length varies with future additions.
        expect(LIFF_CODE).toMatch(/dinoco_claim_charge_v1_/);
        expect(LIFF_CODE).toMatch(/set_transient\(\s*\$cache_key\s*,\s*\$resp\s*,\s*60\s*\)/);
    });

    // ─── Cache invalidation listener ─────────────────────────────────

    test('cache invalidation listener wired on charge_state_changed action', () => {
        expect(LIFF_CODE).toMatch(/add_action\s*\(\s*['"]dinoco\/claim\/charge_state_changed['"]\s*,\s*['"]dinoco_claim_payment_invalidate_charge_cache['"]/);
    });

    test('cache invalidation purges BOTH admin + owner tier transients', () => {
        expect(LIFF_CODE).toMatch(/delete_transient\(\s*['"]dinoco_claim_charge_v1_['"]\s*\.\s*\$cid\s*\.\s*['"]_admin['"]/);
        expect(LIFF_CODE).toMatch(/delete_transient\(\s*['"]dinoco_claim_charge_v1_['"]\s*\.\s*\$cid\s*\.\s*['"]_owner['"]/);
    });

    // ─── Audit log + obs capture ─────────────────────────────────────

    test('handler logs claim_charge_created event via dinoco_audit_log', () => {
        expect(LIFF_CODE).toMatch(/dinoco_audit_log\(\s*array\([\s\S]{0,400}?event_type['"]?\s*=>\s*['"]claim_charge_created['"]/);
    });

    test('handler calls dinoco_obs_capture with info level on success', () => {
        expect(LIFF_CODE).toMatch(/dinoco_obs_capture\(\s*['"]info['"]\s*,\s*['"]claim_charge_created['"]/);
    });

    test('handler calls dinoco_obs_capture with error level on insert failure', () => {
        expect(LIFF_CODE).toMatch(/dinoco_obs_capture\(\s*['"]error['"]\s*,\s*['"]claim_charge_create_insert_failed['"]/);
    });

    // ─── Service Center V.34.0 — Modal trigger HTML structure ────────

    test('Service Center bumped to V.34.0 (Sprint 17 Phase 2.6)', () => {
        expect(SC_SRC).toMatch(/Version:\s*V\.34\.0\s*\(2026-05-14\)\s*—\s*Sprint 17/);
    });

    test('Service Center renders charges section gated by flag', () => {
        expect(SC_CODE).toMatch(/id=['"]sc-claim-charges-section['"]/);
        expect(SC_CODE).toMatch(/get_option\(\s*['"]dinoco_claim_payment_enabled['"]\s*,\s*0\s*\)/);
    });

    test('Service Center uses scoped CSS class .dnc-claim-charge-admin', () => {
        expect(SC_SRC).toMatch(/\.dnc-claim-charge-admin\b/);
    });

    test('Service Center trigger button uses data-action delegation (no inline onclick on new code)', () => {
        // The Sprint 17 trigger button MUST use data-action — inline onclick
        // would violate UX-H3 baseline.
        expect(SC_CODE).toMatch(/id=['"]dnc-cc-trigger-btn['"][^>]+data-action=['"]dnc-cc-open-create['"]/);
        // The trigger button line itself must not contain onclick=
        const triggerLine = SC_CODE.split('\n').find(l => l.includes('dnc-cc-trigger-btn'));
        expect(triggerLine).not.toMatch(/onclick=/);
    });

    test('Service Center bank pill toggles use data-action + data-bank', () => {
        expect(SC_CODE).toMatch(/data-action=['"]dnc-cc-pick-bank['"][^>]+data-bank=['"]default['"]/);
        expect(SC_CODE).toMatch(/data-action=['"]dnc-cc-pick-bank['"][^>]+data-bank=['"]walkin['"]/);
    });

    test('Service Center JS exposes scLoadCharges + scOpenCreateCharge', () => {
        expect(SC_CODE).toMatch(/function\s+scLoadCharges\s*\(/);
        expect(SC_CODE).toMatch(/async\s+function\s+scOpenCreateCharge\s*\(/);
        expect(SC_CODE).toMatch(/scLoadCharges,\s*\n\s*scOpenCreateCharge/);
    });

    test('Service Center auto-calls scLoadCharges from openManage success', () => {
        expect(SC_CODE).toMatch(/scLoadCharges\s*\(\s*tid\s*,\s*res\.data/);
    });

    test('Service Center gates trigger button by ticket_status (completed|replaced)', () => {
        // Eligibility check in scLoadCharges
        expect(SC_CODE).toMatch(/completed['"]?[\s\S]{0,80}?replaced/);
    });

    test('Service Center submits to /wp-json/dinoco-claim/v1/charges with X-WP-Nonce', () => {
        // List GET + POST + bank-settings/test all use the nonce header.
        expect(SC_CODE).toMatch(/url\s*:\s*['"]\/wp-json\/dinoco-claim\/v1\/charges['"]/);
        expect(SC_CODE).toMatch(/setRequestHeader\(\s*['"]X-WP-Nonce['"]/);
    });

    test('Service Center comma-formats amount input (display) and parses on submit', () => {
        expect(SC_CODE).toMatch(/replace\(\/,\/g,\s*''\)/);
        // intPart commas regex
        expect(SC_CODE).toMatch(/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)/);
    });
});
