/**
 * Claim Flash → Print Enqueue drift detector — Sprint 28 Phase 3.6.
 * Pins [Admin System] DINOCO Claim Flash Dispatcher V.0.5 print enqueue path.
 *
 * Pin set:
 *   • dinoco_claim_create_flash_shipment fires do_action('dinoco/claim/flash_created')
 *     wrapped in try/catch (HR1 hook chain — exception must NOT block response)
 *   • Action payload includes claim_id + pno + direction + label_url + sort_code +
 *     out_trade_no + sender_key
 *   • Listener dinoco_claim_flash_enqueue_print_job registered @ priority 20
 *   • Listener SKIPS direction === 'inbound_pickup' (no DINOCO label to print)
 *   • b2b_enqueue_claim_print_job helper exists with function_exists guard
 *   • Helper rejects non-claim_ticket post types
 *   • Helper writes _claim_flash_print_jobs[] post meta with status=queued
 *   • Helper dedups by PNO
 *   • Helper fires do_action('dinoco/claim/flash_print_enqueued') for downstream
 *   • Listener catches Throwable + obs_capture R11 signature ('error', tag, ctx)
 *   • Phase 3.6 V.0.5 header annotation
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('Claim Flash → Print Enqueue — Sprint 28 Phase 3.6 drift detector', () => {
    const dispatcher = read('[Admin System] DINOCO Claim Flash Dispatcher');

    test('V.0.5 header documents Phase 3.6 print enqueue', () => {
        expect(dispatcher).toMatch(/Version:\s*V\.0\.5\s*\(2026-05-14\)\s*—\s*Sprint 28 Phase 3\.3\+3\.6/);
    });

    test('Helper fires do_action(dinoco/claim/flash_created) on success', () => {
        // Wrapped in try/catch — exception must not block Flash response
        expect(dispatcher).toMatch(/do_action\(\s*['"]dinoco\/claim\/flash_created['"]/);
    });

    test('flash_created action wrapped in try/catch (HR1 hook chain pattern)', () => {
        // The action fire must sit inside a try { ... } catch ( \Throwable
        const sliced = dispatcher.split('do_action( \'dinoco/claim/flash_created\'')[1] || '';
        const preceding = dispatcher.split('do_action( \'dinoco/claim/flash_created\'')[0] || '';
        // The 100 chars before the action call should include `try {`
        expect(preceding.slice(-200)).toMatch(/try\s*\{/);
        // The next ~300 chars should include the catch block
        expect(sliced.slice(0, 600)).toMatch(/catch\s*\(\s*\\Throwable/);
    });

    test('Action payload includes all required keys', () => {
        const m = dispatcher.match(/do_action\(\s*['"]dinoco\/claim\/flash_created['"][\s\S]*?\)\s*;/);
        expect(m).not.toBeNull();
        if (m) {
            const block = m[0];
            expect(block).toMatch(/'claim_id'/);
            expect(block).toMatch(/'pno'/);
            expect(block).toMatch(/'direction'/);
            expect(block).toMatch(/'label_url'/);
            expect(block).toMatch(/'sort_code'/);
            expect(block).toMatch(/'out_trade_no'/);
            expect(block).toMatch(/'sender_key'/);
        }
    });

    test('Listener registered at priority 20', () => {
        expect(dispatcher).toMatch(/add_action\(\s*['"]dinoco\/claim\/flash_created['"],\s*['"]dinoco_claim_flash_enqueue_print_job['"],\s*20\s*,\s*1\s*\)/);
    });

    test('Listener SKIPS direction === inbound_pickup', () => {
        const m = dispatcher.match(/function\s+dinoco_claim_flash_enqueue_print_job[\s\S]+?^\}/m);
        expect(m).not.toBeNull();
        if (m) {
            expect(m[0]).toMatch(/\$direction\s*===\s*['"]inbound_pickup['"]/);
            // Must have an explicit `return;` inside the inbound_pickup branch
            expect(m[0]).toMatch(/inbound_pickup[\s\S]+?return\s*;/);
        }
    });

    test('b2b_enqueue_claim_print_job helper exists with function_exists guard', () => {
        expect(dispatcher).toMatch(/if\s*\(\s*!\s*function_exists\(\s*['"]b2b_enqueue_claim_print_job['"]\s*\)\s*\)\s*\{/);
        expect(dispatcher).toMatch(/function\s+b2b_enqueue_claim_print_job\(\s*\$claim_id,\s*array\s+\$payload\s*\)/);
    });

    test('Helper rejects non-claim_ticket post types', () => {
        const m = dispatcher.match(/function\s+b2b_enqueue_claim_print_job[\s\S]+?^\s{0,4}\}\s*\n\s*\}/m);
        expect(m).not.toBeNull();
        if (m) {
            expect(m[0]).toMatch(/get_post_type\(\s*\$claim_id\s*\)\s*!==\s*['"]claim_ticket['"]/);
        }
    });

    test('Helper writes _claim_flash_print_jobs[] with status=queued + source=claim_flash', () => {
        expect(dispatcher).toMatch(/update_post_meta\(\s*\$claim_id,\s*['"]_claim_flash_print_jobs['"]/);
        expect(dispatcher).toMatch(/'status'\s*=>\s*['"]queued['"]/);
        expect(dispatcher).toMatch(/'source'\s*=>\s*['"]claim_flash['"]/);
    });

    test('Helper dedups by PNO before insert', () => {
        const m = dispatcher.match(/function\s+b2b_enqueue_claim_print_job[\s\S]+?update_post_meta/);
        expect(m).not.toBeNull();
        if (m) {
            // Loop over $jobs comparing pno → return false
            expect(m[0]).toMatch(/foreach\s*\(\s*\$jobs\s+as\s+\$existing\s*\)/);
            expect(m[0]).toMatch(/\$existing\['pno'\]\s*===\s*\$pno/);
        }
    });

    test('Successful enqueue fires do_action(dinoco/claim/flash_print_enqueued)', () => {
        expect(dispatcher).toMatch(/do_action\(\s*['"]dinoco\/claim\/flash_print_enqueued['"]/);
    });

    test('Listener catches Throwable + obs_capture R11 signature', () => {
        const m = dispatcher.match(/function\s+dinoco_claim_flash_enqueue_print_job[\s\S]+?^\}/m);
        expect(m).not.toBeNull();
        if (m) {
            expect(m[0]).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)/);
            // R11 signature — first arg = level string, NOT Throwable
            expect(m[0]).toMatch(/dinoco_obs_capture\(\s*['"]error['"]\s*,\s*['"]claim_flash_print_enqueue_exception['"]/);
        }
    });

    test('Skipped inbound_pickup logs obs at info level (not error)', () => {
        // Should log info-level when SKIP fires (operational visibility)
        expect(dispatcher).toMatch(/dinoco_obs_capture\(\s*['"]info['"]\s*,\s*['"]claim_flash_print_skip_inbound['"]/);
    });

    test('Phase 3.6 header section documented', () => {
        expect(dispatcher).toMatch(/Phase 3\.6\s+—\s+Print queue enqueue listener/);
    });

    test('Reuse /b2b/v1/print-queue pattern referenced in inline docs', () => {
        // Spec line 1062 — reuse /b2b/v1/print-queue insert
        expect(dispatcher).toMatch(/\/b2b\/v1\/print-queue/);
    });

    test('REG-029 kill-switch preserved — flag OFF = byte-identical no-op', () => {
        expect(dispatcher).toMatch(/if\s*\(\s*!\s*get_option\(\s*['"]dinoco_claim_flash_enabled['"]/);
        expect(dispatcher).toMatch(/REG-029/);
    });
});
