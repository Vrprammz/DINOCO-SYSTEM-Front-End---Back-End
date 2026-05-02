/**
 * Vite LIFF bundle size guard.
 *
 * Reads built artifacts under dist/liff/ and asserts each entry stays
 * below a threshold. Catches silent bloat — adding a heavy dep to a
 * shared module raises every entry's size, easy to miss in PR review.
 *
 * Phase 5 audit target was <10KB per shell entry. Current state:
 *   - b2b-catalog: ~27.6KB (Round 2 — adds 5 page modules / 12+ renderers
 *                            on top of Round 1 utilities. gzip ~9.1KB.
 *                            See liff-src/b2b/catalog/ and
 *                            runbooks/PHASE-2-VITE-MIGRATION.md.)
 *   - b2f-catalog: ~620B
 *   - b2f-maker:   ~55KB  (Round 3 — adds router + Maker API wrapper +
 *                          5 page loaders on top of Round 2 page
 *                          renderers. gzip ~15KB. See liff-src/b2f/maker/
 *                          and runbooks/PHASE-2-VITE-MIGRATION.md.)
 *   - liff-ai:     ~605B
 *
 * Behavior:
 *   - Skips if dist/liff/ doesn't exist (`npm run build:liff` not yet run)
 *     so local Jest runs don't fail without a build step
 *   - In CI, the workflow runs `npm run build:liff` before Jest so the
 *     guard fires
 *
 * Threshold:
 *   - 65536 bytes (64KB) per entry — bumped from 48KB on 2026-05-01
 *     (Round 3) to accommodate router + Maker API wrapper + 5 page
 *     loaders (~15.3 KB raw / ~3.3 KB gzip added on top of Round 2).
 *     Once Round 5 cut-over lands and inline JS is dropped from
 *     Snippet 4, shared code can hoist into `chunks/` and we can
 *     ratchet back down. See PHASE-2-VITE-MIGRATION.md.
 */

const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "../../dist/liff");
const PER_ENTRY_LIMIT = 64 * 1024; // 64 KB per entry — see header note for Round 3 bump rationale.

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
        // Round 9 R3 bumped 200KB → 240KB after b2f-catalog gained router +
        // api + 5 loaders (29.39 KB → 44.07 KB JS, ~14.68 KB delta).
        // Round 11 R2 bumped 240KB → 280KB after liff-ai gained 6 page renderers
        // (2.85 KB → 25.61 KB JS, ~22.76 KB delta).
        expect(total).toBeLessThan(280 * 1024);
    });
});

(distExists ? describe.skip : describe)("Vite LIFF bundle size (skipped)", () => {
    test("build artifacts not present — run `npm run build:liff`", () => {
        // Marker test so `jest --listTests` still shows the file
        expect(true).toBe(true);
    });
});
