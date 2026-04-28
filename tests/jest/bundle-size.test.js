/**
 * Vite LIFF bundle size guard.
 *
 * Reads built artifacts under dist/liff/ and asserts each entry stays
 * below a threshold. Catches silent bloat — adding a heavy dep to a
 * shared module raises every entry's size, easy to miss in PR review.
 *
 * Phase 5 audit target was <10KB per shell entry. Current state at
 * landing (V.0.1 pilot — Phase 2 migration not yet done):
 *   - b2b-catalog: ~3.5KB (biggest)
 *   - b2f-catalog: ~620B
 *   - b2f-maker:   ~475B
 *   - liff-ai:     ~605B
 *
 * Behavior:
 *   - Skips if dist/liff/ doesn't exist (`npm run build:liff` not yet run)
 *     so local Jest runs don't fail without a build step
 *   - In CI, the workflow runs `npm run build:liff` before Jest so the
 *     guard fires
 *
 * Threshold:
 *   - 10240 bytes (10KB) per entry — Phase 5 audit target. Bump up if
 *     legitimate growth, bump down once Phase 2 migration extracts more
 *     shared code into chunks/.
 */

const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "../../dist/liff");
const PER_ENTRY_LIMIT = 10 * 1024; // 10 KB per entry

const distExists = fs.existsSync(DIST_DIR);

(distExists ? describe : describe.skip)("Vite LIFF bundle size", () => {
    test("each entry under 10KB", () => {
        const entries = fs
            .readdirSync(DIST_DIR)
            .filter(
                (f) =>
                    f.endsWith(".js") &&
                    !f.endsWith(".map") &&
                    !f.includes("chunk")
            );

        expect(entries.length).toBeGreaterThan(0);

        const oversize = [];
        for (const f of entries) {
            const full = path.join(DIST_DIR, f);
            const size = fs.statSync(full).size;
            if (size > PER_ENTRY_LIMIT) {
                oversize.push({ f, size });
            }
        }

        if (oversize.length > 0) {
            const formatted = oversize
                .map(
                    (o) =>
                        `  ${o.f}: ${o.size} bytes (over ${PER_ENTRY_LIMIT})`
                )
                .join("\n");
            throw new Error(
                `${oversize.length} entry/entries exceed ${PER_ENTRY_LIMIT}-byte limit:\n${formatted}\n\n` +
                    `If growth is legitimate, bump PER_ENTRY_LIMIT in tests/jest/bundle-size.test.js ` +
                    `with a one-line justification in the commit message.`
            );
        }
    });

    test("total dist size sane (<200KB sum)", () => {
        let total = 0;
        function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.isFile() && !full.endsWith(".map")) {
                    total += fs.statSync(full).size;
                }
            }
        }
        walk(DIST_DIR);
        // Loose ceiling — primarily catches accidentally-included assets
        // (images, fonts) committed under publicDir or via import.
        expect(total).toBeLessThan(200 * 1024);
    });
});

(distExists ? describe.skip : describe)("Vite LIFF bundle size (skipped)", () => {
    test("build artifacts not present — run `npm run build:liff`", () => {
        // Marker test so `jest --listTests` still shows the file
        expect(true).toBe(true);
    });
});
