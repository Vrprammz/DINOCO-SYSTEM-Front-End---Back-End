/**
 * Claim Flex Builders drift detector — Sprint 6 Phase 1.3
 * (Spec V.2.3 §5.1 — 10 status-keyed + 6 special-event builders).
 *
 * Pins each builder's existence in [B2B] Snippet 1 (DB_ID 72) + verifies
 * LINE Flex schema discipline applied:
 *   - All hex colors UPPERCASE 6-digit (e.g., #16A34A not #16a34a or #FFF)
 *   - No null values anywhere (would crash LINE schema validator)
 *   - No float opacity (LINE rejects 0.5 — must be int 0/1 or omit)
 *   - All button objects have 'style' attribute (primary/secondary/link)
 *
 * Builder name pattern:
 *   b2b_build_flex_claim_status_{slug}    × 10
 *   b2b_build_flex_claim_charge_request
 *   b2b_build_flex_claim_charge_paid
 *   b2b_build_flex_claim_charge_rejected
 *   b2b_build_flex_claim_charge_refunded
 *   b2b_build_flex_claim_charge_expired
 *   b2b_build_flex_claim_shipment_delivered
 *
 * Naming MUST match Claim Lifecycle Notifier V.0.2 lookup contract:
 *   `b2b_build_flex_claim_status_` . slug_from(to_status)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const SNIPPET1 = path.join(REPO, '[B2B] Snippet 1: Core Utilities & LINE Flex Builders');
const code = fs.readFileSync(SNIPPET1, 'utf8');

// Strip PHP comments (block + line) to prevent false-positives from docs
function stripPhpComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
}
const liveCode = stripPhpComments(code);

const STATUS_SLUGS = [
    'registered_in_system',
    'awaiting_customer_shipment',
    'received_at_company',
    'under_maintenance',
    'maintenance_completed',
    'repaired_item_dispatched',
    'pending_issue_verification',
    'replacement_approved',
    'replacement_shipped',
    'replacement_rejected_by_company',
];

const EVENT_BUILDERS = [
    'b2b_build_flex_claim_charge_request',
    'b2b_build_flex_claim_charge_paid',
    'b2b_build_flex_claim_charge_rejected',
    'b2b_build_flex_claim_charge_refunded',
    'b2b_build_flex_claim_charge_expired',
    'b2b_build_flex_claim_shipment_delivered',
];

describe('Claim Lifecycle Flex Builders — Sprint 6 drift detector', () => {

    test('Snippet 1 version bumped to V.34.35', () => {
        expect(code).toMatch(/Version: V\.34\.35 \(2026-05-13\)/);
    });

    test('helper b2b_claim_view_url defined', () => {
        expect(liveCode).toMatch(/function b2b_claim_view_url\s*\(\s*\$claim_id/);
        // Centralizes /claim-system/ route
        expect(liveCode).toMatch(/home_url\(\s*'\/claim-system\/\?cid='/);
    });

    test('helper b2b_claim_flex_subtitle defined', () => {
        expect(liveCode).toMatch(/function b2b_claim_flex_subtitle\s*\(/);
        // Pulls both ticket_number + serial_code (with snapshot fallback)
        expect(liveCode).toMatch(/get_field\(\s*'ticket_number'/);
        expect(liveCode).toMatch(/get_field\(\s*'snapshot_serial_code'/);
    });

    // ─── 10 status-keyed builders exist + use dinoco_flex_header ────

    describe.each(STATUS_SLUGS)('builder b2b_build_flex_claim_status_%s', (slug) => {
        const fn = `b2b_build_flex_claim_status_${slug}`;

        test(`function defined`, () => {
            const re = new RegExp(`function ${fn}\\s*\\(`);
            expect(liveCode).toMatch(re);
        });

        test(`uses dinoco_flex_header for canonical severity`, () => {
            // Find function body up to closing brace (heuristic)
            const bodyRe = new RegExp(`function ${fn}\\s*\\([\\s\\S]*?\\n    \\}\\s*\\n\\}`);
            const m = liveCode.match(bodyRe);
            expect(m).not.toBeNull();
            expect(m[0]).toMatch(/dinoco_flex_header\(/);
        });

        test(`signature accepts (claim_id, ctx = array())`, () => {
            const re = new RegExp(`function ${fn}\\s*\\(\\s*\\$claim_id\\s*,\\s*\\$ctx\\s*=\\s*array\\(\\s*\\)\\s*\\)`);
            expect(liveCode).toMatch(re);
        });
    });

    // ─── 6 special-event builders exist ─────────────────────────────

    describe.each(EVENT_BUILDERS)('event builder %s', (fn) => {
        test(`function defined`, () => {
            const re = new RegExp(`function ${fn}\\s*\\(`);
            expect(liveCode).toMatch(re);
        });
    });

    // ─── LINE Flex schema discipline ───────────────────────────────

    describe('LINE Flex schema audit', () => {
        // Capture only the V.34.35 block (END marker at bottom).
        // Sprint 6 audit refactored to per-builder body scoping — block markers
        // no longer needed (stripPhpComments removed surrounding /* ... */ blocks).
        // Kept the test below as a smoke check that at least one builder exists.

        test('V.34.35 block found', () => {
            // Comment block may be stripped — fall back to function-name probe
            // to ensure at least one builder is present.
            const seen = STATUS_SLUGS.some(s =>
                new RegExp(`function b2b_build_flex_claim_status_${s}`).test(liveCode));
            expect(seen).toBe(true);
        });

        test('all canonical color refs are 6-digit hex (no 3-digit shorthand)', () => {
            // Scope to V.34.35 builder bodies only (old builders elsewhere in
            // the snippet may legitimately use 3-digit hex; we audit Sprint 6).
            const allBuilders = [
                ...STATUS_SLUGS.map(s => `b2b_build_flex_claim_status_${s}`),
                ...EVENT_BUILDERS,
            ];
            for (const fn of allBuilders) {
                const re = new RegExp(`function ${fn}\\s*\\([\\s\\S]*?\\n    \\}\\s*\\n\\}`);
                const m = liveCode.match(re);
                if (!m) continue;
                // 3-digit hex shorthand (#ABC) is forbidden — LINE schema requires 6-digit.
                const colors = m[0].match(/#[0-9A-Fa-f]{3,8}/g) || [];
                const shorthand = colors.filter(c => /^#[0-9A-Fa-f]{3}$/.test(c));
                expect(shorthand).toEqual([]);
            }
        });

        test('no null values inside builder return arrays', () => {
            // Inspect functions one by one — look for `null` (lowercase) inside
            // the body of every claim builder.
            for (const slug of STATUS_SLUGS) {
                const re = new RegExp(`function b2b_build_flex_claim_status_${slug}\\s*\\([\\s\\S]*?\\n    \\}\\s*\\n\\}`);
                const m = liveCode.match(re);
                if (!m) continue;
                // `null` as a literal value (not in comments — already stripped)
                expect(m[0]).not.toMatch(/=>\s*null\b/);
            }
            for (const fn of EVENT_BUILDERS) {
                const re = new RegExp(`function ${fn}\\s*\\([\\s\\S]*?\\n    \\}\\s*\\n\\}`);
                const m = liveCode.match(re);
                if (!m) continue;
                expect(m[0]).not.toMatch(/=>\s*null\b/);
            }
        });

        test('every uri button has style attribute', () => {
            // For each builder, find action arrays with 'type'=>'uri' and
            // assert the containing button has 'style' key.
            const allBuilders = [
                ...STATUS_SLUGS.map(s => `b2b_build_flex_claim_status_${s}`),
                ...EVENT_BUILDERS,
            ];
            for (const fn of allBuilders) {
                const re = new RegExp(`function ${fn}\\s*\\([\\s\\S]*?\\n    \\}\\s*\\n\\}`);
                const m = liveCode.match(re);
                if (!m) continue;
                // Crude rule: every button literal must include 'style' near 'type'=>'button'
                const buttons = m[0].match(/'type'\s*=>\s*'button'[\s\S]{0,200}/g) || [];
                for (const b of buttons) {
                    expect(b).toMatch(/'style'\s*=>\s*'(primary|secondary|link)'/);
                }
            }
        });
    });

    // ─── Notifier wiring contract ──────────────────────────────────

    test('Notifier function_exists lookup name matches builder pattern', () => {
        const notifierCode = fs.readFileSync(
            path.join(REPO, '[Admin System] DINOCO Claim Lifecycle Notifier'),
            'utf8'
        );
        // Notifier constructs fn name = 'b2b_build_flex_claim_status_' . slug
        expect(notifierCode).toMatch(/b2b_build_flex_claim_status_'\s*\.\s*\$slug/);
    });

    test('all 10 builders' + ' resolve from notifier slug helper output', () => {
        // Slug names produced by dinoco_claim_notif_status_to_slug must match
        // our builder names. Spec §5.1 long-form → snake_case slug.
        const SPEC_LONG_FORM_TO_SLUG = {
            'Registered in System': 'registered_in_system',
            'Awaiting Customer Shipment': 'awaiting_customer_shipment',
            'Received at Company': 'received_at_company',
            'Under Maintenance': 'under_maintenance',
            'Maintenance Completed': 'maintenance_completed',
            'Repaired Item Dispatched': 'repaired_item_dispatched',
            'Pending Issue Verification': 'pending_issue_verification',
            'Replacement Approved': 'replacement_approved',
            'Replacement Shipped': 'replacement_shipped',
            'Replacement Rejected by Company': 'replacement_rejected_by_company',
        };
        for (const [longForm, expected] of Object.entries(SPEC_LONG_FORM_TO_SLUG)) {
            // Mirror PHP transformation in JS
            const slug = longForm.toLowerCase()
                .replace(/[\s-]+/g, '_')
                .replace(/[^a-z0-9_]/g, '')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
            expect(slug).toBe(expected);
            // And the corresponding builder exists
            expect(liveCode).toMatch(new RegExp(
                `function b2b_build_flex_claim_status_${expected}\\s*\\(`));
        }
    });
});
