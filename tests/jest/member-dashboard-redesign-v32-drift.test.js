/**
 * Member Dashboard FULL REDESIGN V.32.0 Drift Detector
 *
 * Boss "DeepReview Full reDesign เลย" after 11+ failed patch rounds.
 * Two specialist agents (ux-ui-expert + frontend-design) converged on
 * definitive design. This file pins V.32.0 patterns so future patches
 * cannot silently regress back into specificity wars / cascade overrides /
 * duplicate action surfaces.
 *
 * Files pinned:
 *   - [System] Dashboard - Header & Forms V.32.0
 *   - [System] Member Dashboard Main V.33.0
 *   - [System] Dashboard - Assets List V.32.3
 *
 * Boss-validated principles (DO NOT VIOLATE):
 *   - Royal Warranty Upgrade button STAYS (always visible, no gate)
 *   - Notification settings stay REMOVED from home (Profile only)
 *   - Empty-state green hero (Assets List V.32.2 line 3120) STAYS as canonical
 *     for 0-warranty new-user onboarding
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const HEADER_PATH   = path.join(REPO_ROOT, '[System] Dashboard - Header & Forms');
const MAIN_PATH     = path.join(REPO_ROOT, '[System] Member Dashboard Main');
const ASSETS_PATH   = path.join(REPO_ROOT, '[System] Dashboard - Assets List');

function read(p) {
    return fs.readFileSync(p, 'utf8');
}

function strip(code) {
    return code
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\?php[\s\S]*?\?>/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

describe('Member Dashboard FULL REDESIGN V.32.0 — definitive end of 11-round logo loop', () => {

    describe('Header & Forms V.32.0 — markup', () => {

        test('SVG wordmark present with exact attributes (PNG retired)', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            // Inline SVG present
            expect(stripped).toMatch(/<svg class="card-title-mark"/);
            expect(stripped).toMatch(/<svg class="card-title-mark"[^>]*width="64"/);
            expect(stripped).toMatch(/<svg class="card-title-mark"[^>]*height="11"/);
            expect(stripped).toMatch(/viewBox="0 0 128 22"/);
            expect(stripped).toMatch(/aria-label="DINOCO"/);
            expect(stripped).toMatch(/<text[\s\S]{0,200}?>DINOCO<\/text>/);
            // PNG image with card-title-mark class must be GONE
            expect(stripped).not.toMatch(/<img[^>]*class="card-title-mark"/);
            expect(stripped).not.toMatch(/<span class="card-title-wordmark">/);
        });

        test('3-card action row markup REMOVED (.dnc-dash-quick-actions)', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            expect(stripped).not.toMatch(/<div class="dnc-dash-quick-actions"/);
            expect(stripped).not.toMatch(/dnc-dash-quick-card--register/);
            expect(stripped).not.toMatch(/dnc-dash-quick-card--claim/);
            expect(stripped).not.toMatch(/dnc-dash-quick-card--transfer/);
        });

        test('Journey Box markup REMOVED — merged into .card-journey one-liner', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            expect(stripped).not.toMatch(/<div class="journey-road-box">/);
            // New .card-journey present inside .card-center with 🏍 emoji
            expect(stripped).toMatch(/<div class="card-journey">\s*🏍/);
        });

        test('.card-moto-showcase markup REMOVED (z-index conflict resolved)', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            expect(stripped).not.toMatch(/<div class="card-moto-showcase">/);
        });

        test('.card-profile-img attribute dimensions are 36×36 not 45×45', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            expect(stripped).toMatch(/class="card-profile-img"[^>]*width="36"[^>]*height="36"/);
        });

        test('Royal Warranty Upgrade STAYS (boss-validated principle)', () => {
            const code = read(HEADER_PATH);
            const stripped = strip(code);
            expect(stripped).toMatch(/class="royal-upgrade-btn"/);
            expect(stripped).toMatch(/Royal Warranty Upgrade/);
        });
    });

    describe('Header & Forms V.32.0 — CSS', () => {

        test('NO !important specificity-war on .card-title-mark (SVG bypasses cascade)', () => {
            const code = read(HEADER_PATH);
            // The old V.31.16 had explicit !important specificity battles
            expect(code).not.toMatch(/\.card-title-mark[\s\S]{0,200}?height:\s*10px\s*!important/);
            expect(code).not.toMatch(/\.card-title-mark[\s\S]{0,200}?max-width:\s*50px\s*!important/);
        });

        test('.card-title-mark mobile <360px sizes are 52×9 px', () => {
            const code = read(HEADER_PATH);
            expect(code).toMatch(/@media \(max-width: 360px\)[\s\S]{0,500}?width:\s*52px/);
            expect(code).toMatch(/@media \(max-width: 360px\)[\s\S]{0,500}?height:\s*9px/);
        });

        test('.card-journey CSS present (Thai-friendly 11px / 1.6 line-height)', () => {
            const code = read(HEADER_PATH);
            expect(code).toMatch(/\.card-journey\s*\{[\s\S]{0,500}?line-height:\s*1\.6/);
            expect(code).toMatch(/\.card-journey\s*\{[\s\S]{0,500}?font-size:\s*11px/);
        });

        test('.card-profile-img CSS dropped !important (cascade fix at Main V.33.0)', () => {
            const code = read(HEADER_PATH);
            // Pre-V.32.0 used !important on width/height for cascade override
            expect(code).not.toMatch(/\.card-profile-img\s*\{[\s\S]{0,500}?width:\s*45px\s*!important/);
            // V.32.0 simple 36px width
            expect(code).toMatch(/\.card-profile-img\s*\{[\s\S]{0,500}?width:\s*36px/);
            expect(code).toMatch(/\.card-profile-img\s*\{[\s\S]{0,500}?height:\s*36px/);
        });

        test('Version header is V.32.0 with FULL REDESIGN marker', () => {
            const code = read(HEADER_PATH);
            expect(code).toMatch(/Version:\s*V\.32\.0/);
            expect(code).toMatch(/FULL REDESIGN/i);
        });
    });

    describe('Member Dashboard Main V.33.0 — cascade fix at source', () => {

        test('.dinoco-wrapper img cascade excludes .card-title-mark + .card-profile-img', () => {
            const code = read(MAIN_PATH);
            // The pre-V.33.0 unscoped rule must be GONE
            expect(code).not.toMatch(/\.dinoco-wrapper img\s*\{\s*max-width:\s*100%/);
            // The V.33.0 scoped rule must be present
            expect(code).toMatch(/\.dinoco-wrapper img:not\(\.card-title-mark\):not\(\.card-profile-img\)/);
        });

        test('Version header is V.33.0 with cascade fix rationale', () => {
            const code = read(MAIN_PATH);
            expect(code).toMatch(/Version:\s*V\.33\.0/);
            expect(code).toMatch(/cascade/i);
        });
    });

    describe('Assets List V.32.3 — section header + empty-state hero preserved', () => {

        test('.dnc-assets-head section header present with สินค้าของคุณ count', () => {
            const code = read(ASSETS_PATH);
            const stripped = strip(code);
            expect(stripped).toMatch(/class="dnc-assets-head"/);
            expect(stripped).toMatch(/สินค้าของคุณ \(/);
            // Uses $total_display variable from existing query (V.31+ pattern)
            expect(code).toMatch(/\$total_display/);
        });

        test('Empty-state green hero at line ~3129 STAYS (boss-validated)', () => {
            const code = read(ASSETS_PATH);
            // Boss-validated: this is the canonical 0-warranty onboarding surface
            expect(code).toMatch(/ลงทะเบียนสินค้าชิ้นแรก/);
            expect(code).toMatch(/!\$my_bundles->have_posts\(\) && !\$my_singles->have_posts\(\)/);
            // Green gradient hero
            expect(code).toMatch(/linear-gradient\(135deg, #16a34a 0%, #047857/);
        });

        test('Section header ONLY renders when have_posts (skip on empty state)', () => {
            const code = read(ASSETS_PATH);
            // Guard around .dnc-assets-head must check have_posts (avoid duplicate
            // hero on empty state which already has its own)
            expect(code).toMatch(/\$my_bundles->have_posts\(\) \|\| \$my_singles->have_posts\(\)[\s\S]{0,500}?dnc-assets-head/);
        });

        test('Version header is V.32.3', () => {
            const code = read(ASSETS_PATH);
            expect(code).toMatch(/Version:\s*V\.32\.3/);
        });
    });
});
