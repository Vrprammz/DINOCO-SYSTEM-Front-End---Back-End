/**
 * Markdown internal-link integrity check.
 *
 * Scans all .md files in the repo (excluding vendor/node_modules/etc.)
 * for `[text](relative-path)` patterns and verifies each target exists.
 *
 * Catches:
 *   - Broken refs after file rename/deletion
 *   - Typos in link paths
 *   - Stale documentation pointing to removed runbooks
 *
 * Skips:
 *   - http/https/mailto links (external — out of scope)
 *   - Anchor-only links (#section)
 *   - Empty links (image alt-text accidents)
 *   - Image links via the same regex (since they share `![alt](src)` form
 *     when src is a file path, but we limit to relative paths only)
 *
 * Why a Jest test (not a separate CLI):
 *   - Same CI workflow that runs Jest catches broken links automatically
 *   - Path filter on .github/workflows/jest.yml already covers `**.md`
 *     once added, so adding a doc triggers the check
 *
 * Performance: ~99 .md files × few thousand lines = <1s on M1.
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
    "openclawminicrm/node_modules",
    "openclawminicrm/smltrackdashboard/node_modules",
    "openclawminicrm/proxy/node_modules",
    "round-1-archived", // archived audit reports
];

function shouldIgnore(absPath) {
    const rel = path.relative(REPO_ROOT, absPath);
    return IGNORED_DIRS.some(
        (dir) => rel === dir || rel.startsWith(dir + path.sep)
    );
}

function findMarkdownFiles(dir, results = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (shouldIgnore(full)) continue;
        if (entry.isDirectory()) {
            findMarkdownFiles(full, results);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            results.push(full);
        }
    }
    return results;
}

/**
 * Strip fenced code blocks + inline code spans before link extraction.
 * Markdown examples like `[text](rel-path)` inside backticks are syntax
 * documentation, not real links, and must not trigger validation.
 *
 * Replaces stripped regions with same-length spaces to preserve line
 * numbering for error reporting.
 */
function stripCodeRegions(content) {
    // Fenced code blocks: ```lang\n...\n```
    let out = content.replace(/```[\s\S]*?```/g, (m) =>
        m.replace(/[^\n]/g, " ")
    );
    // Inline code spans: `...` (non-greedy, single line)
    out = out.replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
    return out;
}

/**
 * Extract markdown link targets `[text](target)` from content.
 * Returns array of `{ target, line }` for relative-path targets only.
 *
 * Skips:
 *   - URI schemes (http://, mailto:, computer://, etc.)
 *   - Anchor-only (`#section`)
 *   - Empty targets
 *   - Code-region content (fenced + inline)
 */
function extractRelativeLinks(content) {
    content = stripCodeRegions(content);
    // Match [text](target). Non-greedy on text + target. Stop target at first
    // unescaped paren or whitespace (markdown link spec).
    const linkRe = /\[([^\]]*)\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g;

    const results = [];
    let match;
    let lineCounter = 1;
    let lastIdx = 0;

    while ((match = linkRe.exec(content)) !== null) {
        const target = match[2].trim();

        // Skip any URI scheme (`scheme://...` or `scheme:...`).
        // Catches http/https/mailto/tel/ftp + IDE schemes (computer://,
        // vscode://, file://) without an enumerated allowlist.
        if (
            !target ||
            /^[a-z][a-z0-9+.-]*:/i.test(target) ||
            target.startsWith("//") || // protocol-relative
            target.startsWith("#") // anchor only
        ) {
            continue;
        }

        // Compute line number from match offset
        const upToMatch = content.substring(lastIdx, match.index);
        for (const ch of upToMatch) {
            if (ch === "\n") lineCounter++;
        }
        lastIdx = match.index;

        results.push({ target, line: lineCounter });
    }
    return results;
}

/**
 * Resolve a markdown link target relative to the source file.
 * Strips `#anchor` from path before existence check.
 * Decodes URL-encoded paths (e.g., %20 → space).
 */
function resolveTarget(sourceFile, target) {
    let pathPart = target.split("#")[0]; // strip anchor
    if (!pathPart) return null; // pure anchor
    try {
        pathPart = decodeURIComponent(pathPart);
    } catch {
        // Leave as-is if decode fails
    }
    const sourceDir = path.dirname(sourceFile);
    return path.resolve(sourceDir, pathPart);
}

describe("Markdown internal links", () => {
    const mdFiles = findMarkdownFiles(REPO_ROOT);

    test(`scans .md files (found ${mdFiles.length})`, () => {
        expect(mdFiles.length).toBeGreaterThan(50);
    });

    test("all relative links resolve to existing files", () => {
        const broken = [];

        for (const file of mdFiles) {
            const content = fs.readFileSync(file, "utf8");
            const links = extractRelativeLinks(content);
            for (const { target, line } of links) {
                const resolved = resolveTarget(file, target);
                if (resolved === null) continue;
                if (!fs.existsSync(resolved)) {
                    broken.push({
                        file: path.relative(REPO_ROOT, file),
                        line,
                        target,
                        resolved: path.relative(REPO_ROOT, resolved),
                    });
                }
            }
        }

        if (broken.length > 0) {
            const formatted = broken
                .slice(0, 20) // cap to first 20 for readability
                .map(
                    (b) =>
                        `  ${b.file}:${b.line} → ${b.target}  (resolved: ${b.resolved})`
                )
                .join("\n");
            const hint =
                broken.length > 20
                    ? `\n  ... and ${broken.length - 20} more`
                    : "";
            throw new Error(
                `${broken.length} broken markdown link(s):\n${formatted}${hint}`
            );
        }
    });
});
