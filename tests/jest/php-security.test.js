/**
 * PHP / WordPress security pattern scanner for snippet files.
 *
 * Scans the bracket-prefixed WP Code Snippet files (no `<?php` at line 1)
 * for common WordPress security anti-patterns:
 *
 *   - eval() / system() / exec() / passthru() / shell_exec() — RCE
 *   - $wpdb->query("SELECT … $var") without prepare() — SQL injection
 *   - echo $_GET / echo $_POST / echo $_REQUEST without escaping — XSS
 *
 * Snippet files have format `[B2B] Snippet N: …` (no extension), or
 * `[Admin System] DINOCO …` etc. The Code Snippets plugin injects
 * `<?php` at runtime; we scan the raw file content as PHP.
 *
 * Skip rules:
 *   - Lines inside `/* … *\/` block comments (multi-line aware)
 *   - Lines starting with `//` after trim
 *   - Lines that are docstring continuations (` * `)
 *
 * Allowlist:
 *   - PHP_SECURITY_ALLOWLIST below holds known-safe instances.
 *
 * Why a custom scanner (not phpcs / WPCS):
 *   - WP Coding Standards adds composer dep weight + many false positives
 *     for our snippet pattern (no <?php, dynamic load order)
 *   - We care about the OWASP-class issues here, not full WPCS style
 *   - 100 LOC of focused regex catches the high-severity stuff
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * Patterns are RCE + XSS only. SQL injection detection skipped because
 * WP convention legitimately interpolates table names into queries
 * (`$wpdb->query("UPDATE {$wpdb->options} ...")`); a regex can't tell
 * table-name interpolation apart from value-interpolation cleanly. CodeQL
 * SAST workflow handles the SAST-grade taint analysis for SQL.
 */
const PATTERNS = [
    {
        tag: "RCE_EVAL",
        re: /\beval\s*\(/g,
        severity: "critical",
    },
    {
        tag: "RCE_SHELL",
        // Word-boundary + open-paren. Negative lookbehind on `.` excludes
        // JS method calls (`rx.exec()`, `regex.system()` won't match;
        // PHP global `exec()` will). Lookbehind also excludes `_exec_`,
        // `escapeshellarg`/`escapeshellcmd` (no underscore start).
        re: /(?<![.\w])(system|exec|passthru|shell_exec|popen|proc_open)\s*\(/g,
        severity: "critical",
    },
    {
        tag: "XSS_ECHO_SUPERGLOBAL",
        // echo $_GET / echo $_POST / echo $_REQUEST direct
        re: /\becho\s+\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/g,
        severity: "high",
    },
    {
        tag: "XSS_ECHO_INTERP_REQUEST",
        // echo "...$_GET[x]..." — superglobal interpolated into echo string
        re: /\becho\s+"[^"]*\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/g,
        severity: "high",
    },
];

// Known-safe instances. file:line:tag → reason
const PHP_SECURITY_ALLOWLIST = new Set([
    // mysqldump for Phase 4 migration snapshot. All 4 interpolated args
    // (cred file, db name, table name, output path) are passed through
    // escapeshellarg() before sprintf — textbook-correct shell hardening.
    // Verified 2026-04-28 in commit 4c01934 cleanup.
    "[Admin System] B2F Migration Audit:984:RCE_SHELL",
]);

/**
 * Iterate snippet files at repo root. Snippets are bracket-prefixed
 * with no extension.
 */
function findSnippetFiles() {
    const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        // Bracket-prefixed snippet files — no extension
        if (
            (entry.name.startsWith("[B2B]") ||
                entry.name.startsWith("[B2F]") ||
                entry.name.startsWith("[Admin System]") ||
                entry.name.startsWith("[AdminSystem-System]") ||
                entry.name.startsWith("[System]") ||
                entry.name.startsWith("[GitHub]") ||
                entry.name.startsWith("[LIFF AI]")) &&
            !entry.name.includes(".")
        ) {
            out.push(path.join(REPO_ROOT, entry.name));
        }
    }
    return out;
}

/**
 * Strip PHP comments (block + line) by replacing with same-length spaces
 * so line numbers remain accurate.
 */
function stripPhpComments(content) {
    // Block comments /* ... */
    let out = content.replace(/\/\*[\s\S]*?\*\//g, (m) =>
        m.replace(/[^\n]/g, " ")
    );
    // Line comments // ... (preserve newline)
    out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    // Hash comments # ... (rare in WP code but supported)
    out = out.replace(/(^|\n)\s*#[^\n]*/g, (m) =>
        m.replace(/[^\n]/g, (c) => (c === " " ? " " : " "))
    );
    return out;
}

function lineNumberOf(content, offset) {
    let n = 1;
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === "\n") n++;
    }
    return n;
}

function scanFile(absPath) {
    const raw = fs.readFileSync(absPath, "utf8");
    // Skip files that look binary
    if (raw.indexOf("\0") !== -1) return [];

    const content = stripPhpComments(raw);
    const findings = [];

    for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        let m;
        while ((m = pat.re.exec(content)) !== null) {
            const line = lineNumberOf(content, m.index);
            const file = path.relative(REPO_ROOT, absPath);
            const key = `${file}:${line}:${pat.tag}`;
            if (PHP_SECURITY_ALLOWLIST.has(key)) continue;

            // Recover original line text (not stripped) for reporting
            const lines = raw.split("\n");
            const lineText = (lines[line - 1] || "").trim().substring(0, 120);

            findings.push({
                file,
                line,
                tag: pat.tag,
                severity: pat.severity,
                snippet: lineText,
            });
        }
    }
    return findings;
}

describe("PHP / WordPress security scanner", () => {
    const snippetFiles = findSnippetFiles();

    test("repo has snippet files to scan", () => {
        expect(snippetFiles.length).toBeGreaterThan(50);
    });

    test("no critical/high security anti-patterns in snippets", () => {
        const findings = [];
        for (const f of snippetFiles) {
            findings.push(...scanFile(f));
        }

        if (findings.length > 0) {
            const formatted = findings
                .slice(0, 30)
                .map(
                    (f) =>
                        `  [${f.severity.toUpperCase()}/${f.tag}] ${f.file}:${f.line}\n    ${f.snippet}`
                )
                .join("\n");
            const hint =
                findings.length > 30
                    ? `\n  ... and ${findings.length - 30} more`
                    : "";
            throw new Error(
                `${findings.length} security finding(s):\n${formatted}${hint}\n\n` +
                    `If a finding is a false positive (e.g. system($_command_arg) ` +
                    `where $command_arg is hardcoded), add the file:line:tag key ` +
                    `to PHP_SECURITY_ALLOWLIST in tests/jest/php-security.test.js ` +
                    `with a comment explaining why.`
            );
        }
    });
});
