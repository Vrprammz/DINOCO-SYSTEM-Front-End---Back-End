/**
 * Sprint B LIFF Error State Drift Detector (P0.6-10)
 * 2026-05-18 (Dead-Workflow Remediation Spec V.1.0)
 *
 * Pins:
 *   - liff-src/shared/error-state.js helper exists + exports renderErrorState +
 *     renderRetryableError
 *   - 4 LIFF surfaces import + wire the helper (B2F cart / B2F maker home /
 *     B2F set detail / B2F success has PC fallback branch)
 *   - B2B cart submit has aria-label tooltip + edit-mode badge
 *
 * Why this matters: prevents regression where future refactor accidentally
 * removes the retry/back affordances on error states. Re-introduces the
 * dead-end UX that drove Sprint B in the first place.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const F = {
    errorState: path.join(REPO, "liff-src/shared/error-state.js"),
    b2fCartLoader: path.join(REPO, "liff-src/b2f/catalog/loaders/cart.js"),
    b2fSuccessLoader: path.join(REPO, "liff-src/b2f/catalog/loaders/success.js"),
    b2fMakerHomeLoader: path.join(REPO, "liff-src/b2f/catalog/loaders/makerHome.js"),
    b2fSetDetailLoader: path.join(REPO, "liff-src/b2f/catalog/loaders/setDetail.js"),
    b2bCartLoader: path.join(REPO, "liff-src/b2b/catalog/loaders/cart.js"),
    b2bCartPage: path.join(REPO, "liff-src/b2b/catalog/pages/cart.js"),
};

function read(file) { return fs.readFileSync(file, "utf8"); }
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/^\s*\*.*$/gm, "");
}

describe("Sprint B — LIFF error state drift", () => {

    /* ─ Shared helper module ─ */
    describe("shared/error-state.js helper", () => {
        const src = read(F.errorState);
        const stripped = stripComments(src);

        test("exports renderErrorState (named)", () => {
            expect(stripped).toMatch(/export\s+function\s+renderErrorState/);
        });

        test("exports renderRetryableError convenience (named)", () => {
            expect(stripped).toMatch(/export\s+function\s+renderRetryableError/);
        });

        test("renderErrorState accepts mountEl + opts and renders DOM (role=alert)", () => {
            expect(stripped).toMatch(/role['"]?\s*,\s*['"]alert['"]/);
            expect(stripped).toMatch(/aria-live['"]?\s*,\s*['"]assertive['"]/);
        });

        test("Buttons meet 44px min touch target (a11y)", () => {
            expect(stripped).toMatch(/min-height:44px/);
        });

        test("Caps reason length at 200 chars (defensive overflow)", () => {
            expect(stripped).toMatch(/reason\.length\s*>\s*200/);
        });

        test("renderRetryableError builds retry+back actions from opts", () => {
            expect(stripped).toMatch(/['"]🔄 ลองอีกครั้ง['"]/);
            expect(stripped).toMatch(/['"]← กลับ['"]/);
        });
    });

    /* ─ P0.6 B2F cart 409 ─ */
    describe("P0.6 — B2F cart 409 retry path", () => {
        const src = read(F.b2fCartLoader);
        const stripped = stripComments(src);

        test("Imports renderRetryableError from shared", () => {
            expect(stripped).toMatch(/import\s*\{[^}]*renderRetryableError[^}]*\}\s*from\s*['"][^'"]+shared\/error-state\.js['"]/);
        });

        test("DUPLICATE_PO branch calls _renderCartErrorState with retry", () => {
            expect(stripped).toMatch(/DUPLICATE_PO[\s\S]{0,400}_renderCartErrorState/);
            expect(stripped).toMatch(/onRetry\s*:\s*\(\s*\)\s*=>\s*handleSubmitOrder/);
        });

        test("Network catch block also routes to _renderCartErrorState (retry-safe)", () => {
            expect(stripped).toMatch(/NETWORK_ERROR/);
        });

        test("_renderCartErrorState injects mount above submit button (preserves layout)", () => {
            expect(stripped).toMatch(/function\s+_renderCartErrorState/);
            expect(stripped).toMatch(/b2f-cart-error-mount/);
        });
    });

    /* ─ P0.7 B2F success PC fallback ─ */
    describe("P0.7 — B2F success PC fallback", () => {
        const src = read(F.b2fSuccessLoader);
        const stripped = stripComments(src);

        test("Detects LINE in-app via _isInLineApp helper", () => {
            expect(stripped).toMatch(/function\s+_isInLineApp/);
            expect(stripped).toMatch(/liff\.isInClient/);
        });

        test("PC fallback branch renders LINE OA deep-link button", () => {
            expect(stripped).toMatch(/data-action=['"]line-open['"]/);
            expect(stripped).toMatch(/📱 เปิดในไลน์/);
        });

        test("PC fallback branch renders manual close button", () => {
            expect(stripped).toMatch(/data-action=['"]close['"]/);
            expect(stripped).toMatch(/✕ ปิดหน้านี้/);
        });

        test("In-app branch shows visible countdown to auto-close", () => {
            expect(stripped).toMatch(/data-role=['"]countdown['"]/);
            expect(stripped).toMatch(/function\s+_startCountdown/);
        });

        test("window.close() blocked logs to console for ops diagnostics", () => {
            expect(stripped).toMatch(/window\.close\(\)\s+blocked/);
        });
    });

    /* ─ P0.8 B2B cart submit tooltip + edit-mode badge ─ */
    describe("P0.8 — B2B cart submit tooltip + edit-mode badge", () => {
        const loaderSrc = stripComments(read(F.b2bCartLoader));
        const pageSrc = stripComments(read(F.b2bCartPage));

        test("renderCartItems returns confirmDisabledReason", () => {
            expect(pageSrc).toMatch(/confirmDisabledReason/);
            expect(pageSrc).toMatch(/ตะกร้าว่าง/);
        });

        test("renderCartItems returns editMode flag", () => {
            // Match `editMode,` in returned object literal (after const editMode = …)
            expect(pageSrc).toMatch(/return\s*\{[\s\S]{0,400}editMode\s*,/);
        });

        test("Loader sets aria-label + title from confirmDisabledReason", () => {
            expect(loaderSrc).toMatch(/setAttribute\s*\(\s*['"]aria-label['"]\s*,\s*result\.confirmDisabledReason/);
            expect(loaderSrc).toMatch(/setAttribute\s*\(\s*['"]title['"]\s*,\s*result\.confirmDisabledReason/);
        });

        test("Loader renders ✏️ กำลังแก้ไข badge when editMode=true", () => {
            expect(loaderSrc).toMatch(/data-role=['"]?edit-mode-badge['"]?/);
            expect(loaderSrc).toMatch(/✏️ กำลังแก้ไข/);
        });

        test("Loader removes edit-mode badge when re-rendering without editMode", () => {
            // Idempotent re-render — badge cleared if state changed
            expect(loaderSrc).toMatch(/removeChild\s*\(\s*existingBadge\s*\)/);
        });
    });

    /* ─ P0.9 B2F maker home stuck ─ */
    describe("P0.9 — B2F maker home retry path", () => {
        const src = read(F.b2fMakerHomeLoader);
        const stripped = stripComments(src);

        test("Imports renderRetryableError from shared", () => {
            expect(stripped).toMatch(/import\s*\{[^}]*renderRetryableError[^}]*\}\s*from\s*['"][^'"]+shared\/error-state\.js['"]/);
        });

        test("Catch block renders ErrorState with retry + back actions", () => {
            expect(stripped).toMatch(/renderRetryableError\s*\([\s\S]{0,500}onRetry\s*:\s*\(\s*\)\s*=>\s*loadMakerHome/);
            expect(stripped).toMatch(/onBack\s*:/);
        });

        test("MAKER_LIST_LOAD_FAIL error code documented for support", () => {
            expect(stripped).toMatch(/MAKER_LIST_LOAD_FAIL/);
        });

        test("Back action closes LIFF when in-app OR history.back() on PC", () => {
            expect(stripped).toMatch(/liff\.isInClient[\s\S]{0,200}closeWindow/);
            expect(stripped).toMatch(/history\.back/);
        });
    });

    /* ─ P0.10 B2F set detail not found ─ */
    describe("P0.10 — B2F set detail not found", () => {
        const src = read(F.b2fSetDetailLoader);
        const stripped = stripComments(src);

        test("Imports renderRetryableError from shared", () => {
            expect(stripped).toMatch(/import\s*\{[^}]*renderRetryableError[^}]*\}\s*from\s*['"][^'"]+shared\/error-state\.js['"]/);
        });

        test("Not-found branch renders ErrorState (not just toast)", () => {
            expect(stripped).toMatch(/!product[\s\S]{0,400}renderRetryableError/);
        });

        test("Retry calls loadSetDetail(targetSku) — re-attempt same SKU", () => {
            expect(stripped).toMatch(/onRetry\s*:\s*\(\s*\)\s*=>\s*loadSetDetail\s*\(\s*targetSku\s*\)/);
        });

        test("setupSetDetail accepts onBackToCatalog dep for navigation hook", () => {
            expect(stripped).toMatch(/onBackToCatalog/);
        });

        test("Error code embeds SKU for support diagnosis", () => {
            expect(stripped).toMatch(/SET_NOT_FOUND[\s\S]{0,50}targetSku/);
        });
    });
});
