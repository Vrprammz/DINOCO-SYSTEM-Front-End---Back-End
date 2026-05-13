/**
 * Sprint 2D — Pattern Library Adoption Drift Detector
 *
 * Verifies the 5 NEW shared helpers (H1-H5) shipped in Sprint 2 exist + are
 * structured correctly. These helpers are the canonical foundation for
 * Phase 1.3 (16 NEW Flex builders), Sprint 3 sweeps (21 native modal sites,
 * BO Snippet 16 × 8 header overrides), and Sprint 4 HIGH migrations.
 *
 * Fails fast if a helper signature drifts, is removed, or loses backward
 * compatibility. Catches:
 *   - Helper name renamed without updating Phase 1.3 callers
 *   - Severity mapping table altered (warning ≠ #b45309 etc.)
 *   - Status registry losing canonical keys
 *   - Filter chip CSS class disappearing
 *   - JS dinocoFormatDate() signature change
 *
 * Boss directive 2026-05-13: "เอา B2B อิง" — all helpers reflect B2B
 * canonical values per docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

function read(name) {
    return fs.readFileSync(path.join(REPO_ROOT, name), 'utf8');
}

describe('Pattern Library Adoption (Sprint 2 H1-H5)', () => {
    describe('H1 — dinoco_modal_* shorthand JS toolbox (Modal Helpers V.1.3)', () => {
        const modalFile = '[Admin System] DINOCO Modal Helpers';
        let src;
        beforeAll(() => { src = read(modalFile); });

        test('Version bumped to V.1.3', () => {
            expect(src).toMatch(/Version: V\.1\.3/);
        });

        test('__v guard bumped to 1.3 (re-init on re-include)', () => {
            expect(src).toMatch(/window\.dinocoModal && window\.dinocoModal\.__v === '1\.3'/);
            expect(src).toMatch(/__v:\s*'1\.3'/);
        });

        test('3 shorthand globals exist (dinoco_modal_alert/_confirm/_prompt)', () => {
            expect(src).toMatch(/window\.dinoco_modal_alert\s*=\s*function/);
            expect(src).toMatch(/window\.dinoco_modal_confirm\s*=\s*function/);
            expect(src).toMatch(/window\.dinoco_modal_prompt\s*=\s*function/);
        });

        test('Shorthand globals accept string-first signature', () => {
            // _normalizeOpts must handle typeof === 'string'
            expect(src).toMatch(/typeof messageOrOpts === 'string'/);
            // _normalizeOpts assigns merged.message
            expect(src).toMatch(/merged\.message = messageOrOpts/);
        });

        test('Severity → type mapping covers 4 canonical severities', () => {
            const severityBlock = src.match(/switch \(String\(merged\.severity\)\.toLowerCase\(\)\) \{[\s\S]*?\n\s*\}/);
            expect(severityBlock).not.toBeNull();
            const block = severityBlock[0];
            expect(block).toMatch(/case 'critical':/);
            expect(block).toMatch(/case 'warning':/);
            expect(block).toMatch(/case 'success':/);
            expect(block).toMatch(/case 'info':/);
        });

        test('Backward-compat: existing window.dinocoModal API kept', () => {
            expect(src).toMatch(/window\.dinocoModal\s*=\s*\{/);
            expect(src).toMatch(/confirm:\s*function/);
            expect(src).toMatch(/alert:\s*function/);
            expect(src).toMatch(/prompt:\s*function/);
        });
    });

    describe('H2 — dinoco_status_registry() + badge helpers (Design Tokens V.1.2)', () => {
        const tokensFile = '[System] DINOCO Design Tokens';
        let src;
        beforeAll(() => { src = read(tokensFile); });

        test('Version bumped to V.1.2', () => {
            expect(src).toMatch(/DINOCO_DESIGN_TOKENS_VERSION', '1\.2'/);
        });

        test('dinoco_status_registry() helper exists', () => {
            expect(src).toMatch(/function dinoco_status_registry\s*\(\s*\)/);
        });

        test('Registry contains canonical keys from all subsystems', () => {
            // B2B order statuses (sample 4 critical)
            expect(src).toMatch(/'b2b\.draft'/);
            expect(src).toMatch(/'b2b\.paid'/);
            expect(src).toMatch(/'b2b\.partial_fulfilled'/);
            expect(src).toMatch(/'b2b\.all_backorder'/);
            // B2F (sample 3)
            expect(src).toMatch(/'b2f\.draft'/);
            expect(src).toMatch(/'b2f\.confirmed'/);
            expect(src).toMatch(/'b2f\.received'/);
            // Claim (sample 3)
            expect(src).toMatch(/'claim\.pending'/);
            expect(src).toMatch(/'claim\.approved'/);
            expect(src).toMatch(/'claim\.completed'/);
            // SN (sample 4)
            expect(src).toMatch(/'sn\.in_pool'/);
            expect(src).toMatch(/'sn\.registered'/);
            expect(src).toMatch(/'sn\.claimed'/);
            expect(src).toMatch(/'sn\.stolen'/);
            // Charge (Phase 2 — sample 2)
            expect(src).toMatch(/'charge\.pending_payment'/);
            expect(src).toMatch(/'charge\.verified'/);
        });

        test('5 status helpers all exist (registry/resolve/label/color/badge_html/badge_flex/severity)', () => {
            expect(src).toMatch(/function dinoco_status_resolve_key\s*\(/);
            expect(src).toMatch(/function dinoco_status_label\s*\(/);
            expect(src).toMatch(/function dinoco_status_color\s*\(/);
            expect(src).toMatch(/function dinoco_status_badge_html\s*\(/);
            expect(src).toMatch(/function dinoco_status_badge_flex\s*\(/);
            expect(src).toMatch(/function dinoco_status_severity_to_color\s*\(/);
        });

        test('Severity → color mapping uses B2B canonical hex (boss directive)', () => {
            const fn = src.match(/function dinoco_status_severity_to_color[\s\S]+?\n\s{0,4}\}\s*\n\s{0,4}\}/);
            expect(fn).not.toBeNull();
            const body = fn[0];
            // Success → brand-green token (#16A34A per B2B canonical, V.1.3 uppercase)
            expect(body).toMatch(/case 'success':\s*return dinoco_brand_color\(\s*'brand-green'/);
            // Warning → warning-amber token (#B45309 UX-H3 fix)
            expect(body).toMatch(/case 'warning':\s*return dinoco_brand_color\(\s*'warning-amber'/);
            // Critical → danger-red
            expect(body).toMatch(/case 'critical':\s*return dinoco_brand_color\(\s*'danger-red'/);
            // Default/info/brand → brand-navy-flex (#1A3A5C)
            expect(body).toMatch(/return dinoco_brand_color\(\s*'brand-navy-flex'/);
        });

        test('Sprint 7C HIGH-2 fix — V.1.3 registry stores UPPERCASE canonical hex', () => {
            // Code-reviewer HIGH-2: V.1.2 stored lowercase while Sprint 6 V.34.35
            // builders use UPPERCASE — mixed-case payloads. V.1.3 uppercases all
            // 14 canonical entries. Verify the most-critical ones flipped.
            expect(src).toMatch(/'brand-green'\s+=>\s+'#16A34A'/);
            expect(src).toMatch(/'success-emerald'\s+=>\s+'#10B981'/);
            expect(src).toMatch(/'warning-amber'\s+=>\s+'#B45309'/);
            expect(src).toMatch(/'danger-red'\s+=>\s+'#DC2626'/);
            expect(src).toMatch(/'info-blue'\s+=>\s+'#3B82F6'/);
            expect(src).toMatch(/'brand-charcoal-ui'\s+=>\s+'#1F2937'/);
            // brand-navy-flex was already uppercase in V.1.2 — verify it stayed.
            expect(src).toMatch(/'brand-navy-flex'\s+=>\s+'#1A3A5C'/);
            // line-green is LINE-native and was always uppercase
            expect(src).toMatch(/'line-green'\s+=>\s+'#06C755'/);
        });

        test('Sprint 7C — severity_to_color fallback literals match registry uppercase', () => {
            // Defensive fallback path (when registry not loaded) must use same case
            // as registry values to avoid mixed-case Flex bubbles.
            const fn = src.match(/function dinoco_status_severity_to_color[\s\S]+?\n\s{0,4}\}\s*\n\s{0,4}\}/);
            expect(fn).not.toBeNull();
            expect(fn[0]).toMatch(/case 'success':\s*return dinoco_brand_color\(\s*'brand-green'\s*,\s*'#16A34A'/);
            expect(fn[0]).toMatch(/case 'warning':\s*return dinoco_brand_color\(\s*'warning-amber'\s*,\s*'#B45309'/);
            expect(fn[0]).toMatch(/case 'critical':\s*return dinoco_brand_color\(\s*'danger-red'\s*,\s*'#DC2626'/);
        });

        test('Design Tokens version bumped to V.1.3 (HIGH-2 fix)', () => {
            expect(src).toMatch(/Version: V\.1\.3 \(2026-05-13\)/);
        });
    });

    describe('H3 — dinoco_flex_header($title, $sub, $severity, $opts) (B2B Snippet 1 V.34.33)', () => {
        const snippet1File = '[B2B] Snippet 1: Core Utilities & LINE Flex Builders';
        let src;
        beforeAll(() => { src = read(snippet1File); });

        test('Version bumped to V.34.33', () => {
            expect(src).toMatch(/Version: V\.34\.33/);
        });

        test('dinoco_flex_header() helper exists', () => {
            expect(src).toMatch(/function dinoco_flex_header\s*\(\s*\$title,\s*\$subtitle\s*=\s*'',\s*\$severity\s*=\s*'info',\s*\$opts\s*=\s*array\(\s*\)\s*\)/);
        });

        test('Helper resolves bg via dinoco_status_severity_to_color()', () => {
            expect(src).toMatch(/dinoco_status_severity_to_color\(\s*\$severity\s*\)/);
        });

        test('Escape hatch documented: opts.allow_bg_override gates raw bg', () => {
            expect(src).toMatch(/allow_bg_override/);
        });

        test('Delegates to existing b2b_flex_logo_header() (no behavior duplication)', () => {
            const fnBlock = src.match(/function dinoco_flex_header[\s\S]+?^\s*\}\s*\n\}/m);
            expect(fnBlock).not.toBeNull();
            expect(fnBlock[0]).toMatch(/b2b_flex_logo_header\(/);
        });
    });

    describe('H4 — .dnc-filter-chip shared CSS base class (Design Tokens V.1.2)', () => {
        const tokensFile = '[System] DINOCO Design Tokens';
        let src;
        beforeAll(() => { src = read(tokensFile); });

        test('.dnc-filter-chip base class exists', () => {
            expect(src).toMatch(/\.dnc-filter-chip\s*\{/);
        });

        test('Canonical dimensions per B2B Snippet 4:344 reference', () => {
            // padding: 7px 12px
            expect(src).toMatch(/\.dnc-filter-chip\s*\{[^}]*padding:\s*7px\s+12px/s);
            // min-height: 36px
            expect(src).toMatch(/\.dnc-filter-chip\s*\{[^}]*min-height:\s*36px/s);
        });

        test('Variants exist: is-active, is-disabled, __count, focus-visible', () => {
            expect(src).toMatch(/\.dnc-filter-chip\.is-active\s*\{/);
            expect(src).toMatch(/\.dnc-filter-chip\.is-disabled[\s,]/);
            expect(src).toMatch(/\.dnc-filter-chip__count\s*\{/);
            expect(src).toMatch(/\.dnc-filter-chip:focus-visible\s*\{/);
        });

        test('Active state uses --dnc-brand-charcoal-ui (B2B canonical)', () => {
            expect(src).toMatch(/\.dnc-filter-chip\.is-active\s*\{[^}]*background:\s*var\(--dnc-brand-charcoal-ui\)/s);
        });

        test('Filter row container .dnc-filter-chip-row with mobile scroll fallback', () => {
            expect(src).toMatch(/\.dnc-filter-chip-row\s*\{/);
            expect(src).toMatch(/@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.dnc-filter-chip-row/);
        });
    });

    describe('H5 — dinoco_format_date() PHP + JS variant', () => {
        const snippet1File = '[B2B] Snippet 1: Core Utilities & LINE Flex Builders';
        const tokensFile = '[System] DINOCO Design Tokens';

        test('PHP helper exists in B2B Snippet 1 V.34.33', () => {
            const src = read(snippet1File);
            expect(src).toMatch(/function dinoco_format_date\s*\(\s*\$ts,\s*\$context\s*=\s*'customer'\s*\)/);
        });

        test('PHP helper supports 4 context modes: customer/admin/iso/flex', () => {
            const src = read(snippet1File);
            const fn = src.match(/function dinoco_format_date[\s\S]+?^\}\s*\n\}/m);
            expect(fn).not.toBeNull();
            const body = fn[0];
            expect(body).toMatch(/case 'admin':[\s\S]+?'d\/m\/Y H:i'/);
            expect(body).toMatch(/case 'iso':[\s\S]+?'Y-m-d H:i:s'/);
            expect(body).toMatch(/case 'flex':/);
            expect(body).toMatch(/case 'customer':/);
            expect(body).toMatch(/default:[\s\S]+?'d\/m\/Y'/);
        });

        test('PHP helper accepts DateTime / int / string / numeric', () => {
            const src = read(snippet1File);
            const fn = src.match(/function dinoco_format_date[\s\S]+?^\}\s*\n\}/m);
            expect(fn).not.toBeNull();
            const body = fn[0];
            expect(body).toMatch(/instanceof \\?DateTime/);
            expect(body).toMatch(/is_int\(\s*\$ts\s*\)/);
            expect(body).toMatch(/is_string\(\s*\$ts\s*\)/);
            expect(body).toMatch(/is_numeric\(\s*\$ts\s*\)/);
        });

        test('PHP helper never throws (defensive — push path)', () => {
            const src = read(snippet1File);
            const fn = src.match(/function dinoco_format_date[\s\S]+?^\}\s*\n\}/m);
            expect(fn).not.toBeNull();
            expect(fn[0]).toMatch(/try \{[\s\S]+?\} catch \(\s*\\Throwable/);
        });

        test('JS variant window.dinocoFormatDate exists in Design Tokens V.1.2', () => {
            const src = read(tokensFile);
            expect(src).toMatch(/window\.dinocoFormatDate\s*=\s*function/);
        });

        test('JS variant supports same 4 contexts (parity with PHP)', () => {
            const src = read(tokensFile);
            const jsFn = src.match(/window\.dinocoFormatDate\s*=\s*function[\s\S]+?\};\s*\n\s*\}\)\(\);/);
            expect(jsFn).not.toBeNull();
            const body = jsFn[0];
            expect(body).toMatch(/case 'admin':/);
            expect(body).toMatch(/case 'iso':/);
            expect(body).toMatch(/case 'flex':/);
            expect(body).toMatch(/case 'customer':/);
        });
    });

    describe('B2B Canonical Reference doc exists', () => {
        test('docs/design-system/B2B-CANONICAL-REFERENCE-2026-05-13.md exists', () => {
            const docPath = path.join(REPO_ROOT, 'docs', 'design-system', 'B2B-CANONICAL-REFERENCE-2026-05-13.md');
            expect(fs.existsSync(docPath)).toBe(true);
        });

        test('Doc references boss directive verbatim', () => {
            const docPath = path.join(REPO_ROOT, 'docs', 'design-system', 'B2B-CANONICAL-REFERENCE-2026-05-13.md');
            const src = fs.readFileSync(docPath, 'utf8');
            expect(src).toMatch(/ฉันชอบ Design ของ B2B นะเอา B2B อิง/);
        });

        test('Doc declares 4 boss decisions (D1-D4)', () => {
            const docPath = path.join(REPO_ROOT, 'docs', 'design-system', 'B2B-CANONICAL-REFERENCE-2026-05-13.md');
            const src = fs.readFileSync(docPath, 'utf8');
            expect(src).toMatch(/### D1 —/);
            expect(src).toMatch(/### D2 —/);
            expect(src).toMatch(/### D3 —/);
            expect(src).toMatch(/### D4 —/);
        });
    });
});
