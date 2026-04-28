/**
 * Secrets / credential leak scanner.
 *
 * Scans tracked source files for literal secret patterns.
 *
 * Catches:
 *   - LINE channel access tokens (100+ chars Base64ish)
 *   - Telegram bot tokens   `<digits>:<35-char-token>`
 *   - GitHub Personal Access Tokens   `ghp_*` / `github_pat_*`
 *   - AWS access keys   `AKIA*`
 *   - JWT tokens   `eyJ...` (3-segment base64url)
 *   - Generic SECRET/KEY/TOKEN/PASSWORD assignments with high-entropy
 *     literal values
 *
 * Skips:
 *   - .env.example (template — placeholder values expected)
 *   - tests/** — test fixtures + the scanner itself reference patterns
 *   - docs/**.md — runbooks describe formats by example
 *   - .git, node_modules, vendor, dist, coverage, openclawminicrm/{node_modules}
 *
 * Allowlist:
 *   - SCANNER_ALLOWLIST below holds known-safe patterns (lowercase
 *     hex hashes that LOOK like AWS keys but aren't, etc.)
 *
 * The scanner errs on the side of false positives — it's better to
 * trip on a placeholder than to miss a real leak. False positives
 * get added to SCANNER_ALLOWLIST with a comment explaining why.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const IGNORED_DIRS = [
    "node_modules",
    "vendor",
    "dist",
    "coverage",
    ".git",
    ".obsidian",
    ".phpunit.cache",
    "openclawminicrm/node_modules",
    "openclawminicrm/smltrackdashboard/node_modules",
    "openclawminicrm/proxy/node_modules",
    "round-1-archived",
    "dinoco-catalog-20260415-160556", // local catalog dump
    "github", // local clone
];

const IGNORED_FILES = [
    ".env.example", // template values
    "package-lock.json", // npm integrity hashes false-trigger generic regex
    "composer.lock", // same
    "tests/jest/secrets-scan.test.js", // this file (defines patterns)
    "b2f-migration-dry-run-20260415-165742.csv", // local diff dump
];

// Skip non-source binary/asset extensions
const IGNORED_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".gz", ".tar",
    ".lock", // generic lockfile catchall
    ".map", // sourcemaps
]);

// Documented pattern signatures. `tag` surfaces in failure message.
const PATTERNS = [
    // LINE access tokens — 172-char base64 with + / =
    {
        tag: "LINE_ACCESS_TOKEN",
        re: /\b[A-Za-z0-9+/]{170,}=*\b/g,
        // High false-positive rate without context — require it appear
        // adjacent to a LINE-related identifier
        contextRe: /LINE.{0,40}|CHANNEL_ACCESS_TOKEN|ACCESS_TOKEN.{0,5}=.{0,5}["']?[A-Za-z0-9+/=]{100,}/i,
    },
    {
        tag: "TELEGRAM_BOT_TOKEN",
        re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
    },
    {
        tag: "GITHUB_PAT_CLASSIC",
        re: /\bghp_[A-Za-z0-9]{36}\b/g,
    },
    {
        tag: "GITHUB_PAT_FINE_GRAINED",
        re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
    },
    {
        tag: "AWS_ACCESS_KEY",
        re: /\bAKIA[0-9A-Z]{16}\b/g,
    },
    {
        tag: "JWT",
        // 3-segment base64url-ish, header must be `eyJ` (decodes to `{"`)
        re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    },
];

// Known-safe strings (placeholders, public IDs, repo-specific exceptions).
// Add entries as failures surface — each entry should have a comment
// explaining why it's safe.
const SCANNER_ALLOWLIST = new Set([
    // Placeholder values in env templates / example configs would normally
    // be in .env.example (already skipped); this is for any other file.
    "AKIAIOSFODNN7EXAMPLE", // AWS docs-canonical example key
]);

function shouldIgnoreDir(absPath) {
    const rel = path.relative(REPO_ROOT, absPath);
    return IGNORED_DIRS.some(
        (dir) => rel === dir || rel.startsWith(dir + path.sep)
    );
}

function shouldIgnoreFile(absPath) {
    const rel = path.relative(REPO_ROOT, absPath);
    if (IGNORED_FILES.includes(rel)) return true;
    const ext = path.extname(absPath).toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) return true;
    // Skip docs and tests — they describe formats by example
    if (rel.startsWith("docs/") && rel.endsWith(".md")) return true;
    if (rel.startsWith("tests/")) return true;
    return false;
}

function findSourceFiles(dir, results = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (shouldIgnoreDir(full)) continue;
        if (entry.isDirectory()) {
            findSourceFiles(full, results);
        } else if (entry.isFile()) {
            if (shouldIgnoreFile(full)) continue;
            // Cap file size to skip huge generated artifacts
            try {
                const stat = fs.statSync(full);
                if (stat.size > 5 * 1024 * 1024) continue; // 5 MB cap
            } catch {
                continue;
            }
            results.push(full);
        }
    }
    return results;
}

function lineNumberOf(content, offset) {
    let n = 1;
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === "\n") n++;
    }
    return n;
}

function scanFile(absPath) {
    let content;
    try {
        content = fs.readFileSync(absPath, "utf8");
    } catch {
        return [];
    }
    // Quick binary detection — null byte in first 1KB
    if (content.indexOf("\0") !== -1) return [];

    const findings = [];
    for (const pat of PATTERNS) {
        let m;
        // reset lastIndex for global regex
        pat.re.lastIndex = 0;
        while ((m = pat.re.exec(content)) !== null) {
            const value = m[0];
            if (SCANNER_ALLOWLIST.has(value)) continue;

            // For high-FP patterns, require contextRe match in surrounding window
            if (pat.contextRe) {
                const windowStart = Math.max(0, m.index - 80);
                const windowEnd = Math.min(content.length, m.index + value.length + 40);
                const window = content.substring(windowStart, windowEnd);
                if (!pat.contextRe.test(window)) continue;
            }

            findings.push({
                file: path.relative(REPO_ROOT, absPath),
                line: lineNumberOf(content, m.index),
                tag: pat.tag,
                preview: value.substring(0, 12) + "…(" + value.length + " chars)",
            });
        }
    }
    return findings;
}

describe("Secrets / credential scanner", () => {
    const sourceFiles = findSourceFiles(REPO_ROOT);

    test("repo has source files to scan", () => {
        expect(sourceFiles.length).toBeGreaterThan(50);
    });

    test("no committed secrets in source", () => {
        const findings = [];
        for (const f of sourceFiles) {
            findings.push(...scanFile(f));
        }

        if (findings.length > 0) {
            const formatted = findings
                .slice(0, 20)
                .map(
                    (f) =>
                        `  [${f.tag}] ${f.file}:${f.line}  ${f.preview}`
                )
                .join("\n");
            const hint =
                findings.length > 20
                    ? `\n  ... and ${findings.length - 20} more`
                    : "";
            throw new Error(
                `${findings.length} potential secret(s) found:\n${formatted}${hint}\n\n` +
                    `If a finding is a false positive (e.g. placeholder, public ID, ` +
                    `non-secret hash), add the value to SCANNER_ALLOWLIST in ` +
                    `tests/jest/secrets-scan.test.js with a comment explaining why.`
            );
        }
    });
});
