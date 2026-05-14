/**
 * Health Monitor Claim Cron Cards drift detector — Sprint 29 Phase 4 Batch A Item 6.
 *
 * Pins the surface shipped in:
 *   • [Admin System] DINOCO Health Monitor (V.1.6) — 3 NEW dashboard cards
 *
 * Verifies future edits do not regress:
 *   - Version pin V.1.6
 *   - 3 card markup (one per cron)
 *   - Canonical R12 heartbeat option keys (no leading underscore)
 *   - Status ladder: green <2× / amber 2-4× / red >4×
 *   - Buddhist Era year date format helper
 *   - Section rendered ABOVE existing Cron Heartbeat section
 *   - data-claim-cron attribute for each card (debugging seam)
 *
 * Spec source: FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md Phase 4 Item 6.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const HM_PATH = path.join(REPO, '[Admin System] DINOCO Health Monitor');
const SRC = fs.readFileSync(HM_PATH, 'utf8');
const SRC_CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Health Monitor Claim Cron Cards — Phase 4 Batch A Item 6 drift detector', () => {

    test('Health Monitor version stamped V.1.6 (Sprint 29 Phase 4 Batch A Item 6)', () => {
        expect(SRC).toMatch(/Version:\s*V\.1\.6\s*\(2026-05-14\)/);
    });

    test('Health Monitor introduces $dnc_claim_cron_cards array (3 entries)', () => {
        expect(SRC_CODE).toMatch(/\$dnc_claim_cron_cards\s*=\s*array\(/);
    });

    test('Card 1 — Charge Expire Sweep registered with canonical R12 heartbeat key', () => {
        // Canonical R12 key: dinoco_cron_<hook>_last_run (NO leading underscore).
        expect(SRC_CODE).toMatch(/['"]hook['"]\s*=>\s*['"]dinoco_claim_charge_expire_cron['"]/);
        expect(SRC_CODE).toMatch(/['"]option_key['"]\s*=>\s*['"]dinoco_cron_claim_charge_expire_last_run['"]/);
    });

    test('Card 2 — Charge Retention Cleanup registered with canonical R12 heartbeat key', () => {
        expect(SRC_CODE).toMatch(/['"]hook['"]\s*=>\s*['"]dinoco_claim_charges_cleanup_cron['"]/);
        expect(SRC_CODE).toMatch(/['"]option_key['"]\s*=>\s*['"]dinoco_cron_claim_charges_cleanup_last_run['"]/);
    });

    test('Card 3 — Pending Review Sweep registered with canonical R12 heartbeat key', () => {
        expect(SRC_CODE).toMatch(/['"]hook['"]\s*=>\s*['"]dinoco_claim_charge_pending_review_sweep_cron['"]/);
        expect(SRC_CODE).toMatch(/['"]option_key['"]\s*=>\s*['"]dinoco_cron_claim_charge_pending_review_last_run['"]/);
    });

    test('Heartbeat option keys do NOT use leading underscore variant (R12 canonical)', () => {
        // Regression guard against drift back to legacy _dinoco_cron_... form
        // (cf. V.1.4 flash_category_verify drift fix).
        const cardBlock = SRC_CODE.match(/\$dnc_claim_cron_cards\s*=\s*array\(([\s\S]+?)\)\s*;/);
        expect(cardBlock).not.toBeNull();
        // No option key starts with underscore in this block
        expect(cardBlock[1]).not.toMatch(/['"]option_key['"]\s*=>\s*['"]_dinoco_cron_/);
    });

    test('Status ladder: green when secs_since < 2× expected', () => {
        // Logic:
        //   secs_since <= 2× → 'ok'
        //   2× < secs_since <= 4× → 'warn'
        //   secs_since > 4× → 'fail'
        //   last_run === 0 → 'fail' (never_ran)
        expect(SRC_CODE).toMatch(/\$secs_since\s*>\s*\$expected\s*\*\s*2/);
        expect(SRC_CODE).toMatch(/\$secs_since\s*>\s*\$expected\s*\*\s*4/);
    });

    test('Status ladder: red on >4× expected OR never_ran', () => {
        const cardBlock = SRC_CODE.match(/foreach\s*\(\s*\$dnc_claim_cron_cards[\s\S]+?endforeach/);
        expect(cardBlock).not.toBeNull();
        // Both 'fail' and 'never_ran' literals present.
        expect(cardBlock[0]).toMatch(/\$status\s*=\s*['"]fail['"]/);
        expect(cardBlock[0]).toMatch(/never_ran/);
    });

    test('Status ladder: amber/warn for 2-4× expected', () => {
        const cardBlock = SRC_CODE.match(/foreach\s*\(\s*\$dnc_claim_cron_cards[\s\S]+?endforeach/);
        expect(cardBlock[0]).toMatch(/\$status\s*=\s*['"]warn['"]/);
    });

    test('Cards expected_seconds use DAY_IN_SECONDS or HOUR_IN_SECONDS constants', () => {
        // Daily crons → DAY_IN_SECONDS, hourly → HOUR_IN_SECONDS.
        const cardBlock = SRC_CODE.match(/\$dnc_claim_cron_cards\s*=\s*array\(([\s\S]+?)\)\s*;/);
        expect(cardBlock[1]).toMatch(/DAY_IN_SECONDS/);
        expect(cardBlock[1]).toMatch(/HOUR_IN_SECONDS/);
    });

    test('Buddhist Era date helper $dnc_claim_format_be defined', () => {
        expect(SRC_CODE).toMatch(/\$dnc_claim_format_be\s*=\s*function\s*\(/);
    });

    test('Buddhist Era helper adds 543 to AD year', () => {
        const helperBlock = SRC_CODE.match(/\$dnc_claim_format_be\s*=\s*function[\s\S]+?\};/);
        expect(helperBlock).not.toBeNull();
        expect(helperBlock[0]).toMatch(/\+\s*543/);
    });

    test('Cards render with data-claim-cron attribute (debug seam)', () => {
        expect(SRC_CODE).toMatch(/data-claim-cron="<\?php\s+echo\s+esc_attr/);
    });

    test('Cards rendered ABOVE existing Cron Heartbeat section', () => {
        const claimSectionIdx = SRC_CODE.indexOf('🧾 Claim Lifecycle Crons');
        const cronHeartbeatIdx = SRC_CODE.indexOf('Cron Heartbeat (<?php');
        expect(claimSectionIdx).toBeGreaterThan(-1);
        expect(cronHeartbeatIdx).toBeGreaterThan(-1);
        expect(claimSectionIdx).toBeLessThan(cronHeartbeatIdx);
    });

    test('Section uses Claim emoji + Thai label "Claim Lifecycle Crons"', () => {
        expect(SRC_CODE).toMatch(/🧾\s*Claim Lifecycle Crons/);
    });

    test('Cards use existing .dnc-h-card class (no new CSS injection)', () => {
        // Reuse existing health-card styling instead of inventing new tokens.
        const cardBlock = SRC_CODE.match(/foreach\s*\(\s*\$dnc_claim_cron_cards[\s\S]+?endforeach/);
        expect(cardBlock[0]).toMatch(/class="dnc-h-card"/);
    });

    test('Card meta includes last_run + next + schedule + hook name (full surface)', () => {
        const cardBlock = SRC_CODE.match(/foreach\s*\(\s*\$dnc_claim_cron_cards[\s\S]+?endforeach/);
        expect(cardBlock[0]).toMatch(/last_run:/);
        expect(cardBlock[0]).toMatch(/next:/);
        expect(cardBlock[0]).toMatch(/schedule:/);
        // Hook is rendered as code tag for monospace.
        expect(cardBlock[0]).toMatch(/<code\b[^>]*>.*?\$card\['hook'\]/);
    });
});
