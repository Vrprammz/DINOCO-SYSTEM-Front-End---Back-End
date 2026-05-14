/**
 * Drift detector — OP-3 Bulk Admin Actions Wizard expansion (Phase 6 P4, 2026-05-14)
 *
 * Pins V.0.48 expansion of plan §K.4:
 *   - POST /bulk/relink — in_pool/reserved only, max 100, target SKU validation
 *   - POST /bulk/notify — max 500 (LINE quota), preference gate, defensive
 *   - POST /bulk/transfer — in_pool/reserved only, max 100, batch validation
 *
 * Each endpoint mirrors V.0.45 /bulk/void pattern: per-SN atomic txn +
 * skip-conflicts results array + idempotency wrapper + rate limit + audit log.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const REST = path.join(REPO, '[System] DINOCO SN REST API');

describe('OP-3 Bulk Wizard expansion V.0.48 — drift detector', () => {
    const rest = fs.readFileSync(REST, 'utf8');

    describe('Version header', () => {
        test('V.0.48 documented in changelog block', () => {
            expect(rest).toMatch(/Version:\s*V\.0\.48[\s\S]{0,500}OP-3 expansion/);
        });
        test('Mentions 3 new endpoints in header', () => {
            const v048 = rest.match(/Version:\s*V\.0\.48[\s\S]{0,500}/)[0];
            expect(v048).toMatch(/bulk\/relink/);
            expect(v048).toMatch(/bulk\/notify/);
            expect(v048).toMatch(/bulk\/transfer/);
        });
    });

    describe('Route registration', () => {
        test('POST /bulk/relink registered with admin permission', () => {
            expect(rest).toMatch(/register_rest_route\([^)]*DINOCO_SN_REST_NAMESPACE,\s*'\/bulk\/relink'[\s\S]{0,500}'methods'\s*=>\s*'POST'[\s\S]{0,300}'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
        });
        test('POST /bulk/notify registered with admin permission', () => {
            expect(rest).toMatch(/register_rest_route\([^)]*DINOCO_SN_REST_NAMESPACE,\s*'\/bulk\/notify'[\s\S]{0,800}'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
        });
        test('POST /bulk/transfer registered with admin permission', () => {
            expect(rest).toMatch(/register_rest_route\([^)]*DINOCO_SN_REST_NAMESPACE,\s*'\/bulk\/transfer'[\s\S]{0,500}'permission_callback'\s*=>\s*'dinoco_sn_perm_admin'/);
        });
        test('bulk/notify takes message + cta_label + cta_url + reason args', () => {
            const block = rest.match(/'\/bulk\/notify'[\s\S]{0,1200}/)[0];
            expect(block).toMatch(/'message'/);
            expect(block).toMatch(/'cta_label'/);
            expect(block).toMatch(/'cta_url'/);
            expect(block).toMatch(/'reason'/);
        });
    });

    describe('Handler 1: /bulk/relink', () => {
        const fn = rest.match(/function\s+dinoco_sn_rest_bulk_relink[\s\S]{0,8000}/)[0];

        test('Validates new_sku format /^[A-Z0-9_-]{2,50}$/', () => {
            expect(fn).toMatch(/preg_match\(\s*'\/\^\[A-Z0-9_-\]\{2,50\}\$\/'/);
        });
        test('Caps at 100 plates', () => {
            expect(fn).toMatch(/count\(\s*\$sns\s*\)\s*>\s*100[\s\S]{0,300}bulk_too_large/);
        });
        test('Requires reason ≥10 chars', () => {
            expect(fn).toMatch(/strlen\(\s*\$reason\s*\)\s*<\s*10/);
        });
        test('Verifies target SKU exists in wp_dinoco_products', () => {
            expect(fn).toMatch(/COUNT\(\*\)\s+FROM\s+\{\$products_tbl\}\s+WHERE\s+BINARY\s+UPPER\(sku\)/);
            expect(fn).toMatch(/'sku_not_found'/);
        });
        test('Status guard: in_pool/reserved only', () => {
            expect(fn).toMatch(/in_array\(\s*\$row->status,\s*array\(\s*'in_pool',\s*'reserved'\s*\)/);
        });
        test('GET_LOCK + START TRANSACTION + FOR UPDATE', () => {
            expect(fn).toMatch(/SELECT GET_LOCK/);
            expect(fn).toMatch(/START TRANSACTION/);
            expect(fn).toMatch(/FOR UPDATE/);
        });
        test('Rate limit 5/10min per user', () => {
            expect(fn).toMatch(/b2b_rate_limit\(\s*'sn_bulk_relink_'\s*\.\s*\$uid,\s*5,\s*600\s*\)/);
        });
        test('Idempotency wrapper with sorted SNs', () => {
            expect(fn).toMatch(/dinoco-sn\/v1::bulk\/relink/);
            expect(fn).toMatch(/sort\(\s*\$sns_sorted\s*\)/);
        });
        test('Audit log fires plate_relinked event', () => {
            expect(fn).toMatch(/'plate_relinked'/);
            expect(fn).toMatch(/'bulk'\s*=>\s*true/);
        });
        test('Throwable catch with obs capture', () => {
            expect(fn).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)[\s\S]{0,300}sn_bulk_relink_throw/);
        });
    });

    describe('Handler 2: /bulk/notify', () => {
        const fn = rest.match(/function\s+dinoco_sn_rest_bulk_notify[\s\S]{0,8000}/)[0];

        test('Message length validation 5..500', () => {
            expect(fn).toMatch(/strlen\(\s*\$message\s*\)\s*<\s*5/);
            expect(fn).toMatch(/strlen\(\s*\$message\s*\)\s*>\s*500/);
        });
        test('Resolves targets from sns array OR status+batch filter', () => {
            expect(fn).toMatch(/is_array\(\s*\$sns_in\s*\)\s*&&\s*!\s*empty/);
            expect(fn).toMatch(/registered_user_id IS NOT NULL/);
            expect(fn).toMatch(/LIMIT 500/);
        });
        test('Caps recipients at 500 (LINE quota)', () => {
            expect(fn).toMatch(/array_slice\(\s*\$sns,\s*0,\s*500\s*\)/);
        });
        test('Preference gate via dinoco_sn_should_send_to_user', () => {
            expect(fn).toMatch(/dinoco_sn_should_send_to_user\(\s*\$owner_uid,\s*'admin_announcement'\s*\)/);
        });
        test('Defensive function_exists guard on b2b_send_text_message', () => {
            expect(fn).toMatch(/function_exists\(\s*'b2b_send_text_message'\s*\)/);
        });
        test('Rate limit 3/10min (tighter than other bulk — LINE quota)', () => {
            expect(fn).toMatch(/b2b_rate_limit\(\s*'sn_bulk_notify_'\s*\.\s*\$uid,\s*3,\s*600\s*\)/);
        });
        test('Skips when no LINE UID or opted out', () => {
            expect(fn).toMatch(/'no_line_uid'/);
            expect(fn).toMatch(/'opted_out'/);
        });
        test('Audit log fires bulk_notify_sent event with preview', () => {
            expect(fn).toMatch(/'bulk_notify_sent'/);
            expect(fn).toMatch(/'message_preview'\s*=>\s*mb_substr/);
        });
        test('Throwable catch with obs capture', () => {
            expect(fn).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)[\s\S]{0,300}sn_bulk_notify_push_throw/);
        });
    });

    describe('Handler 3: /bulk/transfer', () => {
        const fn = rest.match(/function\s+dinoco_sn_rest_bulk_transfer[\s\S]{0,8000}/)[0];

        test('Caps at 100 plates', () => {
            expect(fn).toMatch(/count\(\s*\$sns\s*\)\s*>\s*100[\s\S]{0,300}bulk_too_large/);
        });
        test('Validates target batch exists', () => {
            expect(fn).toMatch(/SELECT id, batch_code, status FROM \{\$batches_tbl\}[\s\S]{0,200}batch_not_found/);
        });
        test('Rejects closed/cancelled target batch', () => {
            expect(fn).toMatch(/in_array\(\s*\$tgt_batch->status,\s*array\(\s*'closed',\s*'cancelled'\s*\)/);
            expect(fn).toMatch(/'batch_locked'/);
        });
        test('Status guard: in_pool/reserved only', () => {
            expect(fn).toMatch(/in_array\(\s*\$row->status,\s*array\(\s*'in_pool',\s*'reserved'\s*\)/);
        });
        test('Skips same-batch transfer (no-op)', () => {
            expect(fn).toMatch(/'same_batch'/);
        });
        test('GET_LOCK + START TRANSACTION + FOR UPDATE per plate', () => {
            expect(fn).toMatch(/SELECT GET_LOCK/);
            expect(fn).toMatch(/START TRANSACTION/);
            expect(fn).toMatch(/FOR UPDATE/);
        });
        test('Rate limit 5/10min per user', () => {
            expect(fn).toMatch(/b2b_rate_limit\(\s*'sn_bulk_transfer_'\s*\.\s*\$uid,\s*5,\s*600\s*\)/);
        });
        test('Idempotency wrapper with sorted SNs + target_batch_id', () => {
            expect(fn).toMatch(/dinoco-sn\/v1::bulk\/transfer/);
            expect(fn).toMatch(/'target_batch_id'\s*=>\s*\$target_batch_id/);
        });
        test('Audit log fires plate_transferred event with from/to batch', () => {
            expect(fn).toMatch(/'plate_transferred'/);
            expect(fn).toMatch(/'from_batch_id'\s*=>\s*\$old_batch/);
            expect(fn).toMatch(/'to_batch_id'\s*=>\s*\$target_batch_id/);
        });
        test('Returns target_batch_code in response', () => {
            expect(fn).toMatch(/'target_batch_code'\s*=>\s*\$tgt_batch->batch_code/);
        });
    });

    describe('Common pattern compliance (V.0.45 baseline)', () => {
        test('All 3 endpoints return results[] array per V.0.45 contract', () => {
            const handlers = ['dinoco_sn_rest_bulk_relink', 'dinoco_sn_rest_bulk_notify', 'dinoco_sn_rest_bulk_transfer'];
            for (const h of handlers) {
                const fn = rest.match(new RegExp(`function\\s+${h}[\\s\\S]{0,8000}`));
                expect(fn).not.toBeNull();
                expect(fn[0]).toMatch(/\$results\s*=\s*array\(\)/);
            }
        });
        test('All 3 endpoints check feature disabled flag', () => {
            const handlers = ['dinoco_sn_rest_bulk_relink', 'dinoco_sn_rest_bulk_notify', 'dinoco_sn_rest_bulk_transfer'];
            for (const h of handlers) {
                const fn = rest.match(new RegExp(`function\\s+${h}[\\s\\S]{0,8000}`));
                expect(fn[0]).toMatch(/!\s*dinoco_sn_is_enabled\(\)/);
            }
        });
    });
});
