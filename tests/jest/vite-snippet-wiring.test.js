/**
 * Vite snippet wiring drift detector — Phase 2 Step 2 (V.32.8 / V.7.13 / V.3.8).
 *
 * The 3 LIFF snippets (B2B Snippet 4, B2F Snippet 8, LIFF AI Snippet 2) gate
 * Vite-built bundle rendering behind per-surface wp_options:
 *   - dinoco_liff_use_vite_b2b_catalog
 *   - dinoco_liff_use_vite_b2f_catalog
 *   - dinoco_liff_use_vite_liff_ai
 *
 * When OFF (default) → existing inline rendering preserved (REG-029 byte-identical).
 * When ON  → Asset Loader enqueues hashed bundle, snippet emits minimal shell with
 *            `<div id="<surface>-app" data-config="...">` + wp_head/wp_footer.
 *
 * This test is a drift detector: ensures the wiring contract stays intact across
 * snippet bumps. If someone refactors and accidentally deletes the flag check or
 * the root mount div ID, this fails fast.
 *
 * Asymmetry: we DO NOT verify inline fallback emits — that's the V.32.7/V.7.12/V.3.7
 * baseline preserved unchanged. We verify only the Vite gate is wired correctly.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const SURFACES = [
    {
        snippet: "[B2B] Snippet 4: LIFF E-Catalog Frontend",
        flag: "dinoco_liff_use_vite_b2b_catalog",
        entry: "b2b-catalog",
        mountId: "b2b-catalog-app",
        version: "V.32.8",
    },
    {
        snippet: "[B2F] Snippet 8: Admin LIFF E-Catalog",
        flag: "dinoco_liff_use_vite_b2f_catalog",
        entry: "b2f-catalog",
        mountId: "b2f-catalog-app",
        version: "V.7.13",
    },
    {
        snippet: "[LIFF AI] Snippet 2: Frontend",
        flag: "dinoco_liff_use_vite_liff_ai",
        entry: "liff-ai",
        mountId: "liff-ai-app",
        version: "V.3.8",
    },
];

describe("Vite snippet wiring (Phase 2 Step 2)", () => {
    for (const s of SURFACES) {
        describe(s.snippet, () => {
            const filePath = path.join(REPO_ROOT, s.snippet);
            let content;

            beforeAll(() => {
                expect(fs.existsSync(filePath)).toBe(true);
                content = fs.readFileSync(filePath, "utf8");
            });

            test(`reads wp_option flag '${s.flag}'`, () => {
                // Pattern: get_option( '<flag>', false ) — both single + double quotes accepted.
                const re = new RegExp(
                    `get_option\\(\\s*['"]${s.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*,\\s*false\\s*\\)`
                );
                expect(content).toMatch(re);
            });

            test(`calls dinoco_liff_enqueue('${s.entry}')`, () => {
                const re = new RegExp(
                    `dinoco_liff_enqueue\\(\\s*['"]${s.entry}['"]\\s*\\)`
                );
                expect(content).toMatch(re);
            });

            test(`function_exists guard before dinoco_liff_enqueue`, () => {
                // Defensive: never call helper without checking existence first.
                // Asset Loader snippet may not be synced/active yet on every WP install.
                expect(content).toMatch(
                    /function_exists\(\s*['"]dinoco_liff_enqueue['"]\s*\)/
                );
            });

            test(`emits root mount div with id="${s.mountId}"`, () => {
                const re = new RegExp(
                    `<div\\s+id=["']${s.mountId}["']\\s+data-config=`
                );
                expect(content).toMatch(re);
            });

            test(`shell calls wp_head() and wp_footer()`, () => {
                expect(content).toMatch(/wp_head\(\s*\)/);
                expect(content).toMatch(/wp_footer\(\s*\)/);
            });

            test(`inline fallback path preserved (legacy rendering still emitted)`, () => {
                // The whole point of flag-gated migration: inline path must remain.
                // B2B/B2F snippets are full HTML pages → expect ≥2 <body> tags
                //   (Vite shell + legacy inline renderer).
                // LIFF AI shortcode is embedded inside theme template → no <body>;
                //   instead verify the legacy inline rendering script tail is still
                //   present (final closing </script> + return ob_get_clean fallback).
                const isFullPage = /header\s*\(\s*['"]Content-Type:\s*text\/html/.test(
                    content
                );
                if (isFullPage) {
                    const bodies = content.match(/<body[> ]/g);
                    expect(bodies).not.toBeNull();
                    expect(bodies.length).toBeGreaterThanOrEqual(2);
                } else {
                    // Shortcode path — legacy inline tail uses ob_get_clean +
                    // an .liff-ai-* (or similarly scoped) inline script/style.
                    expect(content).toMatch(/return\s+ob_get_clean\s*\(\s*\)/);
                    // Legacy inline rendering must still emit raw <style> + <script>
                    // — these are absent from the minimal Vite shell.
                    const styleTags = content.match(/<style[> ]/g) || [];
                    expect(styleTags.length).toBeGreaterThanOrEqual(1);
                }
            });

            test(`version header bumped to ${s.version}`, () => {
                expect(content).toContain(s.version);
            });

            test(`config payload includes liff_id + rest_url`, () => {
                // Minimal config contract — entry.js needs LIFF init + REST base.
                expect(content).toMatch(/['"]liff_id['"]\s*=>/);
                expect(content).toMatch(/['"]rest_url['"]\s*=>/);
            });

            test(`flag default OFF — pattern requires explicit boolean cast`, () => {
                // Exact pattern: (bool) get_option( 'flag', false )
                const re = new RegExp(
                    `\\(\\s*bool\\s*\\)\\s*get_option\\(\\s*['"]${s.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*,\\s*false\\s*\\)`
                );
                expect(content).toMatch(re);
            });
        });
    }

    test("Asset Loader snippet exists (caller dependency)", () => {
        const loader = path.join(
            REPO_ROOT,
            "[System] DINOCO LIFF Asset Loader"
        );
        expect(fs.existsSync(loader)).toBe(true);
        const c = fs.readFileSync(loader, "utf8");
        expect(c).toMatch(/function\s+dinoco_liff_enqueue/);
    });

    test("CI deploy workflow exists (Step 3 prerequisite)", () => {
        const workflow = path.join(
            REPO_ROOT,
            ".github/workflows/liff-deploy.yml"
        );
        expect(fs.existsSync(workflow)).toBe(true);
    });

    test("CI deploy workflow disabled by default (workflow_dispatch only)", () => {
        const workflow = path.join(
            REPO_ROOT,
            ".github/workflows/liff-deploy.yml"
        );
        const c = fs.readFileSync(workflow, "utf8");
        // Active trigger must include workflow_dispatch — guards against
        // accidental auto-deploy via push trigger before secrets configured.
        expect(c).toMatch(/^on:\s*\n[\s\S]*?workflow_dispatch:/m);
        // Should NOT have an active uncommented `push:` trigger at top-level.
        // We allow commented `# push:` (template ready for activation).
        const lines = c.split(/\r?\n/);
        const activePush = lines.some((line) =>
            /^\s{2,4}push:\s*$/.test(line)
        );
        expect(activePush).toBe(false);
    });
});
