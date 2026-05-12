/**
 * R12 drift detector — SN cron handlers must write heartbeat in finally block
 * (not bare statement after try/catch, not inside try block).
 *
 * Background: R11 deferred HIGH-1 to R12. 14 SN cron handlers had heartbeats
 * scattered: some inside try block (CATEGORY C BUG — if catch fires, no
 * heartbeat → Health Monitor reports "never ran"), some bare after try/catch
 * (CATEGORY A DEFENSE — vulnerable to catch-block re-throw), two at top-of-fn
 * (CATEGORY B INTENTIONAL — preserved).
 *
 * R12 fix: 10 of 12 crons converted to try/catch/finally pattern. This test
 * locks the pattern in — future regressions caught at CI.
 *
 * Skipped (Category B): orphan_claim_scan + notification_send write heartbeat
 * BEFORE the work begins (intentional "I started" telemetry).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const SN_MANAGER = path.join(REPO_ROOT, "[Admin System] DINOCO Production SN Manager");

function stripComments(src) {
    return src
        .split("\n")
        .filter((line) => {
            const t = line.trim();
            // strip C-style comment-block lines (* ... and /* / */)
            if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
            // strip line comments
            if (t.startsWith("//")) return false;
            return true;
        })
        .join("\n");
}

describe("SN cron heartbeat finally block (R12)", () => {
    let src;
    let code;

    beforeAll(() => {
        src = fs.readFileSync(SN_MANAGER, "utf8");
        code = stripComments(src);
    });

    // The 10 crons that R12 converted to finally pattern
    const FINALLY_PATTERN_CRONS = [
        { fn: "dinoco_sn_run_low_pool_alert", key: "dinoco_cron_sn_low_pool_alert_last_run" },
        { fn: "dinoco_sn_run_audit_retention", key: "dinoco_cron_sn_audit_retention_last_run" },
        { fn: "dinoco_sn_run_audit_pepper_rotate", key: "dinoco_cron_sn_audit_pepper_rotate_last_run" },
        { fn: "dinoco_sn_run_batch_reconcile", key: "dinoco_cron_sn_batch_reconcile_last_run" },
        { fn: "dinoco_sn_run_expiry_schedule", key: "dinoco_cron_sn_expiry_schedule_last_run" },
        { fn: "dinoco_sn_run_demand_forecast", key: "dinoco_cron_sn_demand_forecast_last_run" },
        { fn: "dinoco_sn_run_marketplace_timeout", key: "dinoco_cron_sn_marketplace_timeout_last_run" },
        { fn: "dinoco_sn_run_gray_market_scan", key: "dinoco_cron_sn_gray_market_scan_last_run" },
        { fn: "dinoco_sn_run_ltv_snapshot", key: "dinoco_cron_sn_ltv_snapshot_last_run" },
        { fn: "dinoco_sn_run_anniversary_schedule", key: "dinoco_cron_sn_anniversary_schedule_last_run" },
        { fn: "dinoco_sn_run_review_request_schedule", key: "dinoco_cron_sn_review_request_last_run" },
        { fn: "dinoco_sn_run_pool_stats_recompute", key: "dinoco_cron_sn_pool_stats_recompute_last_run" },
    ];

    FINALLY_PATTERN_CRONS.forEach(({ fn, key }) => {
        test(`${fn} writes heartbeat ${key} inside finally block`, () => {
            // Find function body
            const fnIdx = code.indexOf(`function ${fn}(`);
            expect(fnIdx).toBeGreaterThan(-1);

            // Find end of function (next top-level function or class brace at col 0)
            // Heuristic: scan ahead up to ~6000 chars
            const body = code.slice(fnIdx, fnIdx + 8000);

            // The heartbeat update_option call must appear inside finally block
            const finallyIdx = body.indexOf("} finally {");
            expect(finallyIdx).toBeGreaterThan(-1);

            // The next occurrence of the heartbeat key AFTER finally must be the active write
            const keyIdx = body.indexOf(key, finallyIdx);
            expect(keyIdx).toBeGreaterThan(-1);

            // Sanity: keyIdx must come BEFORE the closing brace of finally (within ~500 chars)
            expect(keyIdx - finallyIdx).toBeLessThan(500);
        });
    });

    test("audit_pepper_rotate has only ONE heartbeat write (deduped from V.0.57)", () => {
        const fnIdx = code.indexOf("function dinoco_sn_run_audit_pepper_rotate(");
        const body = code.slice(fnIdx, fnIdx + 4000);
        const matches = body.match(/dinoco_cron_sn_audit_pepper_rotate_last_run/g) || [];
        // Allow 1 (the finally write) — duplicate write at line 9553 in V.0.57 should be removed
        expect(matches.length).toBe(1);
    });

    test("marketplace_timeout heartbeat NOT inside try block (Category C bug fix)", () => {
        const fnIdx = code.indexOf("function dinoco_sn_run_marketplace_timeout(");
        const body = code.slice(fnIdx, fnIdx + 6000);
        const finallyIdx = body.indexOf("} finally {");
        const keyIdx = body.indexOf("dinoco_cron_sn_marketplace_timeout_last_run", finallyIdx);
        // Must appear AFTER finally — not buried inside try block
        expect(keyIdx).toBeGreaterThan(finallyIdx);
    });

    test("pool_stats_recompute heartbeat NOT inside try block (Category C bug fix)", () => {
        const fnIdx = code.indexOf("function dinoco_sn_run_pool_stats_recompute(");
        const body = code.slice(fnIdx, fnIdx + 4000);
        const finallyIdx = body.indexOf("} finally {");
        const keyIdx = body.indexOf("dinoco_cron_sn_pool_stats_recompute_last_run", finallyIdx);
        expect(keyIdx).toBeGreaterThan(finallyIdx);
    });
});
