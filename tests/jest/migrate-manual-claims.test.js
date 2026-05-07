/**
 * Phase 4 W14.3 — Migration script pure-logic tests
 *
 * Tests the exported helpers from scripts/migrate-manual-claims-to-snpool.js
 * (classifySerial + normalizeSerial). Runtime behavior (MongoDB + WP API)
 * is covered by manual smoke test in docs/sn-system/21-phase4-w14.5-acceptance-test.md.
 */

const path = require("path");

describe("Phase 4 W14.3 manual_claims migration helpers", () => {
  const scriptPath = path.resolve(
    __dirname,
    "../../openclawminicrm/scripts/migrate-manual-claims-to-snpool.js"
  );

  let helpers;
  beforeAll(() => {
    helpers = require(scriptPath);
  });

  describe("normalizeSerial", () => {
    test("uppercase + strip whitespace + dashes", () => {
      expect(helpers.normalizeSerial("dncss0001234")).toBe("DNCSS0001234");
      expect(helpers.normalizeSerial("  DNCSS-0001234  ")).toBe("DNCSS0001234");
      expect(helpers.normalizeSerial("dncss-0001-234")).toBe("DNCSS0001234");
    });

    test("returns empty string for falsy or non-string input", () => {
      expect(helpers.normalizeSerial(null)).toBe("");
      expect(helpers.normalizeSerial(undefined)).toBe("");
      expect(helpers.normalizeSerial("")).toBe("");
      expect(helpers.normalizeSerial(12345)).toBe("");
      expect(helpers.normalizeSerial({})).toBe("");
    });
  });

  describe("classifySerial", () => {
    test("canonical DNCSS pattern", () => {
      const res = helpers.classifySerial("DNCSS0001234");
      expect(res.kind).toBe("canonical");
      expect(res.normalized).toBe("DNCSS0001234");
    });

    test("canonical with mixed case + dashes", () => {
      const res = helpers.classifySerial("dncss-0001234");
      expect(res.kind).toBe("canonical");
      expect(res.normalized).toBe("DNCSS0001234");
    });

    test("legacy DN-XXXXX format", () => {
      expect(helpers.classifySerial("DN-12345").kind).toBe("legacy_dn");
      expect(helpers.classifySerial("DN12345").kind).toBe("legacy_dn");
      expect(helpers.classifySerial("dn_99").kind).toBe("legacy_dn");
    });

    test("empty / falsy input", () => {
      expect(helpers.classifySerial(null).kind).toBe("empty");
      expect(helpers.classifySerial("").kind).toBe("empty");
      expect(helpers.classifySerial("   ").kind).toBe("empty");
    });

    test("format mismatch (typo / fake / random text)", () => {
      expect(helpers.classifySerial("ABC1234").kind).toBe("mismatch");
      expect(helpers.classifySerial("DNCSS123").kind).toBe("mismatch"); // wrong digit count
      expect(helpers.classifySerial("DNCSS12345678").kind).toBe("mismatch"); // too many
      expect(helpers.classifySerial("XXXX0001234").kind).toBe("mismatch");
      expect(helpers.classifySerial("123-456").kind).toBe("mismatch");
    });

    test("preserves normalized form across kinds", () => {
      const res = helpers.classifySerial("  ABC1234  ");
      expect(res.kind).toBe("mismatch");
      expect(res.normalized).toBe("ABC1234");
    });
  });

  describe("SN_PREFIX_REGEX exposed for sanity", () => {
    test("matches exactly 7 digits after DNCSS", () => {
      expect(helpers.SN_PREFIX_REGEX.test("DNCSS0001234")).toBe(true);
      expect(helpers.SN_PREFIX_REGEX.test("DNCSS9999999")).toBe(true);
      expect(helpers.SN_PREFIX_REGEX.test("DNCSS0000000")).toBe(true);
      expect(helpers.SN_PREFIX_REGEX.test("DNCSS123")).toBe(false);
      expect(helpers.SN_PREFIX_REGEX.test("dncss0001234")).toBe(false); // case-sensitive at regex level
    });
  });
});
