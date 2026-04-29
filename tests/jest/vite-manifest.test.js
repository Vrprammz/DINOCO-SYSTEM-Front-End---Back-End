/**
 * Vite manifest sanity check — Phase 2 LIFF migration prereq.
 *
 * `[System] DINOCO LIFF Asset Loader` snippet's `dinoco_liff_enqueue()`
 * function reads `dist/liff/.vite/manifest.json` to resolve hashed
 * filenames (b2b-catalog.<hash>.js) at PHP enqueue time.
 *
 * This test verifies after a Vite build:
 *   - manifest.json exists at the expected path
 *   - All 4 entry keys present (b2b-catalog, b2f-catalog, b2f-maker, liff-ai)
 *   - Each `file` reference resolves to an existing JS bundle on disk
 *   - CSS siblings (where present) resolve too
 *
 * Skipped when dist/liff/ doesn't exist (CI builds first; local devs
 * see informational marker test). Mirrors bundle-size.test.js pattern.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(REPO_ROOT, "dist/liff");
const MANIFEST_PATH = path.join(DIST_DIR, ".vite/manifest.json");

const distExists = fs.existsSync(DIST_DIR);
const manifestExists = fs.existsSync(MANIFEST_PATH);

const REQUIRED_ENTRIES = [
    "b2b/catalog/entry.js",
    "b2f/catalog/entry.js",
    "b2f/maker/entry.js",
    "liff-ai/frontend/entry.js",
];

(distExists && manifestExists ? describe : describe.skip)(
    "Vite LIFF manifest",
    () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

        test("manifest.json exists at expected path", () => {
            expect(typeof manifest).toBe("object");
            expect(Object.keys(manifest).length).toBeGreaterThan(0);
        });

        test("all 4 entry keys present", () => {
            for (const key of REQUIRED_ENTRIES) {
                expect(manifest[key]).toBeDefined();
                expect(manifest[key].file).toBeTruthy();
                expect(manifest[key].isEntry).toBe(true);
            }
        });

        test("every entry's `file` resolves to an existing bundle", () => {
            const missing = [];
            for (const key of REQUIRED_ENTRIES) {
                const entry = manifest[key];
                const filePath = path.join(DIST_DIR, entry.file);
                if (!fs.existsSync(filePath)) {
                    missing.push(`${key} → ${entry.file}`);
                }
            }
            expect(missing).toEqual([]);
        });

        test("CSS siblings (where listed) resolve", () => {
            const missing = [];
            for (const [key, entry] of Object.entries(manifest)) {
                if (!entry.css) continue;
                for (const cssFile of entry.css) {
                    const filePath = path.join(DIST_DIR, cssFile);
                    if (!fs.existsSync(filePath)) {
                        missing.push(`${key} CSS → ${cssFile}`);
                    }
                }
            }
            expect(missing).toEqual([]);
        });

        test("imports (chunks) resolve", () => {
            const missing = [];
            for (const [key, entry] of Object.entries(manifest)) {
                if (!entry.imports) continue;
                for (const importKey of entry.imports) {
                    const importedEntry = manifest[importKey];
                    if (!importedEntry || !importedEntry.file) {
                        missing.push(`${key} imports missing → ${importKey}`);
                        continue;
                    }
                    const filePath = path.join(DIST_DIR, importedEntry.file);
                    if (!fs.existsSync(filePath)) {
                        missing.push(
                            `${key} import file missing → ${importedEntry.file}`
                        );
                    }
                }
            }
            expect(missing).toEqual([]);
        });

        test("no malicious paths (path traversal / protocol URL)", () => {
            // Mirror the security check in dinoco_liff_enqueue(). If an
            // attacker swaps the manifest, we should reject before
            // enqueueing — verify here that our own build emits clean
            // relative paths.
            const flagged = [];
            for (const [key, entry] of Object.entries(manifest)) {
                const paths = [];
                if (entry.file) paths.push(entry.file);
                if (Array.isArray(entry.css)) paths.push(...entry.css);
                for (const p of paths) {
                    if (p.includes("..")) flagged.push(`${key}: ${p} (..)`);
                    if (/^[a-z]+:\/\//i.test(p))
                        flagged.push(`${key}: ${p} (protocol)`);
                }
            }
            expect(flagged).toEqual([]);
        });
    }
);

(distExists && manifestExists
    ? describe.skip
    : describe)("Vite manifest (skipped — run `npm run build:liff` first)", () => {
    test("marker", () => {
        expect(true).toBe(true);
    });
});
