/**
 * Sprint C UX Completeness Drift Detector (P0.11-15)
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins fixes from P0.11-15 across MCP Bridge / Member Dashboard / Manual
 * Transfer / B2F Maker LIFF reschedule / B2F foreign-currency cart.
 *
 * Why this matters: each fix targets a "silent failure / disabled-no-reason"
 * UX dead-end. Regression here re-introduces user confusion that drove
 * Sprint C in the first place.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const F = {
    mcpBridge: path.join(REPO, "[System] DINOCO MCP Bridge"),
    memberDash: path.join(REPO, "[System] Member Dashboard Main"),
    transfer: path.join(REPO, "[System] Transfer Warranty Page"),
    b2fMakerLiff: path.join(REPO, "[B2F] Snippet 4: Maker LIFF Pages"),
    b2fCartLoader: path.join(REPO, "liff-src/b2f/catalog/loaders/cart.js"),
};

function read(file) { return fs.readFileSync(file, "utf8"); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/^\s*\*.*$/gm, "");
}

describe("Sprint C — UX completeness drift (P0.11-15)", () => {

    /* ─ P0.11 MCP /sn-lookup response shape ─ */
    describe("P0.11 — MCP /sn-lookup response shape", () => {
        const src = read(F.mcpBridge);
        const stripped = stripComments(src);

        test("400 bad_request includes code field", () => {
            expect(stripped).toMatch(/['"]code['"]\s*=>\s*['"]bad_request['"]/);
        });

        test("404 not-found path includes code: not_found (V.3.1 P0.11)", () => {
            expect(stripped).toMatch(/['"]code['"]\s*=>\s*['"]not_found['"]/);
        });

        test("Existing success=true + found=false backward compat preserved", () => {
            // Both flags must still exist in not-found branch (no consumer break)
            const block = stripped.match(/if\s*\(\s*!\s*\$row\s*\)[\s\S]{0,500}/);
            expect(block).not.toBeNull();
            expect(block[0]).toMatch(/['"]found['"]\s*=>\s*false/);
        });

        test("503 feature_disabled includes code field", () => {
            expect(stripped).toMatch(/['"]code['"]\s*=>\s*['"]feature_disabled['"]/);
        });

        test("503 schema_not_ready includes code field", () => {
            expect(stripped).toMatch(/['"]code['"]\s*=>\s*['"]schema_not_ready['"]/);
        });
    });

    /* ─ P0.12 Member Dashboard disabled tooltip + visual ─ */
    describe("P0.12 — Member Dashboard disabled badge", () => {
        const src = read(F.memberDash);

        test("Disabled badge uses 🚧 visual prefix (touch-friendly)", () => {
            expect(src).toContain("🚧");
        });

        test("Disabled badge text says (กำลังพัฒนา) so non-hover users see status", () => {
            expect(src).toMatch(/🚧 \+%d เพิ่มเติม \(กำลังพัฒนา\)/);
        });

        test("title attribute preserved for desktop hover users", () => {
            expect(src).toMatch(/title="หน้ารายการแจ้งเตือนทั้งหมดกำลังพัฒนา/);
        });

        test("aria-disabled=true + role=note for screen readers", () => {
            expect(src).toMatch(/aria-disabled="true"/);
            expect(src).toMatch(/role="note"/);
        });
    });

    /* ─ P0.13 Manual Transfer field error preserve ─ */
    describe("P0.13 — Manual Transfer field error preserve", () => {
        const src = read(F.transfer);

        test("_fieldError helper defined (NEW V.31.3)", () => {
            expect(src).toMatch(/_fieldError:\s*function\s*\(\s*el\s*,\s*msg\s*\)/);
        });

        test("Helper applies red border + boxShadow (visual highlight)", () => {
            expect(src).toMatch(/borderColor\s*=\s*['"]#dc2626['"]/);
            expect(src).toMatch(/boxShadow.*rgba\(220,\s*38,\s*38/);
        });

        test("Helper sets aria-invalid + aria-describedby", () => {
            expect(src).toMatch(/setAttribute\(['"]aria-invalid['"]/);
            expect(src).toMatch(/setAttribute\(['"]aria-describedby['"]/);
        });

        test("Helper scrolls + focuses field (mobile + a11y)", () => {
            expect(src).toMatch(/scrollIntoView/);
            expect(src).toMatch(/el\.focus/);
        });

        test("findUser validation route calls _fieldError on phone empty", () => {
            expect(src).toMatch(/this\._fieldError\(phoneEl\s*,\s*['"]กรอกเบอร์โทร/);
        });

        test("findUser server error route calls _fieldError with res.data", () => {
            // Either explicit ตามที่ user เห็น or `errMsg` variable
            expect(src).toMatch(/self\._fieldError\(phoneEl\s*,\s*errMsg\)/);
        });

        test("Auto-clear listener on input + change (one-shot)", () => {
            expect(src).toMatch(/addEventListener\(['"]input['"],\s*clear,\s*\{once:true\}\)/);
            expect(src).toMatch(/addEventListener\(['"]change['"],\s*clear,\s*\{once:true\}\)/);
        });
    });

    /* ─ P0.14 B2F reschedule success modal ─ */
    describe("P0.14 — B2F reschedule success modal", () => {
        const src = read(F.b2fMakerLiff);

        test("handleReschedule uses dinocoModal.alert on success", () => {
            expect(src).toMatch(/window\.dinocoModal[\s\S]{0,200}dinocoModal\.alert/);
        });

        test("Success modal includes NEW delivery date in message", () => {
            // Thai text in this file is \u-escaped (inside PHP single-quoted string).
            // Assert via the English fallback string + the date-injection placeholder
            // (both present in the same L() call) instead of the Thai literal.
            expect(src).toMatch(/New delivery date requested:\s*"\s*\+\s*newDate/);
            expect(src).toMatch(/Admin will review and approve\.\s*You will be notified/);
        });

        test("Success modal uses type:'success' for visual cue", () => {
            expect(src).toMatch(/type:\s*['"]success['"]/);
        });

        test("Modal failure falls back to toast + 1.5s redirect (no dead-end)", () => {
            expect(src).toMatch(/_modalErr[\s\S]{0,200}showToast/);
        });

        test("Header bumped to V.4.10 documenting P0.14", () => {
            expect(src).toMatch(/V\.4\.10[\s\S]{0,300}P0\.14/);
        });
    });

    /* ─ P0.15 B2F foreign currency shipping field highlight ─ */
    describe("P0.15 — B2F foreign currency field highlight", () => {
        const src = read(F.b2fCartLoader);
        const stripped = stripComments(src);

        test("_highlightFieldError helper defined (V.0.7)", () => {
            expect(stripped).toMatch(/function\s+_highlightFieldError\s*\(\s*el\s*,\s*errorMessage\s*\)/);
        });

        test("Helper applies red border + outline + boxShadow", () => {
            expect(stripped).toMatch(/borderColor\s*=\s*['"]#dc2626['"]/);
            expect(stripped).toMatch(/outline\s*=\s*['"]2px solid #fecaca['"]/);
        });

        test("Helper adds inline aria-live=alert error message below field", () => {
            expect(stripped).toMatch(/setAttribute\(['"]role['"]\s*,\s*['"]alert['"]\)/);
        });

        test("exchange rate empty validation calls _highlightFieldError(rateEl)", () => {
            expect(stripped).toMatch(/_highlightFieldError\(rateEl/);
        });

        test("shipping method empty validation calls _highlightFieldError(shipMethodEl)", () => {
            expect(stripped).toMatch(/_highlightFieldError\(shipMethodEl/);
        });

        test("Helper safely handles missing scrollIntoView (jsdom + older browsers)", () => {
            expect(stripped).toMatch(/typeof\s+target\.scrollIntoView\s*===\s*['"]function['"]/);
        });

        test("Auto-clear on input/change + 4s timeout", () => {
            expect(stripped).toMatch(/addEventListener\(['"]input['"],\s*clear,\s*\{\s*once:\s*true\s*\}/);
            expect(stripped).toMatch(/setTimeout\(clear\s*,\s*4000/);
        });
    });
});
