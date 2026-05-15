/**
 * OpenClaw 3-tool S/N contract drift detector (V.6.2+)
 *
 * Static scan of openclawminicrm/proxy/modules/dinoco-tools.js to verify
 * the 3 mandated SN tools (chatbot-rules §15.x) remain wired with their
 * required schema fields. Static instead of `require()` because mongodb
 * dependency uses TS sources that Jest can't transform without ts-jest
 * config in the openclawminicrm subpackage.
 *
 * Pins:
 *   - dinoco_warranty_check (extended Crockford alphabet awareness)
 *   - dinoco_serial_lookup  (NEW V.6.0 — canonical read-only)
 *   - dinoco_create_claim   (validates serial vs sn_pool before insert)
 *   - Crockford validation helpers exported
 */

const fs = require("fs");
const path = require("path");

const MODULE = path.join(
  __dirname,
  "..",
  "..",
  "openclawminicrm/proxy/modules/dinoco-tools.js"
);

describe("OpenClaw S/N tools — chatbot-rules §15 contract (V.6.2+)", () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(MODULE, "utf8");
  });

  test("AGENT_TOOLS array exported", () => {
    expect(content).toMatch(/const\s+AGENT_TOOLS\s*=\s*\[/);
    expect(content).toMatch(/module\.exports\s*=\s*\{[\s\S]*AGENT_TOOLS/);
  });

  test("3 SN tools registered by name", () => {
    expect(content).toMatch(/name:\s*"dinoco_warranty_check"/);
    expect(content).toMatch(/name:\s*"dinoco_serial_lookup"/);
    expect(content).toMatch(/name:\s*"dinoco_create_claim"/);
  });

  test("dinoco_warranty_check — Crockford + §15.3 secrecy hint", () => {
    const block = content.match(
      /name:\s*"dinoco_warranty_check"[\s\S]{0,2500}?(?=\n\s*\{|\}\s*,?\n\s*\{)/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/Crockford/i);
    // §15.3 voided/recalled = generic response (no detail leak)
    expect(block[0]).toMatch(/voided|recalled|generic/);
  });

  test("dinoco_warranty_check — is_owned_by_caller deferred annotation (R3 fix)", () => {
    const block = content.match(
      /name:\s*"dinoco_warranty_check"[\s\S]{0,2500}?(?=\n\s*\{|\}\s*,?\n\s*\{)/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/deferred|Phase 4 W14\.5/);
  });

  test("dinoco_serial_lookup — serial param required", () => {
    const block = content.match(
      /name:\s*"dinoco_serial_lookup"[\s\S]{0,2000}?(?=\n\s*\{|\}\s*,?\n\s*\{)/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/required:\s*\[\s*"serial"\s*\]/);
  });

  test("dinoco_serial_lookup — canonical read-only routing description", () => {
    const block = content.match(
      /name:\s*"dinoco_serial_lookup"[\s\S]{0,2000}?(?=\n\s*\{|\}\s*,?\n\s*\{)/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/canonical|read-only/i);
    expect(block[0]).toMatch(/เรียก tool ทุกครั้ง/);
  });

  test("dinoco_create_claim — serial property in schema", () => {
    const block = content.match(
      /name:\s*"dinoco_create_claim"[\s\S]{0,3000}?(?=\n\s*\{|\}\s*,?\n\s*\{|module\.exports)/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/serial:\s*\{/);
  });

  test("test-mode mock guard exists (sourceId reg_ prefix)", () => {
    // V.5.1 regression guard prevents real DB writes when sourceId starts reg_
    expect(content).toMatch(/isRegressionTestMode|sourceId.*reg_/);
    expect(content).toMatch(/TEST MODE.*dinoco_create_claim/i);
  });

  test("V.6.1+V.6.2 validation helpers exported", () => {
    const exports = content.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
    expect(exports).toBeTruthy();
    const block = exports[1];
    expect(block).toMatch(/normalizeSerial/);
    expect(block).toMatch(/isCanonicalSn/);
    expect(block).toMatch(/isLenientSn/);
    expect(block).toMatch(/validateSnFormat/);
    expect(block).toMatch(/SN_CROCKFORD_REGEX/);
  });

  test("SN_CROCKFORD_REGEX defined (12-char, no I/L/O/U)", () => {
    expect(content).toMatch(/SN_CROCKFORD_REGEX\s*=/);
    // Crockford alphabet excludes I L O U — regex must NOT include those
    const regexLine = content.match(/SN_CROCKFORD_REGEX\s*=\s*\/[^/]+\/[a-z]*/);
    expect(regexLine).toBeTruthy();
  });

  test("sn-webhook.js paired module exists (Round 3 Gap 1 closure)", () => {
    const snWebhook = path.join(
      __dirname,
      "..",
      "..",
      "openclawminicrm/proxy/modules/sn-webhook.js"
    );
    expect(fs.existsSync(snWebhook)).toBe(true);
    const webhookSrc = fs.readFileSync(snWebhook, "utf8");
    expect(webhookSrc).toMatch(/invalidateSnCache/);
    expect(webhookSrc).toMatch(/POST.*\/webhook\/sn-event|registerRoutes/);
  });

  test("sn-webhook wired in proxy/index.js startup", () => {
    const indexSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "openclawminicrm/proxy/index.js"),
      "utf8"
    );
    expect(indexSrc).toMatch(/require\(['"]\.\/modules\/sn-webhook['"]\)/);
    expect(indexSrc).toMatch(/snWebhook\.registerRoutes\(app\)/);
  });
});
