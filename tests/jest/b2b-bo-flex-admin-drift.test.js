/**
 * B2B BO Admin Flex Drift Detector — 2026-05-11
 *
 * Boss reported Order #6308: customer ได้ "รอตรวจ 2-4 ชม." แต่ admin group ไม่มี Flex
 * stock_review card. Root cause = Snippet 1 b2b_get_status_labels() ขาด BO V.1.6
 * statuses (pending_stock_review + partial_fulfilled) → b2b_set_order_status fallback
 * path reject → status ค้างที่ draft.
 *
 * This drift detector pins:
 *   1. Snippet 1 status labels list contains BO V.1.6 statuses
 *   2. Snippet 1 status colors map contains BO V.1.6 statuses
 *   3. Snippet 1 b2b_set_order_status signature accepts $actor 3rd param
 *   4. Snippet 1 b2b_push_raw_to_admin logs diagnostic when constant missing
 *   5. Snippet 16 b2b_bo_notify_admin_stock_review uses b2b_push_guaranteed (retry queue)
 *   6. FSM (Snippet 14) registers BO V.1.6 transitions
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILES = {
    s1:  '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
    s14: '[B2B] Snippet 14: Order State Machine',
    s16: '[B2B] Snippet 16: Backorder System',
};
const read = (k) => fs.readFileSync(path.join(REPO_ROOT, FILES[k]), 'utf8');

describe('B2B BO admin Flex drift detector (2026-05-11 Order #6308 regression)', () => {

    test('Snippet 1 b2b_get_status_labels() contains BO V.1.6 statuses', () => {
        const code = read('s1');
        const match = code.match(/function b2b_get_status_labels\(\)\s*\{[\s\S]*?return\s*array\(([\s\S]*?)\);\s*\}/);
        expect(match).not.toBeNull();
        const labels = match[1];
        expect(labels).toMatch(/'pending_stock_review'\s*=>/);
        expect(labels).toMatch(/'partial_fulfilled'\s*=>/);
    });

    test('Snippet 1 b2b_get_status_colors() contains BO V.1.6 statuses', () => {
        const code = read('s1');
        const match = code.match(/function b2b_get_status_colors\(\)\s*\{[\s\S]*?return\s*array\(([\s\S]*?)\);\s*\}/);
        expect(match).not.toBeNull();
        const colors = match[1];
        expect(colors).toMatch(/'pending_stock_review'\s*=>/);
        expect(colors).toMatch(/'partial_fulfilled'\s*=>/);
    });

    test('Snippet 1 b2b_set_order_status accepts $actor 3rd parameter', () => {
        const code = read('s1');
        expect(code).toMatch(/function b2b_set_order_status\(\s*\$ticket_id\s*,\s*\$new_status\s*,\s*\$actor\s*=\s*['"]system['"]\s*\)/);
    });

    test('Snippet 1 b2b_set_order_status forwards $actor to FSM (not hardcoded system)', () => {
        const code = read('s1');
        // FSM call must use $actor variable, not literal 'system'
        const fsmCall = code.match(/B2B_Order_FSM::transition\(\s*\$ticket_id\s*,\s*\$new_status\s*,\s*([^)]+)\)/);
        expect(fsmCall).not.toBeNull();
        expect(fsmCall[1].trim()).toBe('$actor');
    });

    test('Snippet 1 b2b_push_raw_to_admin logs when B2B_ADMIN_GROUP_ID undefined', () => {
        const code = read('s1');
        const match = code.match(/function b2b_push_raw_to_admin\([^)]*\)\s*\{([\s\S]*?)\n\s{0,4}\}/);
        expect(match).not.toBeNull();
        // Must log diagnostic when constant undefined (not silent skip)
        expect(match[1]).toMatch(/AdminPushRaw.*SKIPPED.*B2B_ADMIN_GROUP_ID undefined/);
    });

    test('Snippet 16 b2b_bo_notify_admin_stock_review uses b2b_push_guaranteed for retry queue', () => {
        const code = read('s16');
        // Match entire function body (allow nested } from arrays)
        const match = code.match(/function b2b_bo_notify_admin_stock_review\([^)]*\)\s*\{([\s\S]*?)\n\s{0,4}\}\s*\n\s*\}\s*\n/);
        expect(match).not.toBeNull();
        expect(match[1]).toMatch(/b2b_push_guaranteed/);
        expect(match[1]).toMatch(/bo_stock_review/); // flex_type tag for cron retry filter
    });

    test('Snippet 16 BO notify has empty-Flex guard (prevents push of falsy payload)', () => {
        const code = read('s16');
        // Empty-Flex guard exists somewhere in function body
        const match = code.match(/function b2b_bo_notify_admin_stock_review\([^)]*\)\s*\{([\s\S]*?)b2b_push_guaranteed/);
        expect(match).not.toBeNull();
        expect(match[1]).toMatch(/!\s*\$flex\s*\|\|\s*!\s*is_array\(\s*\$flex\s*\)/);
    });

    test('Snippet 16 V.3.14 — text fallback push (belt-and-suspenders for silent Flex failure)', () => {
        const code = read('s16');
        const match = code.match(/function b2b_bo_notify_admin_stock_review\([^)]*\)\s*\{([\s\S]*?)b2b_push_guaranteed/);
        expect(match).not.toBeNull();
        // Text fallback fires BEFORE Flex push attempt
        expect(match[1]).toMatch(/b2b_push_to_admin\(\s*\$text_msg\s*\)/);
        expect(match[1]).toMatch(/🔔 รอตรวจสต็อก/);
        expect(match[1]).toMatch(/Backorders/);
        expect(match[1]).toMatch(/\[BO-Notify-Text\]/);
    });

    test('Snippet 14 FSM transition table has draft→pending_stock_review with customer actor', () => {
        const code = read('s14');
        // Match the `draft` state block + check pending_stock_review => 'customer'
        const draftBlock = code.match(/['"]draft['"]\s*=>\s*array\(([\s\S]*?)\),\s*\n\s*['"]/);
        expect(draftBlock).not.toBeNull();
        expect(draftBlock[1]).toMatch(/['"]pending_stock_review['"]\s*=>\s*['"]customer['"]/);
    });

    test('Snippet 14 FSM has pending_stock_review state with admin transitions', () => {
        const code = read('s14');
        const psrBlock = code.match(/['"]pending_stock_review['"]\s*=>\s*array\(([\s\S]*?)\),\s*\n\s*['"]/);
        expect(psrBlock).not.toBeNull();
        expect(psrBlock[1]).toMatch(/['"]awaiting_confirm['"]\s*=>\s*['"]admin['"]/);
        expect(psrBlock[1]).toMatch(/['"]partial_fulfilled['"]\s*=>\s*['"]admin['"]/);
    });
});
