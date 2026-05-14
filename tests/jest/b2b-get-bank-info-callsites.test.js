/**
 * b2b_get_bank_info() callsite drift detector — Sprint 9 Phase 2.3 B-3.
 *
 * Pins the 16-callsite contract verified by grep 2026-05-13 (spec §6.5 B-3
 * reference table). Forces PHPUnit fixture coordination whenever a new
 * caller is added — especially if any caller passes the new 'claim' /
 * 'claim_walkin' context.
 *
 * Source of truth:
 *   - Spec: docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §6.5
 *   - SUT: [B2B] Snippet 1: Core Utilities & LINE Flex Builders V.34.36 (DB_ID 72)
 *   - PHPUnit fixture: tests/helpers/BankInfoSignaturePinTest.php
 *
 * What this test does:
 *   1. Greps every snippet file (excluding tests + docs + node_modules + git)
 *      for `b2b_get_bank_info(` invocations.
 *   2. Excludes the function definition line itself (`function b2b_get_bank_info(`).
 *   3. Excludes lines inside PHP block-comments (`* ...` lines in version
 *      headers — V.34.36 mentions the symbol in its own changelog).
 *   4. Asserts the count is exactly 16 — the boss-confirmed contract count.
 *   5. Asserts NO callsite passes `'claim'` or `'claim_walkin'` as the
 *      $context argument yet. When Phase 2.2 charge handler ships, it will
 *      be the FIRST caller — at that point this test will fail, prompting
 *      a coordinated PHPUnit fixture update to acknowledge the new caller.
 *
 * Why this matters: extending `b2b_get_bank_info()` with a `$context`
 * parameter is a wallet-routing decision. If a stale caller accidentally
 * passes `'claim'` (typo, refactor mistake) we want CI to scream BEFORE
 * payment routing breaks in production.
 *
 * Drift remediation playbook:
 *   - Count changed from 16 → N (new caller added):
 *     1. Verify the new caller is intentional (review PR diff).
 *     2. Add a new `test_callsite_NN_*` assertion in BankInfoSignaturePinTest
 *        documenting the new callsite's expected behaviour.
 *     3. Update CALLSITE_COUNT below + bump §6.5 spec table.
 *   - Claim-context caller appears:
 *     1. Verify the call lives inside the Phase 2.2 charge handler (or a
 *        future Phase that has reviewed §6.4 immutability contract).
 *     2. Add a counter test case in BankInfoSignaturePinTest covering the
 *        new caller's GET_LOCK + transaction wrapper assumption.
 *     3. Bump CLAIM_CONTEXT_CALLERS below.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

const SNIPPET_PREFIXES = [
    '[B2B]',
    '[B2F]',
    '[Admin System]',
    '[AdminSystem-System]',
    '[System]',
    '[GitHub]',
    '[LIFF AI]',
];

/**
 * Pinned by grep 2026-05-13 (spec §6.5 B-3 reference table). Update this
 * value ONLY when adding a new test case in BankInfoSignaturePinTest.php
 * + updating the spec reference table together.
 */
const CALLSITE_COUNT = 16;

/**
 * Number of callsites passing $context='claim' or 'claim_walkin'.
 * Phase 1 (Sprint 9) = 0 — extension shipped without any caller flipping
 * the new arg. Phase 2.2 Claim Payment LIFF [#1212] will be the first.
 * Update this value ONLY in lockstep with PHPUnit fixture additions.
 */
const CLAIM_CONTEXT_CALLERS = 0;

/**
 * Collect every snippet filename at the repo root (no nesting — snippet
 * files live as bracket-prefixed top-level files).
 */
function listSnippetFiles() {
    const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && SNIPPET_PREFIXES.some((p) => e.name.startsWith(p)))
        .map((e) => path.join(REPO_ROOT, e.name));
}

/**
 * Strip PHP comments before scanning for callsites. Three patterns:
 *   - Block comment line  : ` * literal text including b2b_get_bank_info(...)`
 *     (lines that begin with optional whitespace + `*` — common in version
 *     headers + JSDoc-style PHP comments)
 *   - Single-line block   : single-line slash-star comment containing call
 *   - End-of-line `//`    : `$bank = ...; // call to b2b_get_bank_info(...)`
 *
 * Critical: do NOT strip the leading `*` from C-style block-comment continuation
 * lines using a global regex on the whole file (that would corrupt other
 * regex matches). Instead, we line-split and filter out lines whose first
 * non-whitespace character is `*` (block-comment continuation) OR `//`
 * (single-line comment) OR begins with `/*`.
 */
function stripCommentLines(content) {
    return content
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*')) return false;   // block-comment continuation
            if (trimmed.startsWith('//')) return false;  // single-line comment
            if (trimmed.startsWith('/*')) return false;  // block-comment opener
            return true;
        })
        .join('\n');
}

/**
 * Find all production callsites of `b2b_get_bank_info(` across snippets.
 * Returns array of { file, lineNumber, lineText, hasContextArg, contextValue }.
 *
 * The function definition line is excluded (we look for invocations only,
 * detected by absence of the `function ` keyword on the same line).
 */
function findCallsites() {
    const callsites = [];
    const files = listSnippetFiles();

    for (const file of files) {
        const raw = fs.readFileSync(file, 'utf8');
        const stripped = stripCommentLines(raw);
        const lines = stripped.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Must contain the symbol followed by `(` (invocation pattern).
            if (!/b2b_get_bank_info\s*\(/.test(line)) continue;
            // Exclude the function definition itself.
            if (/function\s+b2b_get_bank_info\s*\(/.test(line)) continue;

            // Detect whether a $context arg is passed. The legacy single-arg
            // form: `b2b_get_bank_info()` or `b2b_get_bank_info( $oid )`. The
            // new two-arg form: `b2b_get_bank_info( $oid, 'claim' )` or
            // `b2b_get_bank_info( 0, 'claim_walkin' )`. We extract the inside
            // of the first paren-pair on this line.
            const invocationMatch = line.match(/b2b_get_bank_info\s*\(([^)]*)\)/);
            let hasContextArg = false;
            let contextValue = null;
            if (invocationMatch) {
                const args = invocationMatch[1].trim();
                if (args.includes(',')) {
                    hasContextArg = true;
                    // Try to extract a literal string second arg.
                    const ctxMatch = args.match(/,\s*['"]([^'"]+)['"]\s*$/);
                    if (ctxMatch) contextValue = ctxMatch[1];
                }
            }

            callsites.push({
                file: path.basename(file),
                lineNumber: i + 1, // 1-indexed for human grep parity
                lineText: line.trim(),
                hasContextArg,
                contextValue,
            });
        }
    }

    return callsites;
}

describe('b2b_get_bank_info() callsite drift detector — Sprint 9 Phase 2.3 B-3', () => {
    let callsites;

    beforeAll(() => {
        callsites = findCallsites();
    });

    test('callsite count pinned to ' + CALLSITE_COUNT + ' (spec §6.5 B-3 verified 2026-05-13)', () => {
        if (callsites.length !== CALLSITE_COUNT) {
            const summary = callsites
                .map((c) => `  • ${c.file}:${c.lineNumber}  → ${c.lineText.slice(0, 100)}`)
                .join('\n');
            throw new Error(
                `Expected ${CALLSITE_COUNT} callsites, found ${callsites.length}.\n` +
                `If you added a new caller, update tests/helpers/BankInfoSignaturePinTest.php with a new ` +
                `test_callsite_NN_* assertion AND bump CALLSITE_COUNT in this file AND update ` +
                `spec §6.5 B-3 callsite reference table.\n\n` +
                `Found callsites:\n${summary}`
            );
        }
        expect(callsites.length).toBe(CALLSITE_COUNT);
    });

    test('no callsite passes claim/claim_walkin context without coordinating PHPUnit fixture', () => {
        const claimCallers = callsites.filter(
            (c) => c.contextValue === 'claim' || c.contextValue === 'claim_walkin'
        );

        if (claimCallers.length > CLAIM_CONTEXT_CALLERS) {
            const summary = claimCallers
                .map((c) => `  • ${c.file}:${c.lineNumber} passes '${c.contextValue}' — ${c.lineText.slice(0, 100)}`)
                .join('\n');

            // Verify the PHPUnit fixture has been updated to acknowledge the new caller.
            const fixturePath = path.join(REPO_ROOT, 'tests/helpers/BankInfoSignaturePinTest.php');
            const fixture = fs.readFileSync(fixturePath, 'utf8');
            // Search for an explicit acknowledgement marker (a constant or comment
            // that explicitly notes how many claim-context callers are expected).
            const acknowledgedMatch = fixture.match(/claim_context_callers\s*[:=]\s*(\d+)/i);

            throw new Error(
                `Found ${claimCallers.length} callsite(s) passing 'claim'/'claim_walkin' context, ` +
                `expected ${CLAIM_CONTEXT_CALLERS}.\n\n` +
                `If this is the Phase 2.2 charge handler [#1212] landing, update CLAIM_CONTEXT_CALLERS ` +
                `in this file AND add coverage in tests/helpers/BankInfoSignaturePinTest.php for the new ` +
                `caller's GET_LOCK + transaction wrapper assumption (§6.4 immutability contract).\n\n` +
                `Current fixture acknowledges: ${acknowledgedMatch ? acknowledgedMatch[1] : 'not declared'}\n\n` +
                `Offending callsites:\n${summary}`
            );
        }

        expect(claimCallers.length).toBe(CLAIM_CONTEXT_CALLERS);
    });

    test('all callsites are real PHP invocations (no comment-line leaks)', () => {
        // After stripCommentLines, no callsite should start with `*` or `//`.
        for (const c of callsites) {
            expect(c.lineText.startsWith('*')).toBe(false);
            expect(c.lineText.startsWith('//')).toBe(false);
            expect(c.lineText.startsWith('/*')).toBe(false);
        }
    });

    test('callsite locations span the 7 expected source files per spec §6.5', () => {
        // Spec verified 16 callsites across 7 files (Manual Invoice + Snippets 1, 2, 3, 8, 10, 11).
        const expectedFiles = [
            '[Admin System] DINOCO Manual Invoice System',
            '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
            '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator',
            '[B2B] Snippet 3: LIFF E-Catalog REST API',
            '[B2B] Snippet 8: Distributor Ticket View',
            '[B2B] Snippet 10: Invoice Image Generator',
            '[B2B] Snippet 11: Customer LIFF Pages',
        ];
        const actualFiles = new Set(callsites.map((c) => c.file));

        for (const expected of expectedFiles) {
            expect(actualFiles).toContain(expected);
        }
    });

    test('B2B Snippet 1 contains the function DEFINITION (V.34.36 extension landed)', () => {
        const snippet1 = fs.readFileSync(
            path.join(REPO_ROOT, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'),
            'utf8'
        );
        // V.34.36 signature: $order_or_claim_id = 0, $context = 'order'
        expect(snippet1).toMatch(
            /function\s+b2b_get_bank_info\s*\(\s*\$order_or_claim_id\s*=\s*0\s*,\s*\$context\s*=\s*'order'\s*\)/
        );
        // Version header references V.34.36
        expect(snippet1).toMatch(/Version:\s*V\.34\.36/);
    });

    test('SUT routes claim/claim_walkin contexts through dinoco_claim_bank_resolve', () => {
        const snippet1 = fs.readFileSync(
            path.join(REPO_ROOT, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders'),
            'utf8'
        );
        // Scope to the function body for tight match
        const fnMatch = snippet1.match(
            /function\s+b2b_get_bank_info\s*\([\s\S]+?\n\s{4}\}\s*\n\s*\}/
        );
        expect(fnMatch).not.toBeNull();
        const body = fnMatch[0];

        // Branches on context === 'claim' || 'claim_walkin'
        expect(body).toMatch(/\$context\s*===\s*'claim'\s*\|\|\s*\$context\s*===\s*'claim_walkin'/);
        // Calls dinoco_claim_bank_resolve with use_walkin flag
        expect(body).toMatch(/dinoco_claim_bank_resolve\s*\(\s*\$use_walkin_claim\s*\)/);
        // function_exists guard for graceful fallback
        expect(body).toMatch(/function_exists\s*\(\s*'dinoco_claim_bank_resolve'\s*\)/);
        // Error log on missing resolver (one-shot via static flag)
        expect(body).toMatch(/static\s+\$logged_missing_resolver/);
        expect(body).toMatch(/error_log\(/);
        // 5-key B2B shape remap from 9-key resolver output
        expect(body).toMatch(/'name'\s*=>\s*isset\(\s*\$resolved\['bank_name'\]/);
        expect(body).toMatch(/'account'\s*=>\s*isset\(\s*\$resolved\['bank_account'\]/);
        expect(body).toMatch(/'bank_code'\s*=>\s*isset\(\s*\$resolved\['bank_code'\]/);
    });

    test('PHPUnit fixture file BankInfoSignaturePinTest.php exists', () => {
        const fixturePath = path.join(REPO_ROOT, 'tests/helpers/BankInfoSignaturePinTest.php');
        expect(fs.existsSync(fixturePath)).toBe(true);

        const fixture = fs.readFileSync(fixturePath, 'utf8');
        // Sanity — fixture mentions the 16-callsite pin + the 3 new contexts
        expect(fixture).toMatch(/BankInfoSignaturePinTest/);
        expect(fixture).toMatch(/test_callsite_01_/);
        expect(fixture).toMatch(/test_callsite_16_/);
        expect(fixture).toMatch(/test_claim_context_/);
        expect(fixture).toMatch(/test_claim_walkin_context_/);
    });
});
