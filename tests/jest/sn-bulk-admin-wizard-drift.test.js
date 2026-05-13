/**
 * OP-3 Bulk Admin Actions Wizard drift detector — Phase 7 P1 (2026-05-13)
 *
 * Plan v2.13 §K.4 — admin-side bulk operations on plates.
 * V.0.45 MVP: 2 endpoints (bulk/void + bulk/export).
 *
 * Locks the implementation in `[System] DINOCO SN REST API` V.0.45.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const REST_API = path.join(REPO_ROOT, "[System] DINOCO SN REST API");

function stripComments(src) {
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

describe("OP-3 Bulk Admin Actions Wizard (Phase 7 P1)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(REST_API, "utf8"));
    });

    describe("REST route registration", () => {
        test("POST /bulk/void registered", () => {
            expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE,\s*['"]\/bulk\/void['"]/);
        });

        test("GET /bulk/export registered", () => {
            expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE,\s*['"]\/bulk\/export['"]/);
        });

        test("/bulk/void permission_callback is admin-only", () => {
            const idx = code.indexOf("'/bulk/void'");
            const block = code.slice(idx, idx + 600);
            expect(block).toMatch(/'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
            expect(block).toMatch(/'callback'\s*=>\s*'dinoco_sn_rest_bulk_void'/);
        });

        test("/bulk/export permission_callback is admin-only", () => {
            const idx = code.indexOf("'/bulk/export'");
            const block = code.slice(idx, idx + 600);
            expect(block).toMatch(/'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
            expect(block).toMatch(/'callback'\s*=>\s*'dinoco_sn_rest_bulk_export'/);
        });
    });

    describe("Bulk void handler", () => {
        test("handler defined", () => {
            expect(code).toMatch(/function\s+dinoco_sn_rest_bulk_void\s*\(/);
        });

        test("enforces max 100 plates per call", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/count\(\s*\$sns\s*\)\s*>\s*100/);
            expect(body).toMatch(/'bulk_too_large'/);
        });

        test("requires reason >= 10 chars", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/strlen\(\s*\$reason\s*\)\s*<\s*10/);
        });

        test("server-side guard: only allows in_pool/reserved status", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            // The guard is: ! in_array( $row->status, array( 'in_pool', 'reserved' ), true )
            expect(body).toMatch(/in_array\(\s*\$row->status,\s*array\(\s*'in_pool',\s*'reserved'\s*\)/);
        });

        test("per-SN atomic transaction (FOR UPDATE + COMMIT/ROLLBACK)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/SELECT\s+sn,\s*status,\s*batch_id\s+FROM\s+\{\$pool\}\s+WHERE\s+sn = %s\s+FOR UPDATE/);
            expect(body).toMatch(/START TRANSACTION/);
            expect(body).toMatch(/COMMIT/);
            expect(body).toMatch(/ROLLBACK/);
        });

        test("uses unified lock key helper (R3 pattern)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/dinoco_sn_lock_name\(\s*\$sn\s*\)/);
            // Falls back to inline md5 if helper missing
            expect(body).toMatch(/'dnc_sn_'\s*\.\s*md5\(\s*\$sn\s*\)/);
        });

        test("fires status_changed dispatcher (R3 cache invalidation chain)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/dinoco_sn_fire_status_changed\(\s*\$sn,\s*\$prev,\s*'voided'/);
        });

        test("idempotency wrapper with sorted SNs in hash", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/dinoco_idempotency_check/);
            expect(body).toMatch(/sort\(\s*\$sns_sorted\s*\)/);
            expect(body).toMatch(/'dinoco-sn\/v1::bulk\/void'/);
        });

        test("Telegram alert when >20 voided (abuse detection)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            expect(body).toMatch(/\$ok\s*>\s*20/);
            expect(body).toMatch(/b2b_send_text_to_group\(\s*B2B_ADMIN_GROUP_ID/);
        });

        test("rate limit reuse — b2b_rate_limit 5/10min (R7/R8 3-arg sig)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_void");
            const body = code.slice(idx, idx + 8000);
            // R7/R8 signature: b2b_rate_limit($key, $max=10, $window=60) — key INCLUDES uid suffix
            expect(body).toMatch(/b2b_rate_limit\(\s*'sn_bulk_void_'\s*\.\s*\$uid,\s*5,\s*600\s*\)/);
        });
    });

    describe("Bulk export handler", () => {
        test("handler defined", () => {
            expect(code).toMatch(/function\s+dinoco_sn_rest_bulk_export\s*\(/);
        });

        test("max 10K rows cap", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/min\(\s*10000,/);
        });

        test("rate limit 10/hour/user (data exfil defense) — R7/R8 3-arg sig", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/b2b_rate_limit\(\s*'sn_bulk_export_'\s*\.\s*get_current_user_id\(\),\s*10,\s*3600\s*\)/);
        });

        test("UTF-8 BOM + RFC 4180 CSV escaping", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/xEF\\xBB\\xBF/);  // BOM bytes
            // RFC 4180 quote escaping: " → ""
            expect(body).toMatch(/str_replace\(\s*'"',\s*'""'/);
        });

        test("PII gate — dinoco_sn_view_pii cap masks user_id", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/current_user_can\(\s*'dinoco_sn_view_pii'\s*\)/);
            expect(body).toMatch(/'MASKED'/);
        });

        test("audit row per export (PDPA traceability)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/dinoco_sn_audit_log\(/);
            expect(body).toMatch(/'bulk_export'/);
        });

        test("Content-Disposition + Content-Type CSV headers", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/Content-Type[\s\S]{0,80}text\/csv/);
            expect(body).toMatch(/Content-Disposition[\s\S]{0,80}attachment/);
        });

        test("reuses /search SQL filters (q, status, batch_id)", () => {
            const idx = code.indexOf("function dinoco_sn_rest_bulk_export");
            const body = code.slice(idx, idx + 6000);
            expect(body).toMatch(/\$q\s*=\s*trim\(/);
            expect(body).toMatch(/\$status\s*=\s*\(string\)/);
            expect(body).toMatch(/\$batchId\s*=\s*\(int\)/);
        });
    });
});
