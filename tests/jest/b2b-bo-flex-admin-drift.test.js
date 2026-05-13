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
        // V.34.34: refactored to use $local = array(...) + H2 registry overlay + return $local.
        // Match the $local = array(...) declaration (source of truth for legacy keys).
        const match = code.match(/function b2b_get_status_colors\(\)\s*\{[\s\S]*?\$local\s*=\s*array\(([\s\S]*?)\);[\s\S]*?return\s+\$local\s*;/);
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

    test('Snippet 16 V.3.17 — text fallback REMOVED per UX feedback (Flex only + altText handles a11y)', () => {
        const code = read('s16');
        const match = code.match(/function b2b_bo_notify_admin_stock_review\([^)]*\)\s*\{([\s\S]*?)b2b_push_guaranteed/);
        expect(match).not.toBeNull();
        // Text fallback should NOT fire (V.3.17 removed — duplicate noise per boss feedback)
        expect(match[1]).not.toMatch(/b2b_push_to_admin\(\s*\$text_msg\s*\)/);
        // But function body still has Flex push path
        expect(match[1]).toMatch(/b2b_build_flex_stock_review_admin/);
    });

    test('Snippet 16 V.3.18 — customer reject notify uses b2b_line_push_raw (not broken b2b_line_push_text)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // notify_customer_rejected must NOT reference broken b2b_line_push_text in active code
        expect(stripped).not.toMatch(/function_exists\(\s*['"]b2b_line_push_text['"]/);
        // Must use working push function
        expect(stripped).toMatch(/function b2b_bo_notify_customer_rejected/);
        expect(stripped).toMatch(/b2b_line_push_raw/);
    });

    test('Snippet 16 V.3.18 — reason picker Flex exists + reject postback goes through picker', () => {
        const code = read('s16');
        // Reason picker builder exists
        expect(code).toMatch(/function b2b_build_flex_bo_reject_reasons/);
        // 3 reject reasons (V.3.19: หมดสต็อก moved to BO flow, not reject)
        expect(code).toMatch(/สินค้ายกเลิกการขาย/);
        expect(code).toMatch(/ราคาผิดพลาด/);
        // Footer button now triggers picker (not direct reject)
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        expect(stripped).toMatch(/action=bo_reject_picker&order_id=/);
        // Postback handler dispatches bo_reject_picker
        expect(stripped).toMatch(/\$action === ['"]bo_reject_picker['"]/);
    });

    test('Snippet 16 V.3.19 — "หมดสต็อก" routes to BO flow (not reject) + ETA picker', () => {
        const code = read('s16');
        // ETA picker Flex builder exists
        expect(code).toMatch(/function b2b_build_flex_bo_eta_picker/);
        // 4 ETA quick-pick options + datetimepicker
        expect(code).toMatch(/รอ 7 วัน/);
        expect(code).toMatch(/รอ 14 วัน/);
        expect(code).toMatch(/รอ 30 วัน/);
        expect(code).toMatch(/รอ 45 วัน/);
        expect(code).toMatch(/'type'\s*=>\s*'datetimepicker'/);
        expect(code).toMatch(/'mode'\s*=>\s*'date'/);
        // Reason picker has "หมดสต็อก → BO" button (NOT reject)
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        expect(stripped).toMatch(/action=bo_to_backorder&order_id=/);
        // Postback handlers exist
        expect(stripped).toMatch(/\$action === ['"]bo_to_backorder['"]/);
        expect(stripped).toMatch(/\$action === ['"]bo_set_eta_all['"]/);
        // bo_set_eta_all/date routes to b2b_rest_bo_split (existing BO infrastructure)
        expect(stripped).toMatch(/b2b_rest_bo_split\s*\(\s*\$req\s*\)/);
    });

    test('Snippet 16 V.3.17 — button labels updated per ux-ui-expert (no "ยืนยันเต็ม" / "ปฏิเสธ")', () => {
        const code = read('s16');
        // Strip block comments (legitimately reference old labels in version header prose)
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // New labels should appear in active code
        expect(stripped).toMatch(/'label'\s*=>\s*'✅ ส่งครบทุกชิ้น'/);
        expect(stripped).toMatch(/'label'\s*=>\s*'❌ ยกเลิกออเดอร์'/);
        expect(stripped).toMatch(/'label'\s*=>\s*'🔀 แยกส่งบางส่วน'/);
        // Old confusing labels should not appear as button labels in active code
        expect(stripped).not.toMatch(/'label'\s*=>\s*'✅ ยืนยันเต็ม'/);
    });

    test('Snippet 14 FSM transition table has draft→pending_stock_review with customer actor', () => {
        const code = read('s14');
        // Match the `draft` state block + check pending_stock_review => 'customer'
        const draftBlock = code.match(/['"]draft['"]\s*=>\s*array\(([\s\S]*?)\),\s*\n\s*['"]/);
        expect(draftBlock).not.toBeNull();
        expect(draftBlock[1]).toMatch(/['"]pending_stock_review['"]\s*=>\s*['"]customer['"]/);
    });

    test('LINE Flex schema — NO null color anywhere (LINE rejects HTTP 400)', () => {
        const s16 = read('s16');
        // Strip block comments (/** ... */) and line comments (// ...) — version headers
        // legitimately document the historical bad pattern in Thai prose
        const stripped = s16
            .replace(/\/\*[\s\S]*?\*\//g, '')  // remove block comments
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        expect(stripped).not.toMatch(/'color'\s*=>\s*[^,#'\n]*\?\s*null\s*:/);
        expect(stripped).not.toMatch(/'color'\s*=>\s*null\s*,/);
    });

    test('LINE Flex schema — NO opacity on text component (LINE rejects HTTP 400)', () => {
        const s1 = read('s1');
        // Catch active 'opacity' => N.M in text component (not in comments)
        // Strip comments first
        const code = s1.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
        expect(code).not.toMatch(/'opacity'\s*=>\s*0\.\d+/);
    });

    test('Snippet 7 — Flex retry exhausted alert uses double-quoted \\n (not literal)', () => {
        const s7 = fs.readFileSync(path.join(REPO_ROOT, '[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank'), 'utf8');
        // Should NOT match single-quoted \n (which would be literal "\\n" in LINE)
        const singleQuotedBad = s7.match(/'❌ Flex ส่งไม่สำเร็จ[^']*\\n[^']*'/);
        expect(singleQuotedBad).toBeNull();
    });

    test('Snippet 2 V.34.32 — BO admin postback SEC gate ก่อน filter dispatch (BLOCKER B1)', () => {
        const s2 = fs.readFileSync(path.join(REPO_ROOT, '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator'), 'utf8');
        // Must have $bo_admin_actions array
        expect(s2).toMatch(/\$bo_admin_actions\s*=\s*array\(/);
        // 6 BO admin actions whitelisted
        expect(s2).toMatch(/'bo_confirm_full'/);
        expect(s2).toMatch(/'bo_reject_picker'/);
        expect(s2).toMatch(/'bo_to_backorder'/);
        expect(s2).toMatch(/'bo_set_eta_all'/);
        expect(s2).toMatch(/'bo_set_eta_date'/);
        // Gate uses B2B_ADMIN_GROUP_ID + silent drop (return) for non-admin
        expect(s2).toMatch(/B2B_ADMIN_GROUP_ID/);
        expect(s2).toMatch(/\[BO-SEC\]\s*Blocked/);
        // Gate must appear BEFORE apply_filters('b2b_webhook_postback_action')
        const gateIdx = s2.search(/\$bo_admin_actions\s*=\s*array/);
        const filterIdx = s2.search(/apply_filters\(\s*'b2b_webhook_postback_action'/);
        expect(gateIdx).toBeGreaterThan(-1);
        expect(filterIdx).toBeGreaterThan(-1);
        expect(gateIdx).toBeLessThan(filterIdx);
    });

    test('Snippet 16 V.3.20 — empty Flex fallback text alert (H1 observability)', () => {
        const code = read('s16');
        const match = code.match(/function b2b_bo_notify_admin_stock_review\([^)]*\)\s*\{([\s\S]*?)b2b_push_guaranteed/);
        expect(match).not.toBeNull();
        // Empty Flex branch must push fallback text to admin (not silent return)
        expect(match[1]).toMatch(/empty Flex.*fallback text/);
        expect(match[1]).toMatch(/b2b_push_to_admin\(/);
        expect(match[1]).toMatch(/Backorders tab/);
    });

    test('Snippet 16 V.3.20 — bo_to_backorder + bo_reject_picker ใช้ reply_raw (H2 quota save)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // Count occurrences of b2b_line_reply_raw — should be ≥ 2 (bo_to_backorder + bo_reject_picker)
        const replyRawCount = (stripped.match(/b2b_line_reply_raw\(\s*\$reply_token/g) || []).length;
        expect(replyRawCount).toBeGreaterThanOrEqual(2);
        // Both action blocks must contain reply_raw — verify within respective if-action blocks
        // by extracting larger chunks (until next "if ( \$action" or end-of-function)
        const backorder = stripped.match(/\$action === ['"]bo_to_backorder['"][\s\S]{0,1500}?b2b_line_reply_raw/);
        expect(backorder).not.toBeNull();
        const picker = stripped.match(/\$action === ['"]bo_reject_picker['"][\s\S]{0,1500}?b2b_line_reply_raw/);
        expect(picker).not.toBeNull();
    });

    test('Snippet 16 V.3.20 — synthetic X-Idempotency-Key on internal bo-split call (H3)', () => {
        const code = read('s16');
        // Must inject idempotency header before calling b2b_rest_bo_split
        expect(code).toMatch(/X-Idempotency-Key[\s\S]{0,200}bo-eta-\{?\$?order_id/);
    });

    test('Snippet 16 V.3.20 — past-date guard ใน bo_set_eta_date (M3)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // Must reject past dates explicitly (not clamp to 1)
        expect(stripped).toMatch(/\$ts_eta\s*<\s*\$ts_today/);
        expect(stripped).toMatch(/past-date rejected/);
    });

    test('Snippet 16 V.3.21 — bo_confirm_full pushes customer stock_confirmed Flex (CRITICAL fix #6311)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // _b2b_rest_bo_confirm_full_inner must call b2b_build_flex_stock_confirmed for customer
        const innerFn = stripped.match(/function _b2b_rest_bo_confirm_full_inner[\s\S]{0,3000}?return rest_ensure_response/);
        expect(innerFn).not.toBeNull();
        expect(innerFn[0]).toMatch(/b2b_build_flex_stock_confirmed/);
        expect(innerFn[0]).toMatch(/b2b_bo_resolve_customer_group_id/);
    });

    test('Snippet 2 V.34.33 — b2b_action_confirm_bill accepts partial_fulfilled (BLOCKER B1)', () => {
        const s2 = fs.readFileSync(path.join(REPO_ROOT, '[B2B] Snippet 2: LINE Webhook Gateway & Order Creator'), 'utf8');
        const stripped = s2
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // Must check both awaiting_confirm + partial_fulfilled
        expect(stripped).toMatch(/in_array\(\s*\$status\s*,\s*array\(\s*'awaiting_confirm'\s*,\s*'partial_fulfilled'/);
        // status_th array has new BO labels
        expect(stripped).toMatch(/'pending_stock_review'\s*=>\s*'แอดมินกำลังตรวจสต็อก'/);
        expect(stripped).toMatch(/'partial_fulfilled'\s*=>\s*'จัดส่งบางส่วน/);
    });

    test('Snippet 16 V.3.22 — bo_cancel_item all_resolved pushes stock_confirmed (BLOCKER B2)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // bo_cancel_item all-resolved branch must have stock_confirmed_after_cancel push
        expect(stripped).toMatch(/stock_confirmed_after_cancel/);
    });

    test('Snippet 16 V.3.22 — bo_undo_split notifies customer (HIGH H1)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // undo_split block must push text to customer about revert
        const undoFn = stripped.match(/'undo_split'[\s\S]{0,2000}?return rest_ensure_response[^)]*pending_stock_review/);
        expect(undoFn).not.toBeNull();
        expect(undoFn[0]).toMatch(/กลับไปรอแอดมินตรวจสอบสต็อก/);
    });

    test('Snippet 16 V.3.22 — bo_to_backorder status guard (HIGH H2)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // bo_to_backorder must check status — search broader chunk after action match
        const handler = stripped.match(/\$action === 'bo_to_backorder'[\s\S]{0,2500}/);
        expect(handler).not.toBeNull();
        expect(handler[0]).toMatch(/\$current_status\s*!==\s*'pending_stock_review'/);
    });

    test('Snippet 16 V.3.23 — bo-split + bo-fulfill set is_billed=true (double-debt regression guard)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // bo-split: after debt_add success → set is_billed=true + due_date
        const splitDebt = stripped.match(/b2b_debt_add\(\s*\$dist_id\s*,\s*\$confirmed_value[\s\S]{0,800}/);
        expect(splitDebt).not.toBeNull();
        expect(splitDebt[0]).toMatch(/update_field\(\s*'is_billed'\s*,\s*true/);
        expect(splitDebt[0]).toMatch(/update_field\(\s*'due_date'/);

        // bo-fulfill: after debt_add success → set is_billed=true (idempotent guard)
        const fulfillDebt = stripped.match(/b2b_debt_add\(\s*\$dist_id\s*,\s*\$line_value[\s\S]{0,1200}/);
        expect(fulfillDebt).not.toBeNull();
        expect(fulfillDebt[0]).toMatch(/update_field\(\s*'is_billed'\s*,\s*true/);
    });

    test('Snippet 16 V.3.24 — stock_review admin Flex มีรูปสินค้า + qty xxl + ไม่มี discount breakdown', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // Function builder
        const builder = stripped.match(/function b2b_build_flex_stock_review_admin\([\s\S]*?\n\s{0,4}\}\s*\n\s*\}/);
        expect(builder).not.toBeNull();
        // (a) รูปสินค้า: image type + aspectMode cover + aspectRatio 1:1
        expect(builder[0]).toMatch(/'type'\s*=>\s*'image'/);
        expect(builder[0]).toMatch(/'aspectMode'\s*=>\s*'cover'/);
        expect(builder[0]).toMatch(/'aspectRatio'\s*=>\s*'1:1'/);
        // (b) Image source: b2b_get_product_data ['image_url'] + https guard
        expect(builder[0]).toMatch(/\$pd\['image_url'\]/);
        expect(builder[0]).toMatch(/strpos\(\s*\(string\)\s*\$pd\['image_url'\][^)]*https:/);
        // (c) จำนวน xxl bold — "× N"
        expect(builder[0]).toMatch(/['"]× \{\$qty\}['"]/);
        expect(builder[0]).toMatch(/'size'\s*=>\s*'xxl'/);
        // (d) Bubble size mega
        expect(builder[0]).toMatch(/'size'\s*=>\s*'mega'/);
        // (e) ไม่มี % discount หรือ breakdown — ไม่ควรมี "ราคาจำหน่าย", "ส่วนลดตัวแทน"
        expect(builder[0]).not.toMatch(/ราคาจำหน่าย/);
        expect(builder[0]).not.toMatch(/ส่วนลดตัวแทน/);
        // (f) ยอดรวมยังมี
        expect(builder[0]).toMatch(/ยอดรวม/);
    });

    test('Snippet 16 V.3.25 — Full Redesign: ห้ามใช้ get_the_title() ใน Flex builders', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        // Flex builder functions (7) — แต่ละตัวห้ามเรียก get_the_title($order_id) ใน body
        const builderNames = [
            'b2b_build_flex_partial_fulfill_customer',
            'b2b_build_flex_bo_ready_customer',
            'b2b_build_flex_bo_cancelled_customer',
            'b2b_build_flex_bo_reject_reasons',
            'b2b_build_flex_bo_eta_picker',
            'b2b_build_flex_stock_review_admin',
        ];
        builderNames.forEach((fnName) => {
            const re = new RegExp(`function ${fnName}\\([\\s\\S]{0,3000}?get_the_title\\(\\s*\\$order_id`);
            expect(stripped).not.toMatch(re);
        });
    });

    test('Snippet 16 V.3.25 — partial_fulfill conditional render (ซ่อน section 0 + ปุ่มยืนยันบิล)', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        const fn = stripped.match(/function b2b_build_flex_partial_fulfill_customer[\s\S]*?\n\s{0,4}\}\s*\n\s*\}/);
        expect(fn).not.toBeNull();
        // has_fulfill + has_bo conditional vars
        expect(fn[0]).toMatch(/\$has_fulfill/);
        expect(fn[0]).toMatch(/\$has_bo/);
        // Footer button "ยืนยันบิล" must be inside has_fulfill check
        expect(fn[0]).toMatch(/if\s*\(\s*\$has_fulfill\s*\)\s*\{[\s\S]{0,500}?ยืนยันบิล/);
    });

    test('Snippet 16 V.3.25 — bo_ready + bo_cancelled มีรูปสินค้า 80×80 cover', () => {
        const code = read('s16');
        const stripped = code
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');
        ['b2b_build_flex_bo_ready_customer', 'b2b_build_flex_bo_cancelled_customer'].forEach((fnName) => {
            const re = new RegExp(`function ${fnName}[\\s\\S]{0,5000}?'type'\\s*=>\\s*'image'`);
            expect(stripped).toMatch(re);
        });
    });

    test('Snippet 16 V.3.25 — bo_cancelled มี reason label map Thai', () => {
        const code = read('s16');
        expect(code).toMatch(/'oos_long'\s*=>\s*'สินค้าหมด/);
        expect(code).toMatch(/'discontinued'\s*=>\s*'สินค้าเลิกผลิต'/);
        expect(code).toMatch(/'price_change'\s*=>\s*'ราคาเปลี่ยน'/);
    });

    test('Snippet 14 FSM has pending_stock_review state with admin transitions', () => {
        const code = read('s14');
        const psrBlock = code.match(/['"]pending_stock_review['"]\s*=>\s*array\(([\s\S]*?)\),\s*\n\s*['"]/);
        expect(psrBlock).not.toBeNull();
        expect(psrBlock[1]).toMatch(/['"]awaiting_confirm['"]\s*=>\s*['"]admin['"]/);
        expect(psrBlock[1]).toMatch(/['"]partial_fulfilled['"]\s*=>\s*['"]admin['"]/);
    });
});
