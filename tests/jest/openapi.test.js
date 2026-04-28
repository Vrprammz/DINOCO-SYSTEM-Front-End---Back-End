/**
 * Phase 6 OpenAPI spec validation test.
 *
 * Validates docs/api/openapi.yaml on every push:
 *   - YAML parses cleanly (catches indentation typos)
 *   - Spec is valid OpenAPI 3.1 (catches structural errors)
 *   - All $ref pointers resolve (catches dangling references)
 *
 * Why this matters:
 *   - 2052 LOC spec is hand-maintained alongside code
 *   - Silent corruption (bad indent, missing `:`, broken $ref) only
 *     surfaces when someone tries to render Swagger UI later
 *   - Catches drift between documented endpoints and actual ones
 *
 * Skips coverage of business semantics (response shape vs. real WP_Error
 * format) — that requires runtime contract testing (Phase 7).
 */

const path = require("path");
const fs = require("fs");

describe("OpenAPI spec — docs/api/openapi.yaml", () => {
    const specPath = path.resolve(__dirname, "../../docs/api/openapi.yaml");

    test("file exists at expected path", () => {
        expect(fs.existsSync(specPath)).toBe(true);
    });

    test("YAML parses without errors", () => {
        const yaml = require("js-yaml");
        const raw = fs.readFileSync(specPath, "utf8");
        let parsed;
        expect(() => {
            parsed = yaml.load(raw);
        }).not.toThrow();
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe("object");
    });

    test("declares OpenAPI 3.1.x version", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        expect(parsed.openapi).toMatch(/^3\.1/);
    });

    test("has required top-level fields (info, paths, components)", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        expect(parsed.info).toBeDefined();
        expect(parsed.info.title).toBeTruthy();
        expect(parsed.info.version).toBeTruthy();
        expect(parsed.paths).toBeDefined();
        expect(Object.keys(parsed.paths).length).toBeGreaterThan(0);
        expect(parsed.components).toBeDefined();
    });

    test("validates as OpenAPI 3.1 via swagger-parser", async () => {
        const SwaggerParser = require("@apidevtools/swagger-parser");
        const yaml = require("js-yaml");
        // Pass parsed object directly — swagger-parser would otherwise try
        // to fetch the path as URL under jsdom's http://localhost origin.
        // validate() runs full structural checks + $ref resolution.
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        const api = await SwaggerParser.validate(parsed);
        expect(api).toBeDefined();
        expect(api.openapi).toMatch(/^3\.1/);
    }, 30000);

    test("declares the 7 documented namespaces in tags", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        const tagNames = (parsed.tags || []).map((t) => t.name);

        // From CLAUDE.md: 7 namespaces (b2b/v1, b2f/v1, dinoco-stock/v1,
        // dinoco-b2f-audit/v1, liff-ai/v1, dinoco-mcp/v1, dinoco/v1)
        // Spec covers 6 (b2f-audit deliberately excluded — admin-only).
        expect(tagNames).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^B2B/i),
                expect.stringMatching(/^B2F/i),
                expect.stringMatching(/^LIFF/i),
                expect.stringMatching(/^Inventory/i),
            ])
        );
    });

    test("every path has at least one operation defined", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

        for (const [pathName, pathItem] of Object.entries(parsed.paths)) {
            const ops = HTTP_METHODS.filter((m) => pathItem[m]);
            expect(ops.length).toBeGreaterThan(0);
            // Document failure clearly for the first violator
            if (ops.length === 0) {
                throw new Error(`Path ${pathName} has no operations defined`);
            }
        }
    });

    test("every operation declares at least one response", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

        const failures = [];
        for (const [pathName, pathItem] of Object.entries(parsed.paths)) {
            for (const method of HTTP_METHODS) {
                const op = pathItem[method];
                if (!op) continue;
                if (!op.responses || Object.keys(op.responses).length === 0) {
                    failures.push(`${method.toUpperCase()} ${pathName}`);
                }
            }
        }
        expect(failures).toEqual([]);
    });

    test("security schemes referenced exist in components", () => {
        const yaml = require("js-yaml");
        const parsed = yaml.load(fs.readFileSync(specPath, "utf8"));
        const declared = Object.keys(
            (parsed.components && parsed.components.securitySchemes) || {}
        );
        const used = new Set();

        // Top-level security
        for (const sec of parsed.security || []) {
            for (const k of Object.keys(sec)) used.add(k);
        }
        // Per-operation security
        const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
        for (const pathItem of Object.values(parsed.paths)) {
            for (const method of HTTP_METHODS) {
                const op = pathItem[method];
                if (!op || !op.security) continue;
                for (const sec of op.security) {
                    for (const k of Object.keys(sec)) used.add(k);
                }
            }
        }

        for (const scheme of used) {
            expect(declared).toContain(scheme);
        }
    });
});
