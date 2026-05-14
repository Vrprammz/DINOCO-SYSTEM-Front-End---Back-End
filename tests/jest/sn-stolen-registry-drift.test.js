/**
 * F#14 Stolen Plate Registry drift detector — Phase 3 W11 (2026-05-14)
 *
 * Boss Q23 (docs/sn-system/07-boss-decisions-log.md): admin-only verify.
 * Public stolen lookup deferred to Phase 6+ — Member Dashboard report form +
 * SN Manager Tab 9 admin review is sufficient.
 *
 * Locks (end-to-end wiring of F#14):
 *   - [System] DINOCO SN REST API V.0.36+ — 5 REST endpoints registered
 *     (/stolen/report, /stolen/list, /stolen/{id}/decision, /stolen/{id}/recover,
 *      /stolen/verify/{sn}) + R7 C3 layered rate-limit (user/IP/SN).
 *   - [Admin System] DINOCO Production SN Manager V.0.59+ — Tab 9 "🚓 Stolen"
 *     + table + recover modal + tab handler + status enum includes 'stolen'.
 *   - [System] Dashboard - Assets List V.31.0+ — F#14 modal singleton +
 *     dncSnOpenStolenModal + dncSnSubmitStolen → POST /stolen/report.
 *   - Schema: wp_dinoco_sn_stolen_log table installed by dinoco_sn_install_schema()
 *     + sn_pool 'stolen_at' / 'stolen_police_report' columns.
 *
 * Cross-cuts with:
 *   - SnStolenReportTest.php (report state-machine + evidence + ownership)
 *   - SnStolenRecoveryTest.php (recovery state-machine + Flex builder)
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const REST_API = path.join(REPO_ROOT, "[System] DINOCO SN REST API");
const SN_MANAGER = path.join(REPO_ROOT, "[Admin System] DINOCO Production SN Manager");
const ASSETS_LIST = path.join(REPO_ROOT, "[System] Dashboard - Assets List");

function stripPhpComments(src) {
    // Strip line+block comments so version headers like
    //   "* /stolen/report layered rate-limit"
    // don't trigger false-positives in negative regex assertions.
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).join("\n");
}

describe("F#14 Stolen Registry — REST endpoints ([System] DINOCO SN REST API V.0.36+)", () => {
    let code;
    beforeAll(() => { code = stripPhpComments(fs.readFileSync(REST_API, "utf8")); });

    test("POST /stolen/report registered", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE\s*,\s*['"]\/stolen\/report['"]/);
        expect(code).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_sn_rest_stolen_report['"]/);
    });

    test("GET /stolen/list registered (admin review queue)", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE\s*,\s*['"]\/stolen\/list['"]/);
        expect(code).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_sn_rest_stolen_list['"]/);
    });

    test("POST /stolen/{id}/decision registered (admin verify/close)", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE\s*,\s*['"]\/stolen\/\(\?P<id>\\d\+\)\/decision['"]/);
        expect(code).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_sn_rest_stolen_decision['"]/);
    });

    test("POST /stolen/{id}/recover registered (W11.2 dedicated recovery)", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE\s*,\s*['"]\/stolen\/\(\?P<id>\\d\+\)\/recover['"]/);
        expect(code).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_sn_rest_stolen_recover['"]/);
    });

    test("GET /stolen/verify/{sn} registered (Q23 admin-only)", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE\s*,\s*['"]\/stolen\/verify\/\(\?P<sn>\[A-Za-z0-9\]\+\)['"]/);
        expect(code).toMatch(/['"]callback['"]\s*=>\s*['"]dinoco_sn_rest_stolen_verify['"]/);
    });

    test("All 5 stolen handlers defined", () => {
        expect(code).toMatch(/function dinoco_sn_rest_stolen_report\b/);
        expect(code).toMatch(/function dinoco_sn_rest_stolen_list\b/);
        expect(code).toMatch(/function dinoco_sn_rest_stolen_decision\b/);
        expect(code).toMatch(/function dinoco_sn_rest_stolen_recover\b/);
        expect(code).toMatch(/function dinoco_sn_rest_stolen_verify\b/);
    });

    test("R7 C3 layered rate-limit — per-user 5/hr", () => {
        expect(code).toMatch(/b2b_rate_limit\(\s*['"]sn_stolen_user_['"]\s*\.\s*\$current_uid\s*,\s*5\s*,\s*HOUR_IN_SECONDS/);
    });

    test("R7 C3 layered rate-limit — per-IP 10/hr md5-hashed", () => {
        expect(code).toMatch(/b2b_rate_limit\(\s*['"]sn_stolen_ip_['"]\s*\.\s*md5\(\s*\$ip\s*\)\s*,\s*10\s*,\s*HOUR_IN_SECONDS/);
    });

    test("R7 C3 layered rate-limit — per-SN 3/24h md5-hashed", () => {
        expect(code).toMatch(/b2b_rate_limit\(\s*['"]sn_stolen_sn_['"]\s*\.\s*md5\(\s*\$sn_param\s*\)\s*,\s*3\s*,\s*DAY_IN_SECONDS/);
    });

    test("Photo evidence required (V.0.28 HIGH-4)", () => {
        expect(code).toMatch(/photo_evidence_required/);
        expect(code).toMatch(/evidence_attachment_ids/);
    });

    test("State gate rejects terminal voided/recalled (409 already_terminal)", () => {
        expect(code).toMatch(/in_array\(\s*\$row\['status'\]\s*,\s*array\(\s*['"]voided['"]\s*,\s*['"]recalled['"]\s*\)/);
        expect(code).toMatch(/already_terminal/);
    });

    test("Ownership gate — customer can only report own plate", () => {
        expect(code).toMatch(/You can only report your own plate as stolen/);
    });

    test("Atomic transaction wraps pool flip (GET_LOCK pattern via START TRANSACTION + FOR UPDATE)", () => {
        // Bound to end of stolen_report function (next function definition or end of file).
        const reportFn = code.split(/function dinoco_sn_rest_stolen_report/)[1];
        expect(reportFn).toBeDefined();
        const upTo = reportFn.split(/\nif\s*\(\s*!\s*function_exists\(\s*['"]dinoco_sn_rest_stolen_/)[0];
        expect(upTo).toMatch(/START TRANSACTION/);
        expect(upTo).toMatch(/FOR UPDATE/);
        expect(upTo).toMatch(/COMMIT/);
        expect(upTo).toMatch(/ROLLBACK/);
    });

    test("Status changed dispatcher fired post-COMMIT (R7 BLOCKER 2 fix)", () => {
        const reportFn = code.split(/function dinoco_sn_rest_stolen_report/)[1];
        expect(reportFn).toBeDefined();
        const upTo = reportFn.split(/\nif\s*\(\s*!\s*function_exists\(\s*['"]dinoco_sn_rest_stolen_/)[0];
        expect(upTo).toMatch(/dinoco_sn_fire_status_changed\(\s*\$sn\s*,\s*\$row\['status'\]\s*,\s*['"]recalled['"]/);
    });
});

describe("F#14 Stolen Registry — Admin Tab 9 ([Admin System] DINOCO Production SN Manager V.0.59+)", () => {
    let code;
    beforeAll(() => { code = stripPhpComments(fs.readFileSync(SN_MANAGER, "utf8")); });

    test("Tab 9 button '🚓 Stolen' rendered", () => {
        expect(code).toMatch(/data-tab=['"]stolen['"][^>]*>\s*🚓\s*Stolen/);
    });

    test("Tab panel section[data-tab-panel='stolen'] renders dinoco_sn_render_tab_stolen()", () => {
        expect(code).toMatch(/data-tab-panel=['"]stolen['"]/);
        expect(code).toMatch(/dinoco_sn_render_tab_stolen\(\s*\)/);
    });

    test("Tab handler renderer defined", () => {
        expect(code).toMatch(/function dinoco_sn_render_tab_stolen\(\s*\)/);
    });

    test("Stolen table markup present (#dnc-sn-stolen-table)", () => {
        expect(code).toMatch(/id=['"]dnc-sn-stolen-table['"]/);
    });

    test("Status filter dropdown (#dnc-sn-stolen-status) wired", () => {
        expect(code).toMatch(/id=['"]dnc-sn-stolen-status['"]/);
    });

    test("Recover modal (#dnc-sn-stolen-recover-modal) defined", () => {
        expect(code).toMatch(/id=['"]dnc-sn-stolen-recover-modal['"]/);
    });

    test("Tab lazy-load via dncSnLoadStolen handler", () => {
        expect(code).toMatch(/window\.dncSnLoadStolen/);
        expect(code).toMatch(/_dncSnStolenLoaded/);
    });

    test("Recover decision posts to /stolen/{id}/decision", () => {
        expect(code).toMatch(/REST_BASE\s*\+\s*['"]\/stolen\/['"]\s*\+\s*id\s*\+\s*['"]\/decision['"]/);
    });

    test("Recover modal posts to /stolen/{id}/recover", () => {
        expect(code).toMatch(/REST_BASE\s*\+\s*['"]\/stolen\/['"]\s*\+\s*ctx\.id\s*\+\s*['"]\/recover['"]/);
    });

    test("Idempotency-Key header sent on decision + recover", () => {
        expect(code).toMatch(/['"]X-Idempotency-Key['"]\s*:\s*['"]stolen-['"]/);
        expect(code).toMatch(/['"]X-Idempotency-Key['"]\s*:\s*['"]stolen-recover-/);
    });

    test("sn_pool status ENUM includes 'stolen' (schema lazy-install)", () => {
        // From dinoco_sn_install_schema() CREATE TABLE statement
        expect(code).toMatch(/'reserved_for_legacy'\s*,\s*'shipped_legacy'\s*,\s*'cancelled_batch'\s*,\s*'stolen'/);
    });

    test("wp_dinoco_sn_stolen_log table CREATE statement present", () => {
        expect(code).toMatch(/CREATE TABLE\s+\{\$prefix\}dinoco_sn_stolen_log/);
    });

    test("stolen_at + stolen_police_report columns on sn_pool", () => {
        expect(code).toMatch(/stolen_at\s+DATETIME\s+DEFAULT\s+NULL/);
        expect(code).toMatch(/stolen_police_report\s+VARCHAR\(64\)\s+DEFAULT\s+NULL/);
    });

    test("idx_stolen index on sn_pool.stolen_at", () => {
        expect(code).toMatch(/KEY\s+idx_stolen\s*\(\s*stolen_at\s*\)/);
    });

    test("Table registry maps 'stolen_log' → dinoco_sn_stolen_log", () => {
        expect(code).toMatch(/'stolen_log'\s*=>\s*'dinoco_sn_stolen_log'/);
    });
});

describe("F#14 Stolen Registry — Member-side report modal ([System] Dashboard - Assets List V.31.0+)", () => {
    let code;
    beforeAll(() => { code = stripPhpComments(fs.readFileSync(ASSETS_LIST, "utf8")); });

    test("Asset card overflow has 'รายงานหาย' button with data-action='stolen'", () => {
        expect(code).toMatch(/data-action=['"]stolen['"]/);
        expect(code).toMatch(/🚨\s*รายงานหาย/);
    });

    test("Stolen modal singleton (#dnc-sn-asset-card-stolen-modal) defined", () => {
        expect(code).toMatch(/id=['"]dnc-sn-asset-card-stolen-modal['"]/);
        expect(code).toMatch(/role=['"]dialog['"]/);
    });

    test("Modal form has required police report fields", () => {
        expect(code).toMatch(/name=['"]police_report_no['"][^>]*required/);
        expect(code).toMatch(/name=['"]police_station['"][^>]*required/);
        expect(code).toMatch(/name=['"]incident_date['"][^>]*required/);
    });

    test("Modal trigger function dncSnOpenStolenModal exported on window", () => {
        expect(code).toMatch(/function dncSnOpenStolenModal\s*\(/);
        expect(code).toMatch(/window\.dncSnOpenStolenModal\s*=\s*dncSnOpenStolenModal/);
    });

    test("Submit handler POSTs to /dinoco-sn/v1/stolen/report", () => {
        expect(code).toMatch(/fetch\(\s*['"]\/wp-json\/dinoco-sn\/v1\/stolen\/report['"]/);
    });

    test("Stolen state recognized by card-state resolver (yields 'stolen')", () => {
        expect(code).toMatch(/return\s+['"]stolen['"]/);
    });

    test("Stolen state → primary CTA hands off to LINE admin (red deep-link)", () => {
        expect(code).toMatch(/ขอยกเลิกรายงานหาย\s*S\/N/);
    });

    test("Disabled state — stolen plates can't be re-reported (button[disabled])", () => {
        expect(code).toMatch(/\$is_stolen\s*\?\s*['"]disabled['"]/);
    });
});
