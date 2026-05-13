/**
 * B2B BO all_backorder Drift Detector — 2026-05-12 V.4.0
 *
 * บอส principle (#6313): "ลูกค้ายืนยันรอของ ยังไม่ต้องวางบิล > เค้าต้องกดดู Liff Order
 * เห็น BO ชัดเจน ยกเลิกออเดอร์ BO ได้ถ้าสินค้ายังไม่มา"
 *
 * Root cause: admin split qty_fulfill=0/qty_bo=1 → state=partial_fulfilled + Flex
 * "ยืนยันบิล" → customer กดได้ → debt+INV ทันที (45 วันก่อนของมา).
 *
 * Fix: NEW FSM state `all_backorder` + 5 transitions + Flex builder + postback +
 * bo-fulfill auto-promote + Snippet 2 confirm_bill guards + LIFF Order page.
 *
 * This drift detector pins:
 *   1. Snippet 14 FSM registers `all_backorder` state + 5 transitions
 *   2. Snippet 1 labels/colors maps contain `all_backorder`
 *   3. Snippet 2 V.34.34 confirm_bill guards reject all_backorder + partial w/ qty=0
 *   4. Snippet 16 bo-split detects $is_all_backorder + branches state
 *   5. Snippet 16 b2b_build_flex_all_backorder_customer Flex builder exists
 *   6. Snippet 16 b2b_bo_notify_customer_all_backorder push helper exists
 *   7. Snippet 16 postback handler `bo_cancel_all_customer` registered
 *   8. Snippet 16 bo-fulfill auto-promote prev_status === 'all_backorder' branch
 *   9. Snippet 11 V.30.6 LIFF Order page status maps include all_backorder
 *  10. Snippet 16 [b2b_bo_customer_order_detail] all_backorder branch
 *  11. Snippet 16 bo_relevant filter list includes all_backorder
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILES = {
    s1:  '[B2B] Snippet 1: Core Utilities & LINE Flex Builders',
    s2:  '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator',
    s11: '[B2B] Snippet 11: Customer LIFF Pages',
    s14: '[B2B] Snippet 14: Order State Machine',
    s16: '[B2B] Snippet 16: Backorder System',
};
const read = (k) => fs.readFileSync(path.join(REPO_ROOT, FILES[k]), 'utf8');

function stripComments(src) {
    return src.split('\n').filter((l) => {
        const t = l.trim();
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/')) return false;
        if (t.startsWith('//')) return false;
        return true;
    }).map((l) => {
        // strip inline // comments + /* ... */ inline
        return l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    }).join('\n');
}

// Extract the value of a PHP array key `'<key>' => array(...)` handling balanced parens
function extractArrayBlock(code, key) {
    const startRegex = new RegExp(`'${key}'\\s*=>\\s*array\\s*\\(`, 'g');
    const m = startRegex.exec(code);
    if (!m) return null;
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
    }
    return code.slice(start, i - 1);
}

describe('B2B BO all_backorder drift detector (V.4.0 — Order #6313 redesign)', () => {

    // === Snippet 14: FSM state machine ===

    describe('Snippet 14 FSM all_backorder state', () => {
        test('all_backorder state exists in transitions map', () => {
            const code = stripComments(read('s14'));
            expect(code).toMatch(/'all_backorder'\s*=>\s*array\s*\(/);
        });

        test('pending_stock_review → all_backorder transition (admin)', () => {
            const code = stripComments(read('s14'));
            const block = extractArrayBlock(code, 'pending_stock_review');
            expect(block).not.toBeNull();
            expect(block).toMatch(/'all_backorder'\s*=>\s*'admin'/);
        });

        test('all_backorder → awaiting_confirm transition exists', () => {
            const code = stripComments(read('s14'));
            const block = extractArrayBlock(code, 'all_backorder');
            expect(block).not.toBeNull();
            expect(block).toMatch(/'awaiting_confirm'\s*=>/);
        });

        test('all_backorder → partial_fulfilled transition exists', () => {
            const code = stripComments(read('s14'));
            const block = extractArrayBlock(code, 'all_backorder');
            expect(block).toMatch(/'partial_fulfilled'\s*=>/);
        });

        test('all_backorder → cancelled + cancel_requested transitions exist', () => {
            const code = stripComments(read('s14'));
            const block = extractArrayBlock(code, 'all_backorder');
            expect(block).toMatch(/'cancelled'\s*=>/);
            expect(block).toMatch(/'cancel_requested'\s*=>\s*'customer'/);
        });

        test('all_backorder → pending_stock_review escape hatch (undo-split)', () => {
            const code = stripComments(read('s14'));
            const block = extractArrayBlock(code, 'all_backorder');
            expect(block).toMatch(/'pending_stock_review'\s*=>\s*'admin'/);
        });
    });

    // === Snippet 1: labels + colors ===

    describe('Snippet 1 status labels/colors include all_backorder', () => {
        test('b2b_get_status_labels() contains all_backorder', () => {
            const code = read('s1');
            const match = code.match(/function b2b_get_status_labels\(\)\s*\{[\s\S]*?return\s*array\(([\s\S]*?)\);\s*\}/);
            expect(match).not.toBeNull();
            expect(match[1]).toMatch(/'all_backorder'\s*=>/);
        });

        test('b2b_get_status_colors() contains all_backorder', () => {
            const code = read('s1');
            const match = code.match(/function b2b_get_status_colors\(\)\s*\{[\s\S]*?return\s*array\(([\s\S]*?)\);\s*\}/);
            expect(match).not.toBeNull();
            expect(match[1]).toMatch(/'all_backorder'\s*=>/);
        });
    });

    // === Snippet 2: confirm_bill guards ===

    describe('Snippet 2 confirm_bill guards (V.34.34)', () => {
        test('rejects all_backorder status in confirm_bill', () => {
            const code = stripComments(read('s2'));
            expect(code).toMatch(/\$status\s*===\s*'all_backorder'/);
            expect(code).toMatch(/รอสินค้า BO/);
        });

        test('rejects partial_fulfilled with fulfilled_qty=0', () => {
            const code = stripComments(read('s2'));
            expect(code).toMatch(/\$status\s*===\s*'partial_fulfilled'/);
            expect(code).toMatch(/b2b_compute_bo_summary/);
        });
    });

    // === Snippet 16: bo-split state branching ===

    describe('Snippet 16 V.4.0 bo-split all_backorder branching', () => {
        test('$is_all_backorder detection logic', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/\$is_all_backorder\s*=\s*\(\s*\$fulfilled_total\s*===\s*0\s*&&\s*\$bo_total\s*>\s*0\s*\)/);
        });

        test('$target_state branches between all_backorder + partial_fulfilled', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/\$target_state\s*=\s*\$is_all_backorder\s*\?\s*'all_backorder'\s*:\s*'partial_fulfilled'/);
        });

        test('_b2b_all_backorder postmeta marker stamped', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/update_post_meta\(\s*\$order_id,\s*'_b2b_all_backorder'/);
        });
    });

    // === Snippet 16: Flex builder + notify ===

    describe('Snippet 16 Flex builders + notify helpers', () => {
        test('b2b_build_flex_all_backorder_customer function defined', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/function\s+b2b_build_flex_all_backorder_customer\s*\(/);
        });

        test('b2b_bo_notify_customer_all_backorder push helper defined', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/function\s+b2b_bo_notify_customer_all_backorder\s*\(/);
        });

        test('all_backorder customer Flex lacks bill button — has cancel button', () => {
            const code = stripComments(read('s16'));
            const fnMatch = code.match(/function\s+b2b_build_flex_all_backorder_customer\s*\([\s\S]*?(?=^\}|^function)/m);
            expect(fnMatch).not.toBeNull();
            // Must NOT have ยืนยันบิล button
            // Must HAVE ยกเลิก BO button
            expect(fnMatch[0]).toMatch(/ยกเลิก BO|ยกเลิกออเดอร์/);
        });
    });

    // === Snippet 16: postback handler ===

    describe('Snippet 16 postback handler bo_cancel_all_customer', () => {
        test('bo_cancel_all_customer action handled', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/['"]bo_cancel_all_customer['"]/);
        });
    });

    // === Snippet 16: bo-fulfill auto-promote ===

    describe('Snippet 16 bo-fulfill auto-promote all_backorder', () => {
        test('detects prev_status === all_backorder', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/\$was_all_bo\s*=\s*\(\s*\$prev_status\s*===\s*'all_backorder'\s*\)/);
        });

        test('clears _b2b_all_backorder marker on graduation', () => {
            const code = stripComments(read('s16'));
            // Find the bo-fulfill section that clears the marker
            const fulfillSection = code.match(/'all BO resolved.*all_backorder[\s\S]*?delete_post_meta|\$was_all_bo[\s\S]*?update_post_meta\(\s*\$order_id,\s*'_b2b_all_backorder',\s*0/);
            expect(fulfillSection).not.toBeNull();
        });
    });

    // === Snippet 11: LIFF Order page integration ===

    describe('Snippet 11 V.30.6 LIFF Order page all_backorder visibility', () => {
        test('labels fallback includes all_backorder', () => {
            const code = stripComments(read('s11'));
            expect(code).toMatch(/\$labels\[['"]all_backorder['"]\]/);
        });

        test('status_colors array includes all_backorder', () => {
            const code = stripComments(read('s11'));
            const colorsMatch = code.match(/\$status_colors\s*=\s*array\s*\(([\s\S]*?)\)/);
            expect(colorsMatch).not.toBeNull();
            expect(colorsMatch[1]).toMatch(/'all_backorder'\s*=>/);
        });

        test('status_bg array includes all_backorder', () => {
            const code = stripComments(read('s11'));
            const bgMatch = code.match(/\$status_bg\s*=\s*array\s*\(([\s\S]*?)\)/);
            expect(bgMatch).not.toBeNull();
            expect(bgMatch[1]).toMatch(/'all_backorder'\s*=>/);
        });

        test('step_map includes all_backorder (no progress)', () => {
            const code = stripComments(read('s11'));
            const stepMatch = code.match(/\$step_map\s*=\s*array\s*\(([\s\S]*?)\)/);
            expect(stepMatch).not.toBeNull();
            expect(stepMatch[1]).toMatch(/'all_backorder'\s*=>/);
        });

        test('embed shortcode trigger includes all_backorder', () => {
            const code = stripComments(read('s11'));
            expect(code).toMatch(/in_array\(\s*\$s,\s*array\s*\([^)]*'all_backorder'[^)]*\)/);
        });
    });

    // === Snippet 16: customer order detail shortcode ===

    describe('Snippet 16 [b2b_bo_customer_order_detail] all_backorder render', () => {
        test('shortcode handler accepts all_backorder status', () => {
            const code = stripComments(read('s16'));
            expect(code).toMatch(/\$status\s*!==\s*['"]partial_fulfilled['"]\s*&&\s*\$status\s*!==\s*['"]pending_stock_review['"]\s*&&\s*\$status\s*!==\s*['"]all_backorder['"]/);
        });

        test('all_backorder branch renders custom UI', () => {
            const code = stripComments(read('s16'));
            // Branch should appear with status === 'all_backorder'
            expect(code).toMatch(/\$status\s*===\s*['"]all_backorder['"]/);
            // Should mention "ยังไม่เรียกเก็บเงิน" key message
            expect(code).toMatch(/ยังไม่เรียกเก็บเงิน/);
        });
    });

    // === Snippet 16: bo_relevant filter list ===

    describe('Snippet 16 bo_relevant filter list', () => {
        test('bo_relevant array includes all_backorder', () => {
            const code = stripComments(read('s16'));
            const match = code.match(/\$bo_relevant\s*=\s*array\(([^)]+)\)/);
            expect(match).not.toBeNull();
            expect(match[1]).toMatch(/'all_backorder'/);
        });
    });
});
