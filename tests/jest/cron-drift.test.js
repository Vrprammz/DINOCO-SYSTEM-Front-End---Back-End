/**
 * Cron drift detector — CLAUDE.md ↔ wp_schedule_event() registrations.
 *
 * CLAUDE.md mentions cron job names throughout (e.g.
 * `b2b_bo_restock_scan_cron`, `dinoco_dip_stock_reminder_cron`,
 * `b2f_diff_cron_hourly`) — each mentioned cron must be:
 *   1. Registered via `wp_schedule_event(time, recurrence, 'name')`
 *      OR via the project helper `dinoco_register_cron(...)` (Snippet 15)
 *   2. AND have at least one matching `add_action('name', ...)` handler
 *
 * Otherwise the doc lies (cron documented but never scheduled, or
 * scheduled but no handler attached → silent no-op).
 *
 * Detection:
 *   - Pattern in docs: backtick-wrapped tokens matching cron-like names:
 *     b2b_*_cron, b2f_*_cron, dinoco_*_cron, flash_*_cron, plus the
 *     `_event` suffix variant (b2b uses `_event` historically for cron
 *     hooks like `b2b_dunning_cron_event` / `b2b_weekly_report_event`).
 *   - Pattern in scheduling: `wp_schedule_event(<time>, <recurrence>, '<name>')`
 *   - Pattern in handlers: `add_action('<name>', ...)` where name ends
 *     with `_cron` or `_event`.
 *
 * Asymmetry: docs is subset of scheduling. Cron scheduled but not
 * documented = OK (internal/legacy hooks). Documented but unscheduled
 * or handler-less = bug.
 *
 * Round 21 ITEM B (2026-04-29) — extends 7 → 8 drift detectors.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const SNIPPET_PREFIXES = [
    "[B2B]",
    "[B2F]",
    "[Admin System]",
    "[AdminSystem-System]",
    "[System]",
    "[GitHub]",
    "[LIFF AI]",
];

/**
 * Crons documented in CLAUDE.md but NOT expected to have an active
 * wp_schedule_event call. Each entry needs a justifying comment.
 */
const DOCUMENTED_NOT_SCHEDULED = new Set([
    // Historical-context mention only. Earlier docs referenced
    // `b2f_junction_diff_cron` as the hourly diff hook, but the actual
    // registered hook is `b2f_diff_cron_hourly` (V.2.2 of [B2F] Snippet
    // 11). CLAUDE.md preserves the obsolete name to explain the rename
    // — it appears alongside the correct name with the parenthetical
    // "earlier docs said `b2f_junction_diff_cron` which was never
    // registered". Verify: grep returns 0 wp_schedule_event refs.
    "b2f_junction_diff_cron",
]);

/**
 * Scheduled crons where the handler is wired via a project-specific
 * pattern that the static regex can't trace (e.g. dynamic
 * `add_action($hook, $handler)` inside a foreach over a registry
 * array). We accept the cron as "handler exists" if BOTH:
 *   (a) the cron name appears as a key in a `'<hook>' => '<callback>'`
 *       map in any snippet (registry pattern)
 *   (b) the file uses `dinoco_register_cron(...)` or
 *       `add_action($hook, $handler)` looped over the map.
 *
 * The detector below evaluates condition (a) automatically. This
 * whitelist is for crons where neither condition (a) nor a static
 * `add_action('name', ...)` handler exists, but the handler is still
 * present (e.g. registered from a non-snippet source like a plugin).
 *
 * Add entries with explicit comments. Empty by default.
 */
const HANDLER_VIA_DYNAMIC = new Set([
    // (none currently — registry pattern detection covers all known cases)
]);

/**
 * Match cron-like identifiers. Allows _cron and _event suffixes (B2B
 * uses _event for some legacy hooks like b2b_dunning_cron_event).
 */
const CRON_NAME_RE =
    /\b(b2[bf]?_[a-z_0-9]+_(?:cron|event)|dinoco_[a-z_0-9]+_(?:cron|event)|flash_[a-z_0-9]+_(?:cron|event))\b/g;

/**
 * Extract cron names from CLAUDE.md backtick-wrapped tokens.
 * Patterns considered:
 *   - `b2b_bo_restock_scan_cron`
 *   - `dinoco_dip_stock_reminder_cron`
 *   - `b2f_diff_cron_hourly`  → matches via _cron substring
 *   - `b2b_dunning_cron_event` (B2B legacy)
 *
 * Filter: must end with `_cron` or `_event` (true cron tokens), and
 * must NOT be a generic helper name like `dinoco_register_cron` or
 * `dinoco_get_cron` (these are utility functions, not hook names).
 */
function extractDocumentedCrons() {
    const content = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const set = new Set();

    // Strip code blocks first to avoid grabbing Python/JS variable names
    // that happen to match the regex.
    const stripped = content.replace(/```[\s\S]*?```/g, "");

    // Pull from backticks (`name`) only — prose mentions without
    // backticks are too noisy.
    const re = /`([^`]+)`/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
        const token = m[1].trim();
        // Token may itself contain multiple identifiers; scan for cron names
        const inner = token.match(CRON_NAME_RE);
        if (!inner) continue;
        for (const name of inner) {
            // Filter helpers (not hook names)
            if (
                name === "dinoco_register_cron" ||
                name === "dinoco_get_cron" ||
                name === "dinoco_inv_cron" || // generic settings key, not a hook
                name === "dinoco_smoke_count_registered_cron" || // smoke metric helper
                name === "dinoco_schedule_auto_close_cron" || // helper, not hook (hook = dinoco_daily_auto_close_event)
                name === "dinoco_deactivate_auto_close_cron" || // helper, not hook
                name === "dinoco_cron_flash_category_verify_cron" // wp_options key, not hook
            ) {
                continue;
            }
            set.add(name);
        }
    }
    return set;
}

/**
 * Pull cron hook names scheduled via:
 *   (1) `wp_schedule_event(<time>, <recurrence>, '<name>')`
 *   (2) `dinoco_register_cron('<name>', <recurrence>, '<callback>')`
 *       — project helper (Health Monitor snippet) that combines
 *       wp_schedule_event + add_action.
 */
function extractScheduledCrons() {
    const set = new Set();
    const reSchedule =
        /wp_schedule_event\s*\(\s*[^,]+,\s*[^,]+,\s*['"]([a-z_0-9]+)['"]/gim;
    const reRegister =
        /dinoco_register_cron\s*\(\s*['"]([a-z_0-9]+)['"]/gim;

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );
        let m;
        reSchedule.lastIndex = 0;
        while ((m = reSchedule.exec(content)) !== null) set.add(m[1]);
        reRegister.lastIndex = 0;
        while ((m = reRegister.exec(content)) !== null) set.add(m[1]);
    }
    return set;
}

/**
 * Pull cron handler registrations via:
 *   (1) `add_action('<name>', <callback>)` — direct
 *   (2) `'<hook_name>' => '<callback_name>'` — registry array
 *       (Snippet 7 + Snippet 11 use a hook→callback map then loop
 *       `foreach { dinoco_register_cron($hook, $sched, $cb) | add_action($hook, $cb); }`).
 *       The map keys are the hook names — once a key matches a cron
 *       suffix (`_cron` or `_event`) AND the value is a quoted string
 *       callback (function-name format), accept it as handler-registered.
 *   (3) `dinoco_register_cron('<name>', <recurrence>, '<callback>')` —
 *       project helper which calls add_action internally.
 */
function extractCronHandlers() {
    const set = new Set();
    // Cron-shaped name: contains _cron_ or _event_ in the middle, OR
    // ends with _cron / _event / _check / _heartbeat. Captures both
    // suffix-style (b2b_dunning_cron_event) and middle-style
    // (b2f_diff_cron_hourly, b2f_cron_weekly_summary).
    const cronShape = "[a-z_0-9]*_(?:cron|event)(?:_[a-z_0-9]+)?|[a-z_0-9]+_(?:check|heartbeat)";
    const reAddAction = new RegExp(
        `add_action\\s*\\(\\s*['"](${cronShape})['"]`,
        "gim"
    );
    // Registry pattern (string callback): 'hook' => 'callback'
    const reRegistryMapStr = new RegExp(
        `['"](${cronShape})['"]\\s*=>\\s*['"][a-z_0-9]+['"]`,
        "gim"
    );
    // Registry pattern (array config): 'hook' => array($schedule, 'callback')
    // — used by [B2F] Snippet 11. Inner array body matches anything
    // up to a closing paren, with a quoted callback inside.
    const reRegistryMapArr = new RegExp(
        `['"](${cronShape})['"]\\s*=>\\s*array\\s*\\([^)]*['"][a-z_0-9_]+['"]`,
        "gim"
    );
    const reRegister = new RegExp(
        `dinoco_register_cron\\s*\\(\\s*['"]([a-z_0-9]+)['"]`,
        "gim"
    );

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.includes(".")) continue;
        if (!SNIPPET_PREFIXES.some((p) => entry.name.startsWith(p))) continue;

        const content = fs.readFileSync(
            path.join(REPO_ROOT, entry.name),
            "utf8"
        );
        let m;
        reAddAction.lastIndex = 0;
        while ((m = reAddAction.exec(content)) !== null) set.add(m[1]);
        reRegistryMapStr.lastIndex = 0;
        while ((m = reRegistryMapStr.exec(content)) !== null) set.add(m[1]);
        reRegistryMapArr.lastIndex = 0;
        while ((m = reRegistryMapArr.exec(content)) !== null) set.add(m[1]);
        reRegister.lastIndex = 0;
        while ((m = reRegister.exec(content)) !== null) set.add(m[1]);
    }
    return set;
}

describe("Cron drift — CLAUDE.md ↔ wp_schedule_event ↔ add_action", () => {
    const documented = extractDocumentedCrons();
    const scheduled = extractScheduledCrons();
    const handlers = extractCronHandlers();

    test("CLAUDE.md mentions cron jobs (sanity)", () => {
        expect(documented.size).toBeGreaterThan(5);
    });

    test("snippets schedule cron jobs (sanity)", () => {
        expect(scheduled.size).toBeGreaterThan(5);
    });

    test("snippets register cron handlers (sanity)", () => {
        expect(handlers.size).toBeGreaterThan(5);
    });

    test("every documented cron is scheduled via wp_schedule_event", () => {
        const missing = [];
        for (const name of documented) {
            if (DOCUMENTED_NOT_SCHEDULED.has(name)) continue;
            if (!scheduled.has(name)) missing.push(name);
        }

        if (missing.length > 0) {
            const formatted = missing.map((n) => `  ${n}`).join("\n");
            throw new Error(
                `${missing.length} cron(s) documented in CLAUDE.md but never ` +
                    `registered via wp_schedule_event() in any snippet:\n` +
                    `${formatted}\n\n` +
                    `Either:\n` +
                    `  1. Schedule the cron in a snippet (preferred), OR\n` +
                    `  2. Remove the mention from CLAUDE.md (doc cleanup), OR\n` +
                    `  3. Add the name to DOCUMENTED_NOT_SCHEDULED in ` +
                    `tests/jest/cron-drift.test.js with a comment ` +
                    `(historical/contextual mention only).`
            );
        }
    });

    test("every scheduled cron has a matching handler registration", () => {
        const missing = [];
        for (const name of scheduled) {
            if (HANDLER_VIA_DYNAMIC.has(name)) continue;
            if (!handlers.has(name)) missing.push(name);
        }

        if (missing.length > 0) {
            const formatted = missing.map((n) => `  ${n}`).join("\n");
            throw new Error(
                `${missing.length} cron(s) scheduled via wp_schedule_event() / ` +
                    `dinoco_register_cron() but no matching handler ` +
                    `registration found:\n${formatted}\n\n` +
                    `Handler detection accepts:\n` +
                    `  - add_action('<name>', <callback>) — direct\n` +
                    `  - 'hook_name' => 'callback_name' — registry array\n` +
                    `  - dinoco_register_cron('<name>', ...) — project helper\n\n` +
                    `Either:\n` +
                    `  1. Wire a handler via one of the above patterns ` +
                    `(preferred), OR\n` +
                    `  2. Remove the wp_schedule_event() call (cron will run ` +
                    `with no-op effect — dead schedule), OR\n` +
                    `  3. Add the name to HANDLER_VIA_DYNAMIC in ` +
                    `tests/jest/cron-drift.test.js with a comment if the ` +
                    `handler is registered via a pattern the static regex ` +
                    `can't detect (rare).`
            );
        }
    });

    test("DOCUMENTED_NOT_SCHEDULED entries don't shadow real schedules", () => {
        // Forces cleanup of stale allowlist entries when the cron
        // actually gets scheduled.
        const stale = [];
        for (const name of DOCUMENTED_NOT_SCHEDULED) {
            if (scheduled.has(name)) stale.push(name);
        }
        expect(stale).toEqual([]);
    });

    test("HANDLER_VIA_DYNAMIC entries don't shadow real handlers", () => {
        // If a handler is later registered statically, this forces
        // cleanup of the dynamic exception entry.
        const stale = [];
        for (const name of HANDLER_VIA_DYNAMIC) {
            if (handlers.has(name)) stale.push(name);
        }
        expect(stale).toEqual([]);
    });
});
