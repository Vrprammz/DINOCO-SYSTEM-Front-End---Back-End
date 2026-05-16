/**
 * H7 + H8 cache hardening drift detector — 2026-05-16 incident lock-in.
 *
 * Background (commits ab02fab..8bb4fd5, 2026-05-16):
 *   GDPR FLAG OFF banner stuck despite wp_options.dinoco_gdpr_enabled='1'.
 *   Root cause #1 (H8): Config Layer per-request memo poisoned by
 *     early-fire hooks calling dinoco_config() BEFORE init:25 schema
 *     registration. Default false cached, subsequent reads stale.
 *   Root cause #2 (H7): Redis/Memcached alloptions group split — flag
 *     flipped in DB but cached snapshot in object cache served stale '0'.
 *
 * Fixes shipped:
 *   - Config Layer V.1.3: H8 don't-cache-when-def-null + H7 alloptions bust
 *   - GDPR V.4.6: bypass Config Layer + wp_cache_delete alloptions + key
 *   - Observability V.1.2: H7 alloptions bust with static guard
 *   - B2F Snippet 1 V.7.7: H7 alloptions bust in b2f_is_flag_enabled
 *   - SN Manager V.0.62: H7 alloptions bust in dinoco_sn_is_enabled
 *   - SN REST API V.0.52: H7 alloptions bust in marketplace flag check
 *
 * This drift detector locks the pattern — any future refactor that
 * removes wp_cache_delete or relocates the H8 cache-write guard
 * outside the if($def) branch will fail tests immediately.
 *
 * Reference: see fix history in CLAUDE.md + commit 8bb4fd5 message.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

function readFile(relativePath) {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("H7 + H8 cache hardening pattern lock-in (2026-05-16 incident)", () => {
    describe("[Admin System] DINOCO Config Layer — canonical H7+H8 fix", () => {
        const src = readFile("[Admin System] DINOCO Config Layer");

        test("V.1.3+ version header present", () => {
            // Version must be at or beyond V.1.3 (the canonical fix)
            const match = src.match(/Version:\s*V\.(\d+)\.(\d+)/);
            expect(match).not.toBeNull();
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            const version = major * 100 + minor;
            expect(version).toBeGreaterThanOrEqual(103);
        });

        test("H7: dinoco_config() busts alloptions cache once per request", () => {
            const fnMatch = src.match(
                /function\s+dinoco_config\s*\([\s\S]*?\n    \}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            // Static guard variable
            expect(fnBody).toMatch(/static\s+\$alloptions_busted/);
            // wp_cache_delete on alloptions group
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
        });

        test("H8: cache write is INSIDE if($def) branch, NOT in else", () => {
            const fnMatch = src.match(
                /function\s+dinoco_config\s*\([\s\S]*?\n    \}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];

            // Find the if($def) ... else ... structure
            const ifBlock = fnBody.match(
                /if\s*\(\s*\$def\s*\)\s*\{([\s\S]*?)\}\s*else\s*\{([\s\S]*?)\}/
            );
            expect(ifBlock).not.toBeNull();

            const ifBody = ifBlock[1];
            const elseBody = ifBlock[2];

            // Cache write MUST be in if($def) branch
            expect(ifBody).toMatch(
                /\$GLOBALS\[\s*['"]_dinoco_config_cache['"]\s*\]\[\s*\$key\s*\]\s*=/
            );

            // Cache write MUST NOT be in else branch (this is the H8 fix)
            expect(elseBody).not.toMatch(
                /\$GLOBALS\[\s*['"]_dinoco_config_cache['"]\s*\]\[\s*\$key\s*\]\s*=/
            );
        });

        test("dinoco_config_set still busts per-key cache (regression guard)", () => {
            // The set() helper unset pattern must remain — Config Layer
            // depends on it for write-then-read consistency.
            expect(src).toMatch(
                /unset\s*\(\s*\$GLOBALS\[\s*['"]_dinoco_config_cache['"]\s*\]\[\s*\$key\s*\]\s*\)/
            );
        });
    });

    describe("[System] DINOCO GDPR Data Requests V.4.6+ — bypass + H7", () => {
        const src = readFile("[System] DINOCO GDPR Data Requests");

        test("V.4.6+ version header present", () => {
            const match = src.match(/Version:\s*V\.(\d+)\.(\d+)/);
            expect(match).not.toBeNull();
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            const version = major * 100 + minor;
            expect(version).toBeGreaterThanOrEqual(406);
        });

        test("dinoco_gdpr_is_enabled() busts alloptions + key-level cache", () => {
            const fnMatch = src.match(
                /function\s+dinoco_gdpr_is_enabled\s*\([\s\S]*?\n    \}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];

            // Bust alloptions group
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
            // Bust key-level
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]dinoco_gdpr_enabled['"]\s*,\s*['"]options['"]\s*\)/
            );
            // Raw get_option read
            expect(fnBody).toMatch(
                /get_option\s*\(\s*['"]dinoco_gdpr_enabled['"]\s*,/
            );
        });

        test("dinoco_gdpr_is_enabled() does NOT route through dinoco_config()", () => {
            // V.4.6 explicitly bypasses Config Layer for ground-truth read.
            // If a future refactor adds dinoco_config back, this will fail
            // — re-introducing H8 vulnerability.
            const fnMatch = src.match(
                /function\s+dinoco_gdpr_is_enabled\s*\([\s\S]*?\n    \}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            expect(fnBody).not.toMatch(/\bdinoco_config\s*\(/);
        });
    });

    describe("[Admin System] DINOCO Observability V.1.2+ — H7 static guard", () => {
        const src = readFile("[Admin System] DINOCO Observability");

        test("V.1.2+ version header present", () => {
            const match = src.match(/Version:\s*V\.(\d+)\.(\d+)/);
            expect(match).not.toBeNull();
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            const version = major * 100 + minor;
            expect(version).toBeGreaterThanOrEqual(102);
        });

        test("dinoco_obs_is_enabled() uses static guard + alloptions bust", () => {
            const fnMatch = src.match(
                /function\s+dinoco_obs_is_enabled\s*\([\s\S]*?\n    \}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            expect(fnBody).toMatch(/static\s+\$cache_busted/);
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
        });
    });

    describe("[B2F] Snippet 1 V.7.7+ — H7 in b2f_is_flag_enabled", () => {
        const src = readFile("[B2F] Snippet 1: Core Utilities & Flex Builders");

        test("b2f_is_flag_enabled() uses alloptions bust pattern", () => {
            const fnMatch = src.match(
                /function\s+b2f_is_flag_enabled\s*\([\s\S]*?\n\}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
        });
    });

    describe("[Admin System] DINOCO Production SN Manager — H7 in master switch", () => {
        const src = readFile("[Admin System] DINOCO Production SN Manager");

        test("dinoco_sn_is_enabled() uses alloptions bust pattern", () => {
            const fnMatch = src.match(
                /function\s+dinoco_sn_is_enabled\s*\([\s\S]*?\n\}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
        });
    });

    describe("[System] DINOCO SN REST API — H7 in marketplace flag check", () => {
        const src = readFile("[System] DINOCO SN REST API");

        test("dinoco_sn_marketplace_is_enabled() uses alloptions bust", () => {
            const fnMatch = src.match(
                /function\s+dinoco_sn_marketplace_is_enabled\s*\([\s\S]*?\n\}/
            );
            expect(fnMatch).not.toBeNull();
            const fnBody = fnMatch[0];
            expect(fnBody).toMatch(
                /wp_cache_delete\s*\(\s*['"]alloptions['"]\s*,\s*['"]options['"]\s*\)/
            );
        });
    });

    describe("Diagnose UI lock-in — surfaces drift in future", () => {
        test("SN Go-Live Tool /diagnose-flag REST endpoint registered", () => {
            const src = readFile("[Admin System] DINOCO SN Go-Live Tool");
            expect(src).toMatch(
                /register_rest_route\s*\(\s*['"]dinoco-sn-golive\/v1['"]\s*,\s*['"]\/diagnose-flag['"]/
            );
        });

        test("SN Go-Live Tool /diagnose-flag returns Path 5 alloptions_cache row", () => {
            const src = readFile("[Admin System] DINOCO SN Go-Live Tool");
            // V.2.5 added alloptions_cache + config_layer_per_request_cache
            // diagnostic rows so admin can pin-point H7/H8 incidents.
            expect(src).toMatch(/['"]alloptions_cache['"]/);
            expect(src).toMatch(/['"]config_layer_per_request_cache['"]/);
        });

        test("GDPR snippet has inline diagnose UI button on FLAG OFF branch", () => {
            const src = readFile("[System] DINOCO GDPR Data Requests");
            // V.4.4 added inline diagnose UI as escape hatch when banner stuck.
            expect(src).toMatch(/data-action=["']diagnose-flag["']/);
        });

        test("GDPR snippet has cache-bust reload button on diagnose verdict=TRUE", () => {
            const src = readFile("[System] DINOCO GDPR Data Requests");
            // V.4.5 escape hatch when AJAX response cached at WPFC layer.
            expect(src).toMatch(/data-action=["']reload-cache-bust["']/);
        });
    });
});
