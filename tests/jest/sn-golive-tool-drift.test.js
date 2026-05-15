/**
 * SN Go-Live Tool drift detector (V.1.0)
 *
 * Boss has no SSH access — every Go-Live op runs through this admin
 * shortcode. Pins the REST API surface + flag whitelist + permission
 * gate so future refactors don't break the activation path.
 */

const fs = require("fs");
const path = require("path");

const SNIPPET = path.join(
  __dirname,
  "..",
  "..",
  "[Admin System] DINOCO SN Go-Live Tool"
);

describe("SN Go-Live Tool — admin activation shortcode (V.1.0)", () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(SNIPPET, "utf8");
  });

  describe("Shortcode + namespace", () => {
    test("registers [dinoco_sn_golive] shortcode", () => {
      expect(content).toMatch(
        /add_shortcode\(\s*'dinoco_sn_golive',\s*'dinoco_sn_golive_render'\s*\)/
      );
    });

    test("REST namespace /dinoco-sn-golive/v1/* registered", () => {
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/preflight'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/flag-status'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/flag-toggle'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/schema-install'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/role-matrix'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/role-assign'/);
      expect(content).toMatch(/'dinoco-sn-golive\/v1',\s*'\/monitor'/);
    });
  });

  describe("Security — permission gate + nonce + flag whitelist", () => {
    test("dinoco_sn_golive_perm — manage_options + wp_rest nonce", () => {
      expect(content).toMatch(/dinoco_sn_golive_perm/);
      expect(content).toMatch(/current_user_can\(\s*'manage_options'\s*\)/);
      expect(content).toMatch(/wp_verify_nonce\(\s*\$nonce,\s*'wp_rest'\s*\)/);
    });

    test("flag whitelist hardcoded (NOT derived from request param)", () => {
      expect(content).toMatch(/dinoco_sn_golive_flag_whitelist/);
      // Critical flags must be in whitelist
      expect(content).toMatch(/'dinoco_sn_system_enabled'/);
      expect(content).toMatch(/'dinoco_sn_marketplace_enabled'/);
      expect(content).toMatch(/'dinoco_sn_marketplace_refund_enabled'/);
      expect(content).toMatch(/'dinoco_sn_agent_webhook_enabled'/);
      expect(content).toMatch(/'dinoco_gdpr_enabled'/);
    });

    test("flag-toggle rejects non-whitelisted flag (security)", () => {
      expect(content).toMatch(
        /isset\(\s*\$whitelist\[\s*\$flag\s*\]\s*\)[\s\S]{0,200}flag_not_whitelisted/
      );
    });

    test("flag-toggle requires confirm=true typed param", () => {
      expect(content).toMatch(
        /flag_toggle[\s\S]{0,800}confirm[\s\S]{0,100}'true'[\s\S]{0,100}confirm_required/
      );
    });

    test("schema-install requires confirm=true", () => {
      expect(content).toMatch(
        /schema_install[\s\S]{0,800}confirm[\s\S]{0,100}'true'[\s\S]{0,100}confirm_required/
      );
    });

    test("role-assign restricts role to warehouse/approver/view_pii only", () => {
      expect(content).toMatch(
        /in_array\(\s*\$role,\s*array\(\s*'warehouse',\s*'approver',\s*'view_pii'\s*\),\s*true\s*\)/
      );
    });
  });

  describe("Audit + observability", () => {
    test("flag-toggle calls dinoco_flag_audit_log (function_exists guarded)", () => {
      expect(content).toMatch(
        /function_exists\(\s*'dinoco_flag_audit_log'\s*\)[\s\S]{0,200}dinoco_flag_audit_log\(/
      );
    });

    test("update_option uses autoload=false (Round 9 bloat fix)", () => {
      expect(content).toMatch(/update_option\(\s*\$flag,[\s\S]{0,100},\s*false\s*\)/);
    });
  });

  describe("Preflight — 9 gates", () => {
    test("9 checks defined in preflight", () => {
      const fn = content.match(/function\s+dinoco_sn_golive_preflight[\s\S]{0,8000}/);
      expect(fn).toBeTruthy();
      expect(fn[0]).toMatch(/'snippets_loaded'/);
      expect(fn[0]).toMatch(/'schema_15_tables'/);
      expect(fn[0]).toMatch(/'alter_products'/);
      expect(fn[0]).toMatch(/'idempotency_helper'/);
      expect(fn[0]).toMatch(/'line_constants'/);
      expect(fn[0]).toMatch(/'b2b_helpers'/);
      expect(fn[0]).toMatch(/'sku_configured'/);
      expect(fn[0]).toMatch(/'cron_scheduled'/);
    });

    test("schema check uses information_schema (not SHOW TABLES)", () => {
      expect(content).toMatch(
        /information_schema\.tables[\s\S]{0,200}dinoco_sn_/
      );
    });
  });

  describe("UX — no inline onclick handlers (UX-H3 compliant)", () => {
    test("uses data-action + data-flag-toggle + data-role-toggle delegation", () => {
      expect(content).toMatch(/data-action="preflight"/);
      expect(content).toMatch(/data-action="schema-install"/);
      expect(content).toMatch(/data-action="role-load"/);
      expect(content).toMatch(/data-action="flag-load"/);
      expect(content).toMatch(/data-action="monitor-load"/);
    });

    test("min-height 44px touch targets (iOS HIG)", () => {
      expect(content).toMatch(/min-height:\s*44px/);
    });
  });

  describe("Monitor 24h health", () => {
    test("Pool counts by status from sn_pool table", () => {
      expect(content).toMatch(
        /SELECT status,\s*COUNT\(\*\)[\s\S]{0,200}dinoco_sn_pool/
      );
    });

    test("Audit events 24h window", () => {
      expect(content).toMatch(/dinoco_sn_audit/);
      expect(content).toMatch(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+1\s+DAY\)/);
    });

    test("7 cron heartbeats tracked (F#1/F#4/F#10/QW-7/F#9/marketplace/audit)", () => {
      const fn = content.match(/function\s+dinoco_sn_golive_rest_monitor[\s\S]{0,3000}/);
      expect(fn).toBeTruthy();
      expect(fn[0]).toMatch(/dinoco_sn_expiry_reminder_cron/);
      expect(fn[0]).toMatch(/dinoco_sn_anniversary_cron/);
      expect(fn[0]).toMatch(/dinoco_sn_review_request_cron/);
      expect(fn[0]).toMatch(/dinoco_sn_service_reminder_cron/);
      expect(fn[0]).toMatch(/dinoco_sn_ltv_snapshot_cron/);
    });
  });

  describe("Version + DB_ID", () => {
    test("Version V.1.0 header", () => {
      expect(content).toMatch(/Version:\s*V\.1\.0.*Go-Live wizard/);
    });

    test("Shortcode name in header", () => {
      expect(content).toMatch(/Shortcode:\s*\[dinoco_sn_golive\]/);
    });
  });
});
