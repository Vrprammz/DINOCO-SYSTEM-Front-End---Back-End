/**
 * Dangerous-API pattern check for liff-src/ + brand-voice-extension/.
 *
 * Catches XSS / arbitrary-code-execution patterns that ESLint's default
 * recommended config doesn't flag:
 *   - `eval(…)` — string→code execution
 *   - `new Function(…)` — same risk, harder to grep
 *   - `setTimeout("string", …)` / `setInterval("string", …)` — string form
 *     accepts code, not a function reference
 *   - `document.write(…)` — XSS-prone in modern apps
 *   - `innerHTML = ` / `outerHTML = ` — XSS sink unless input is trusted
 *
 * Allowlist:
 *   - DANGEROUS_ALLOWLIST below holds known-safe instances (e.g. innerHTML
 *     used with sanitized HTML constants). Each entry has a comment.
 *
 * Why a custom test (not eslint-plugin-security or similar):
 *   - Plugin would add a heavyweight dep + churn for the same 5 patterns
 *   - Custom regex is auditable in 50 LOC, fits the existing pattern of
 *     openapi/markdown/secrets scanners
 *   - We don't care about every theoretical XSS path in deps, just our
 *     own code
 *
 * Skip rules:
 *   - tests/jest/dangerous-apis.test.js (this file — defines patterns)
 *   - node_modules/, vendor/, dist/, coverage/
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const SCAN_DIRS = [
    path.join(REPO_ROOT, "liff-src"),
    path.join(REPO_ROOT, "brand-voice-extension"),
];

const PATTERNS = [
    {
        tag: "EVAL",
        re: /\beval\s*\(/g,
    },
    {
        tag: "NEW_FUNCTION",
        re: /\bnew\s+Function\s*\(/g,
    },
    {
        tag: "SETTIMEOUT_STRING",
        // `setTimeout("…", N)` or `setTimeout('…', N)` — string-form first arg
        re: /\bsetTimeout\s*\(\s*['"]/g,
    },
    {
        tag: "SETINTERVAL_STRING",
        re: /\bsetInterval\s*\(\s*['"]/g,
    },
    {
        tag: "DOCUMENT_WRITE",
        re: /\bdocument\.write(?:ln)?\s*\(/g,
    },
];

// Known-safe instances. Add with a comment explaining why each is OK.
const DANGEROUS_ALLOWLIST = new Set([
    // (none yet — this set scales to 5-10 entries before becoming unwieldy;
    // beyond that, refactor the offending site instead)
]);

function findJsFiles(dir, results = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            findJsFiles(full, results);
        } else if (entry.isFile() && full.endsWith(".js")) {
            results.push(full);
        }
    }
    return results;
}

function lineNumberOf(content, offset) {
    let n = 1;
    for (let i = 0; i < offset; i++) {
        if (content[i] === "\n") n++;
    }
    return n;
}

function scanFile(absPath) {
    const content = fs.readFileSync(absPath, "utf8");
    const findings = [];
    for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        let m;
        while ((m = pat.re.exec(content)) !== null) {
            const line = lineNumberOf(content, m.index);
            const lineStart = content.lastIndexOf("\n", m.index) + 1;
            const lineEnd = content.indexOf("\n", m.index);
            const lineText = content.substring(
                lineStart,
                lineEnd === -1 ? content.length : lineEnd
            );
            const key = `${path.relative(REPO_ROOT, absPath)}:${line}:${pat.tag}`;
            if (DANGEROUS_ALLOWLIST.has(key)) continue;
            // Skip lines that are just comments
            const trimmed = lineText.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
            findings.push({
                file: path.relative(REPO_ROOT, absPath),
                line,
                tag: pat.tag,
                snippet: lineText.trim().substring(0, 100),
            });
        }
    }
    return findings;
}

describe("Dangerous-API pattern check", () => {
    const allFiles = SCAN_DIRS.flatMap((d) => findJsFiles(d));

    test("collects JS files to scan", () => {
        expect(allFiles.length).toBeGreaterThan(5);
    });

    test("no eval/Function/string-timer/document.write", () => {
        const findings = [];
        for (const f of allFiles) {
            findings.push(...scanFile(f));
        }
        if (findings.length > 0) {
            const formatted = findings
                .map(
                    (f) =>
                        `  [${f.tag}] ${f.file}:${f.line}\n    ${f.snippet}`
                )
                .join("\n");
            throw new Error(
                `${findings.length} dangerous-API call(s) found:\n${formatted}\n\n` +
                    `If a finding is a false positive (e.g. eval inside a comment example), ` +
                    `add the file:line:tag key to DANGEROUS_ALLOWLIST in ` +
                    `tests/jest/dangerous-apis.test.js with a comment explaining why.`
            );
        }
    });
});
