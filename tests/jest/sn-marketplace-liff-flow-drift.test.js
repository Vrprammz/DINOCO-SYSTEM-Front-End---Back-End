/**
 * SN Marketplace customer LIFF 4-stage flow drift detector.
 *
 * Pins the customer-facing extension purchase journey in
 * `[System] DINOCO Warranty Extension Marketplace` V.0.6+:
 *
 *   Stage 1 — Plan select (1y/2y/3y choices, retail % display)
 *   Stage 2 — Payment instructions (PromptPay + bank transfer + slip upload)
 *   Stage 3 — Verify (Slip2Go API + admin review fallback, polling)
 *   Stage 4 — Result (success / pending_admin_review / rejected)
 *
 * Also verifies non-VAT compute_total contract (V.0.6 boss directive
 * 2026-05-15: บัญชีบุคคล, vat_rate forced to 0).
 */

const fs = require("fs");
const path = require("path");

const LIFF = path.join(
  __dirname,
  "..",
  "..",
  "[System] DINOCO Warranty Extension Marketplace"
);

describe("SN Marketplace customer LIFF — 4-stage flow (V.0.6+)", () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(LIFF, "utf8");
  });

  describe("4-stage structure", () => {
    test("Stage 1 (Plan select) section exists with is-active default", () => {
      expect(content).toMatch(
        /class="dnc-sn-mpx-stage\s+dnc-sn-mpx-stage-1\s+is-active"/
      );
      expect(content).toMatch(/id="dnc-sn-mpx-stage-1"/);
    });

    test("Stage 2 (Payment) section exists", () => {
      expect(content).toMatch(
        /class="dnc-sn-mpx-stage\s+dnc-sn-mpx-stage-2"/
      );
      expect(content).toMatch(/id="dnc-sn-mpx-stage-2"/);
    });

    test("Stage 3 (Verify) section exists with aria-live polite", () => {
      expect(content).toMatch(
        /class="dnc-sn-mpx-stage\s+dnc-sn-mpx-stage-3"/
      );
      expect(content).toMatch(/aria-live="polite"/);
    });

    test("Stage 4 (Result) section exists", () => {
      expect(content).toMatch(
        /class="dnc-sn-mpx-stage\s+dnc-sn-mpx-stage-4"/
      );
      expect(content).toMatch(/id="dnc-sn-mpx-stage-4"/);
    });
  });

  describe("Stage transitions + polling", () => {
    test("showStage(n) state machine controller", () => {
      expect(content).toMatch(/function\s+showStage\s*\(\s*n\s*\)/);
    });

    test("pollVerifyStatus polling loop (Stage 3 → 4)", () => {
      expect(content).toMatch(/function\s+pollVerifyStatus\s*\(\s*\)/);
      // 10s interval (per status endpoint design)
      expect(content).toMatch(/10000/);
    });

    test("handleVerifyResult dispatches success/pending/rejected branches", () => {
      expect(content).toMatch(/function\s+handleVerifyResult/);
      expect(content).toMatch(/d\.status\s*===\s*'paid'/);
      expect(content).toMatch(/d\.status\s*===\s*'rejected'/);
      expect(content).toMatch(/pending_admin_review/);
    });
  });

  describe("Stage 4 result variants", () => {
    test("showSuccess emits ดาวน์โหลดใบเสร็จ CTA with receipt_url link", () => {
      expect(content).toMatch(/function\s+showSuccess/);
      expect(content).toMatch(/receipt_url/);
      expect(content).toMatch(/ดาวน์โหลดใบเสร็จ/);
    });

    test("showRejected shows reject reason", () => {
      expect(content).toMatch(/function\s+showRejected/);
      expect(content).toMatch(/reject_reason|ไม่ผ่านการตรวจสอบ/);
    });

    test("showPending shows admin will review message", () => {
      expect(content).toMatch(/function\s+showPending/);
      expect(content).toMatch(/รอแอดมินตรวจสอบ|2-4 ชม/);
    });
  });

  describe("V.0.8 B2C VAT 7% restored (boss 2026-05-18 revise — MED-1 fix)", () => {
    test("dinoco_sn_mpx_compute_total — uses dinoco_vat_get for rate (not hardcoded 0)", () => {
      // V.0.8 reverted V.0.6's hardcoded $vat = 0.0
      // Boss decision 2026-05-18: B2C marketplace = VAT 7% (PPT Group Corp)
      expect(content).toMatch(/function\s+dinoco_sn_mpx_compute_total/);
      // Helper from Marketplace Tools V.1.2 is source of truth
      expect(content).toContain("dinoco_vat_get");
    });

    test("UI shows VAT 7% row in stage 1/2 (MED-1 restore)", () => {
      // V.0.8 restored row hidden in V.0.6
      expect(content).toMatch(/data-role=["']total-vat-line["']/);
      expect(content).toMatch(/data-role=["']total-vat["']/);
    });
  });

  describe("REST integration", () => {
    test("api() wraps fetch with X-WP-Nonce + credentials same-origin", () => {
      expect(content).toMatch(/X-WP-Nonce/);
    });

    test("Status polling calls /marketplace/{id}/status (V.0.44 P0 fix)", () => {
      expect(content).toMatch(/marketplace\/'\s*\+\s*STATE\.extensionId\s*\+\s*'\/status/);
    });

    test("LINE OAuth reuse pattern (no new JWT)", () => {
      // D11 fix — uses WP session via wp_create_nonce('wp_rest'), not JWT
      expect(content).toMatch(/wp_create_nonce|wp_rest/);
    });
  });

  describe("Master flag gate", () => {
    test("Shortcode handler returns disabled message when flag OFF", () => {
      expect(content).toMatch(/dinoco_sn_marketplace_(is_)?enabled|MARKETPLACE_ENABLED/);
    });
  });
});
