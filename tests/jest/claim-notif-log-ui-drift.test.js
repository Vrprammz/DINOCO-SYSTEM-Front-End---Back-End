/**
 * Service Center Notifications Log UI drift detector — Sprint 8 Phase 1 Task 1.5
 *
 * Pins integration between Service Center V.32.0 (DB_ID 27) and
 * Claim Lifecycle Notifier V.0.3 (DB_ID 1211):
 *   - section HTML scaffolded in manage modal
 *   - server-side flag gate (`dinoco_claim_notif_enabled`) hides section when OFF
 *   - 3 JS functions defined (loadNotifLog / renderNotifLog / resendNotif)
 *   - REST endpoints called with correct paths + X-WP-Nonce
 *   - HR2 resend bypasses dedup (server-side); UI confirms via _scCfm before POST
 *   - event delegation for resend buttons (dynamic rows)
 *   - module exports loadNotifLog + resendNotif
 *   - populateModal flow wires loadNotifLog(tid) on success
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const sc = fs.readFileSync(path.join(REPO, '[Admin System] DINOCO Service Center & Claims'), 'utf8');

describe('Service Center Notifications Log UI — Sprint 8 drift detector', () => {

    test('Service Center version bumped to V.32.0', () => {
        expect(sc).toMatch(/Version: V\.32\.0 \(2026-05-13\)/);
    });

    // ─── HTML section ────────────────────────────────────────────────

    test('Notifications Log section HTML exists in manage modal', () => {
        expect(sc).toMatch(/id="sc-notif-log-section"/);
        expect(sc).toMatch(/id="sc-notif-log-body"/);
        expect(sc).toMatch(/id="sc-notif-log-count"/);
    });

    test('section gated by dinoco_claim_notif_enabled wp_option', () => {
        // data-enabled attr reads option for client-side fast-path
        expect(sc).toMatch(/data-enabled="<\?php echo \(int\) get_option\(\s*'dinoco_claim_notif_enabled'\s*,\s*0\s*\);\s*\?>"/);
        // class is conditionally 'hidden' when flag OFF
        expect(sc).toMatch(/get_option\(\s*'dinoco_claim_notif_enabled'\s*,\s*0\s*\)\s*\?\s*''\s*:\s*'hidden'/);
    });

    test('section labelled in Thai with bell icon', () => {
        expect(sc).toMatch(/Notifications Log — LINE Flex แจ้งเตือนลูกค้า/);
        expect(sc).toMatch(/fa-bell/);
    });

    test('section explains HR2 resend bypass behavior to admin', () => {
        expect(sc).toMatch(/bypass dedup window 60s \+ idempotency cache/);
    });

    // ─── JS functions ────────────────────────────────────────────────

    test('loadNotifLog function defined', () => {
        expect(sc).toMatch(/function loadNotifLog\s*\(\s*tid\s*\)\s*\{/);
    });

    test('loadNotifLog short-circuits when section data-enabled !== "1"', () => {
        // Tail-end safety: function still exists when flag OFF (export contract)
        // but does nothing when section is hidden.
        const m = sc.match(/function loadNotifLog\s*\(\s*tid\s*\)[\s\S]*?function renderNotifLog/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/data-enabled.{0,30}!==\s*'1'/);
    });

    test('loadNotifLog calls correct REST path with X-WP-Nonce header', () => {
        const m = sc.match(/function loadNotifLog\s*\(\s*tid\s*\)[\s\S]*?function renderNotifLog/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/\/wp-json\/dinoco-claim\/v1\/notif\/log\?claim_id=/);
        expect(m[0]).toMatch(/'X-WP-Nonce':\s*\(window\.wpApiSettings && window\.wpApiSettings\.nonce\)/);
        expect(m[0]).toMatch(/method:\s*'GET'/);
    });

    test('renderNotifLog function defined with table structure', () => {
        const m = sc.match(/function renderNotifLog\s*\(\s*rows,\s*tid\s*\)[\s\S]*?function resendNotif/);
        expect(m).not.toBeNull();
        // Success badge + failure badge (red)
        expect(m[0]).toMatch(/✓ ส่งแล้ว/);
        expect(m[0]).toMatch(/✗ ล้มเหลว/);
        // Resend button rendered with data-tid + data-status attrs
        expect(m[0]).toMatch(/js-sc-resend-notif/);
        expect(m[0]).toMatch(/data-tid=/);
        expect(m[0]).toMatch(/data-status=/);
        // Most-recent-first (reverse iteration)
        expect(m[0]).toMatch(/for\s*\(\s*var\s+i\s*=\s*rows\.length\s*-\s*1;\s*i\s*>=\s*0;\s*i--\s*\)/);
    });

    test('renderNotifLog escapes HTML to prevent stored XSS via error strings', () => {
        const m = sc.match(/function renderNotifLog\s*\(\s*rows,\s*tid\s*\)[\s\S]*?function resendNotif/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/escNotifHtml\(/);
    });

    test('resendNotif uses _scCfm confirmation before POST', () => {
        const m = sc.match(/async function resendNotif\s*\(\s*tid,\s*status\s*\)[\s\S]*?\$\(document\)\.on\(\s*'click',\s*'\.js-sc-resend-notif'/);
        expect(m).not.toBeNull();
        // confirm via dinocoModal pattern
        expect(m[0]).toMatch(/await _scCfm\(/);
        // POSTs to /notif/resend with claim_id + status
        expect(m[0]).toMatch(/\/wp-json\/dinoco-claim\/v1\/notif\/resend/);
        expect(m[0]).toMatch(/JSON\.stringify\(\s*\{\s*claim_id:\s*tid,\s*status:\s*status \|\| ''\s*\}\s*\)/);
        // After success, reload table to surface latest log row
        expect(m[0]).toMatch(/loadNotifLog\(\s*tid\s*\)/);
    });

    test('event delegation registered for .js-sc-resend-notif click', () => {
        // Dynamic rows — must use $(document).on('click', selector, ...) per DINOCO pattern
        expect(sc).toMatch(/\$\(document\)\.on\(\s*'click',\s*'\.js-sc-resend-notif'/);
    });

    // ─── populateModal wiring ────────────────────────────────────────

    test('openManage flow calls loadNotifLog(tid) on AJAX success', () => {
        // Find the openManage function body up to .fail() (Bash jQuery chain `})`)
        const m = sc.match(/function openManage\s*\([\s\S]*?\}\)\.fail\(/);
        expect(m).not.toBeNull();
        // Inside success: populateModal then loadNotifLog
        expect(m[0]).toMatch(/populateModal\(res\.data\);[\s\S]*?loadNotifLog\(\s*tid\s*\);/);
    });

    // ─── Module export ────────────────────────────────────────────

    test('DINOCO module exports loadNotifLog + resendNotif', () => {
        // Look for the return { ... } block at end of IIFE
        const m = sc.match(/return\s*\{\s*loadList[\s\S]*?\};/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/loadNotifLog,/);
        expect(m[0]).toMatch(/resendNotif/);
    });

    // ─── REST contract integration (Notifier V.0.3) ─────────────────

    test('UI integrates with Claim Lifecycle Notifier V.0.3 REST namespace', () => {
        // Both endpoints called from this snippet must exist in Notifier
        const notif = fs.readFileSync(
            path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier'),
            'utf8'
        );
        expect(notif).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/notif\/log'/);
        expect(notif).toMatch(/register_rest_route\(\s*'dinoco-claim\/v1'\s*,\s*'\/notif\/resend'/);
    });
});
