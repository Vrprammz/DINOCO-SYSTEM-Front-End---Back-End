/**
 * F#8 Marketplace status endpoint drift detector — Phase 7 P0 B1 (2026-05-13)
 *
 * Customer LIFF (`[System] DINOCO Warranty Extension Marketplace`) polls
 * `GET marketplace/{id}/status` every 10s after slip upload, waiting for
 * admin to verify the slip. Route was MISSING from rest_api_init registration
 * → LIFF stuck in 404 verify loop forever.
 *
 * This drift detector locks the route + handler in `[System] DINOCO SN REST API`
 * V.0.44 to prevent future regressions.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const REST_API = path.join(REPO_ROOT, "[System] DINOCO SN REST API");
const LIFF     = path.join(REPO_ROOT, "[System] DINOCO Warranty Extension Marketplace");

function stripComments(src) {
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

describe("F#8 Marketplace /{id}/status endpoint (P0 B1 bug fix)", () => {
    let restApi;
    let liff;

    beforeAll(() => {
        restApi = stripComments(fs.readFileSync(REST_API, "utf8"));
        liff    = fs.readFileSync(LIFF, "utf8"); // keep comments for poll-call match
    });

    test("Customer LIFF polls marketplace/{id}/status", () => {
        // The LIFF poll loop calls api('GET', 'marketplace/' + STATE.extensionId + '/status')
        expect(liff).toMatch(/marketplace\/.*\+\s*STATE\.extensionId\s*\+\s*['"]\/status['"]/);
    });

    test("REST API registers /marketplace/{id}/status route", () => {
        expect(restApi).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE,\s*['"]\/marketplace\/\(\?P<id>\\d\+\)\/status['"]/);
    });

    test("Route callback is dinoco_sn_rest_marketplace_status", () => {
        // Find the status route registration block + verify callback
        const idx = restApi.indexOf("'/marketplace/(?P<id>\\d+)/status'");
        expect(idx).toBeGreaterThan(-1);
        const block = restApi.slice(idx, idx + 600);
        expect(block).toMatch(/'callback'\s*=>\s*'dinoco_sn_rest_marketplace_status'/);
    });

    test("Route permission_callback is logged_in (not admin-only)", () => {
        const idx = restApi.indexOf("'/marketplace/(?P<id>\\d+)/status'");
        const block = restApi.slice(idx, idx + 600);
        // Customer LIFF polls this — must be logged_in not admin
        expect(block).toMatch(/'permission_callback'\s*=>\s*'dinoco_sn_perm_logged_in'/);
    });

    test("Handler function defined", () => {
        expect(restApi).toMatch(/function\s+dinoco_sn_rest_marketplace_status\s*\(/);
    });

    test("Handler enforces owner-only access (with admin bypass)", () => {
        const idx = restApi.indexOf("function dinoco_sn_rest_marketplace_status");
        const body = restApi.slice(idx, idx + 4000);
        // Owner check: $ext->user_id !== $user_id && ! current_user_can('manage_options')
        expect(body).toMatch(/\$ext->user_id\s*!==\s*\$user_id/);
        expect(body).toMatch(/current_user_can\(\s*'manage_options'\s*\)/);
    });

    test("Handler returns status field (LIFF switches on this)", () => {
        const idx = restApi.indexOf("function dinoco_sn_rest_marketplace_status");
        const body = restApi.slice(idx, idx + 4000);
        // Response must include 'status' key from payment_status column
        expect(body).toMatch(/['"]status['"]\s*=>\s*\(string\)\s*\$ext->payment_status/);
    });

    test("Paid status response includes warranty_until_new (for showSuccess)", () => {
        const idx = restApi.indexOf("function dinoco_sn_rest_marketplace_status");
        const body = restApi.slice(idx, idx + 4000);
        // showSuccess(d) reads d.new_warranty_end at LIFF line ~1525
        expect(body).toMatch(/['"]new_warranty_end['"]/);
    });

    test("Rejected status response includes rejection_reason (for showRejected)", () => {
        const idx = restApi.indexOf("function dinoco_sn_rest_marketplace_status");
        const body = restApi.slice(idx, idx + 4000);
        expect(body).toMatch(/['"]rejection_reason['"]/);
    });

    test("Handler defensive — feature_disabled gate + schema_not_ready gate", () => {
        const idx = restApi.indexOf("function dinoco_sn_rest_marketplace_status");
        const body = restApi.slice(idx, idx + 4000);
        expect(body).toMatch(/dinoco_sn_marketplace_is_enabled/);
        expect(body).toMatch(/dinoco_sn_table_exists\(\s*['"]extensions['"]\s*\)/);
    });
});
