/**
 * RD-2 CLV Cohort Analysis drift detector — Phase 7 P3 (2026-05-13)
 *
 * Plan v2.13 Phase 6 backlog RD-2: extend Tab 6 LTV with cohort segmentation.
 * V.0.46 MVP: REST endpoint /ltv/cohorts returns signup-month × tier matrix.
 *
 * Locks the implementation in `[System] DINOCO SN REST API` V.0.46.
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

describe("RD-2 CLV Cohort Analysis (Phase 7 P3)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(REST_API, "utf8"));
    });

    test("GET /ltv/cohorts route registered", () => {
        expect(code).toMatch(/register_rest_route\(\s*DINOCO_SN_REST_NAMESPACE,\s*['"]\/ltv\/cohorts['"]/);
    });

    test("Permission callback is admin-only", () => {
        const idx = code.indexOf("'/ltv/cohorts'");
        const block = code.slice(idx, idx + 600);
        expect(block).toMatch(/'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
        expect(block).toMatch(/'callback'\s*=>\s*'dinoco_sn_rest_ltv_cohorts'/);
    });

    test("months_back arg has sanitize callback (max 60)", () => {
        const idx = code.indexOf("'/ltv/cohorts'");
        const block = code.slice(idx, idx + 600);
        expect(block).toMatch(/'months_back'/);
        expect(block).toMatch(/min\(\s*60,/);
    });

    test("Handler function defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_rest_ltv_cohorts\s*\(/);
    });

    test("Handler guards: feature_disabled + ltv_snapshot table_exists", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/dinoco_sn_is_enabled\(\)/);
        expect(body).toMatch(/dinoco_sn_table_exists\(\s*['"]ltv_snapshot['"]\s*\)/);
    });

    test("Table missing returns stub (not error) — graceful degrade", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        // Returns rest_ensure_response with empty cohorts + note
        expect(body).toMatch(/'note'\s*=>\s*'ltv_snapshot table not installed/);
    });

    test("Rate limit reuse — 30/hr/user (R7/R8 3-arg sig)", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/b2b_rate_limit\(\s*'sn_ltv_cohorts_'\s*\.\s*get_current_user_id\(\),\s*30,\s*3600\s*\)/);
    });

    test("SQL aggregation: DATE_FORMAT first_purchase_date → cohort_month", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/DATE_FORMAT\(first_purchase_date,\s*'%%Y-%%m'\)\s*AS\s*cohort_month/);
    });

    test("SQL groups by cohort_month + loyalty_tier", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/GROUP BY\s+cohort_month,\s*loyalty_tier/);
    });

    test("SQL aggregates customer_count + active_count + sum_spent + avg_spent", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/COUNT\(\*\)\s*AS\s*customer_count/);
        expect(body).toMatch(/SUM\(active_warranties_count\s*>\s*0\)\s*AS\s*active_count/);
        expect(body).toMatch(/SUM\(total_lifetime_spent\)\s*AS\s*sum_spent/);
        expect(body).toMatch(/AVG\(total_lifetime_spent\)\s*AS\s*avg_spent/);
    });

    test("SQL uses prepare() with months_back cutoff", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/\$wpdb->prepare\(/);
        expect(body).toMatch(/first_purchase_date\s*>=\s*%s/);
    });

    test("Response includes 5-tier order array (bronze→diamond)", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/array\(\s*'bronze',\s*'silver',\s*'gold',\s*'platinum',\s*'diamond'\s*\)/);
    });

    test("Response reshapes into cohorts (signup_month × tier matrix)", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/\$cohorts\[\s*\$cm\s*\]\[\s*\$tier\s*\]/);
    });

    test("Computes retention_pct per cohort/tier (active_count/customer_count)", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/'retention_pct'\s*=>\s*\$count\s*>\s*0\s*\?\s*round\(\s*\(\s*\$active\s*\/\s*\$count\s*\)\s*\*\s*100/);
    });

    test("Returns monthly_totals + tier_totals + grand_total", () => {
        const idx = code.indexOf("function dinoco_sn_rest_ltv_cohorts");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/'monthly_totals'\s*=>\s*\$monthly_list/);
        expect(body).toMatch(/'tier_totals'\s*=>\s*\$tier_totals/);
        expect(body).toMatch(/'grand_total'\s*=>\s*\$grand/);
    });
});
