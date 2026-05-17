# GDPR Phase 7 — End-to-End Test Plan

[← Runbooks index](../)

> **Status**: Ready · Boss decision approved 2026-05-16 (#1 = "ทดสอบเลย")
> **Pre-req**: GDPR flag ON (verified 2026-05-16 commit `3640d16` + ✅ ACTIVE banner)
> **Time to complete**: ~30-45 นาที (export flow + delete flow + admin review)
> **Risk**: ต่ำ — ใช้ test account (admin), data export/delete กระทบเฉพาะ account ทดสอบ
> **Revision history**: V.2 (2026-05-16) — corrected after audit found wrong cron name + wrong download URL + wrong cancellation method

---

## ขอบเขตการทดสอบ

ทดสอบ 3 flows ของระบบ GDPR/PDPA Phase 7:

1. **Data Export** — ลูกค้าขอ export ข้อมูลตัวเอง (PDPA §30 + GDPR Article 15)
2. **Data Delete** — ลูกค้าขอลบบัญชี (PDPA §33 + GDPR Article 17)
3. **Admin Review Workflow** — admin approve/reject/process คำขอ (PDPA §35)

## Pre-flight verification

### Check 1 — Flag verified ON

```bash
wp option get dinoco_gdpr_enabled
# Expected: '1'
```

หรือดูที่ `/admin-command-center/#gdpr` → ต้องเห็น banner เขียว **✅ ACTIVE**

### Check 2 — Schema installed

```sql
SHOW TABLES LIKE 'wp_dinoco_gdpr_%';
-- Expected: wp_dinoco_gdpr_requests + wp_dinoco_gdpr_audit_log

-- Schema v2.0 columns (added Phase 6)
SHOW COLUMNS FROM wp_dinoco_gdpr_requests LIKE 'download_token';
SHOW COLUMNS FROM wp_dinoco_gdpr_requests LIKE 'scope_json';
SHOW COLUMNS FROM wp_dinoco_gdpr_requests LIKE 'expires_at';
SHOW COLUMNS FROM wp_dinoco_gdpr_requests LIKE 'cancellation_window_at';
-- All 4 must exist
```

### Check 3 — Crons scheduled

```bash
wp cron event list | grep gdpr
# Expected:
#   dinoco_gdpr_retention_cron        (daily 03:30 - anonymize >90 day rows)
#   dinoco_gdpr_export_cleanup_cron   (daily - prune >7 day ZIP files)
#   dinoco_gdpr_sla_reminder_cron     (daily 09:00 - notify stale queued requests)
```

**⚠️ หมายเหตุ**: ไม่มี `dinoco_gdpr_process_queue_cron` — ระบบใช้ `wp_schedule_single_event('dinoco_gdpr_process_request', [$request_id])` ที่ schedule เฉพาะตอน admin กด Approve (กับ 30s undo window). ไม่ใช่ queue cron แบบ batch.

### Check 4 — Private uploads dir writable + protected

```bash
ls -la /var/www/dinoco.in.th/wp-content/uploads/gdpr/
# Expected: directory exists, owned by webserver user
cat /var/www/dinoco.in.th/wp-content/uploads/gdpr/.htaccess
# Expected: "deny from all" or similar — prevents direct access without token
```

### Check 5 — OpenClaw agent reachable (สำหรับ LINE messages export)

```bash
# From WP server SSH
curl -sH "Authorization: Bearer $LIFF_AI_AGENT_KEY" \
  http://localhost:3000/api/health
# Expected: 200 OK, { "status": "ok" }
```

ถ้า agent ไม่ตอบ → LINE messages export จะคืน placeholder `unavailable=true` (graceful degradation). ส่วนอื่นๆ ของ export ยังทำงานปกติ

## Test 1 — Data Export Flow

### Step 1.1 — Use test account

ใช้ test account ของ admin ที่มี:
- user_meta `dinoco_line_uid` set
- มี warranty registrations + claims + B2B orders (data ครบ → ZIP จะมีไฟล์ครบทุก source)

### Step 1.2 — Submit export request (customer-facing endpoint)

```bash
# Get nonce from logged-in browser session first:
#   - Login as test user at https://dinoco.in.th
#   - DevTools → Network → find any wp-json call → copy 'X-WP-Nonce' header
#   - Copy 'wordpress_logged_in_*' cookie

curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: wordpress_logged_in_XXX=YOUR_COOKIE" \
  -H "X-WP-Nonce: YOUR_NONCE" \
  -d '{"format":"zip","reason":"e2e test by admin"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-export
```

**Expected response** (HTTP 202 Accepted):
```json
{
  "request_id": 123,
  "status": "pending",
  "estimated_complete_at": "2026-05-16T13:00:00+07:00",
  "message": "คำขอ export ได้รับแล้ว — รอ admin review"
}
```

### Step 1.3 — Verify request created

```sql
SELECT id, user_id, type, status, scope_json, created_at
FROM wp_dinoco_gdpr_requests
ORDER BY id DESC LIMIT 1;
```

→ ต้องเห็น row ใหม่ status='pending'

### Step 1.4 — Admin review

ไป `/admin-command-center/#gdpr` → tab "Pending Review" → ต้องเห็น row ใหม่

**Action — Approve** (จะ schedule worker single event):

```bash
# REST call as admin (or click in UI):
curl -X POST \
  -H "Cookie: wordpress_logged_in_XXX=ADMIN_COOKIE" \
  -H "X-WP-Nonce: ADMIN_NONCE" \
  -H "Content-Type: application/json" \
  -d '{"reason":"approved by admin"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/request/123/approve
```

**Expected response**:
```json
{
  "success": true,
  "status": "approved",
  "cancellation_window_at": "2026-05-16T12:30:30+07:00",
  "message": "Approved. Worker จะ run อัตโนมัติใน 30 วินาที (undo ได้ภายใน window นี้)"
}
```

หลังจากนี้:
- Status DB: `'pending'` → `'approved'`
- WP schedules `wp_schedule_single_event('dinoco_gdpr_process_request', [123])` to fire at `cancellation_window_at`
- Admin มี 30s ที่จะกด Undo

**Undo (within 30s window)**:
```bash
curl -X POST \
  -H "Cookie: ..." -H "X-WP-Nonce: ..." \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/request/123/undo
# → Status: 'pending' again, scheduled event cancelled
```

### Step 1.5 — รอ 30s + worker fires automatically

After cancellation_window_at:
- WP-Cron fires `dinoco_gdpr_process_request` action with `[123]`
- Handler runs `dinoco_gdpr_build_export($user_id)`:
  - Creates ZIP at `wp-content/uploads/gdpr/{user_id}/dinoco-export-{timestamp}.zip`
  - Generates `download_token` (random 64-char)
  - Updates `wp_dinoco_gdpr_requests` row: status='ready', download_token, expires_at=NOW()+7d

**OR trigger immediately (skip undo wait)** — admin can use manual-export:

```bash
curl -X POST \
  -H "Cookie: ..." -H "X-WP-Nonce: ..." \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/request/123/manual-export
# → Runs worker synchronously (heavy I/O, response may take 5-10s)
```

### Step 1.6 — Verify export ZIP generated

```sql
SELECT id, status, processed_at, download_token, expires_at, scope_json
FROM wp_dinoco_gdpr_requests
WHERE id = 123;
```

→ status='ready', `download_token` set (64 chars), `expires_at` ~7 days from now, `scope_json` contains record counts

### Step 1.7 — Download ZIP

Download URL pattern (NOT a REST endpoint — direct uploads URL with token):
```
https://dinoco.in.th/wp-content/uploads/gdpr/{user_id}/dinoco-export-{timestamp}.zip?token={download_token}
```

Server-side `.htaccess` validates token before serving (or `/wp-content/uploads/gdpr/serve.php` proxy).

**Get full download URL**: ดูใน admin UI tab "Ready" → ปุ่ม "Download" หรือ:

```sql
SELECT
  CONCAT(
    'https://dinoco.in.th/wp-content/uploads/gdpr/', user_id, '/',
    -- zip filename pattern: dinoco-export-{request_id}-{timestamp}.zip
    -- exact filename stored in scope_json or admin UI
    '?token=', download_token
  ) AS download_url
FROM wp_dinoco_gdpr_requests
WHERE id = 123;
```

Or just download via admin UI button.

**Verify ZIP contents**:
```bash
curl -o test-export.zip "https://dinoco.in.th/wp-content/uploads/gdpr/.../?token=..."
unzip -l test-export.zip
```

Expected files:
- `user-profile.json` (wp_users + wp_usermeta whitelist)
- `warranties.json` (warranty CPT)
- `claims.json` (claim_ticket CPT)
- `b2b-orders.json` (B2B orders)
- `distributor-profile.json` (ถ้ามี)
- `line-messages.json` (MongoDB via OpenClaw — ถ้า agent reachable, ถ้าไม่ → `line-messages-UNAVAILABLE.txt`)
- `audit-trail.json` (gdpr request audit)
- `README.txt` (cover letter)

```bash
# Sanity check
unzip -p test-export.zip user-profile.json | jq '.'
# ต้องเห็น email, display_name, registered_date ฯลฯ
```

### Step 1.8 — Verify audit log

```sql
SELECT created_at, request_id, action, actor_id, success
FROM wp_dinoco_gdpr_audit_log
WHERE request_id = 123
ORDER BY id;
```

Expected actions sequence:
1. `submitted` (actor = test user)
2. `approved_by_admin` (actor = admin)
3. `processing_started` (actor = worker / system 0)
4. `export_completed` (actor = worker)
5. `download_link_issued` (actor = worker)
6. `downloaded` (actor = user, only if downloaded)

### Step 1.9 — Test download expiry

Wait 7 days OR manually update DB:
```sql
UPDATE wp_dinoco_gdpr_requests SET expires_at = NOW() - INTERVAL 1 HOUR WHERE id = 123;
```

Try download again → server denies with 403/410 + message "Download link expired"

---

## Test 2 — Data Delete Flow

### Step 2.1 — Submit delete request

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: wordpress_logged_in_XXX=USER_COOKIE" \
  -H "X-WP-Nonce: USER_NONCE" \
  -d '{"reason":"e2e test deletion","confirm":"DELETE_MY_ACCOUNT"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-delete
```

**Expected** (HTTP 202):
```json
{
  "request_id": 124,
  "status": "pending",
  "message": "คำขอลบบัญชีได้รับ — Admin จะ review ก่อนดำเนินการ"
}
```

### Step 2.2 — Admin review delete request

`/admin-command-center/#gdpr` → tab "Pending Review" → row ใหม่ type='delete'

Admin จะเห็น **erasure decision matrix** (per `docs/compliance/GDPR-PHASE-6-DESIGN.md`):
- ข้อมูลที่ลบจริง (right to be forgotten): user_meta personal fields, claim photos, brand voice reviews
- ข้อมูลที่ anonymize (legal retention): order records (tax 5y), warranty (legal duration), claim ticket (audit trail)
- ข้อมูลที่เก็บ (legitimate interest): aggregated analytics (no PII)

### Step 2.3 — Approve

```bash
curl -X POST \
  -H "Cookie: ..." -H "X-WP-Nonce: ..." \
  -H "Content-Type: application/json" \
  -d '{"reason":"approved deletion", "mode":"anonymize"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/request/124/approve
```

`mode`:
- `"anonymize"` — keep records for legal retention, scrub PII (recommended for orders/warranties)
- `"hard_delete"` — DROP all data (only for users with NO legal-retention obligation; requires 2nd admin approval per Q15)

### Step 2.4 — รอ 30s undo window + worker fires

หรือ manual-export to skip wait:

```bash
curl -X POST \
  -H "Cookie: ..." -H "X-WP-Nonce: ..." \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/request/124/manual-export
```

### Step 2.5 — Verify deletion

```sql
-- User row check
SELECT ID, user_login, user_email, display_name FROM wp_users WHERE ID = {test_user_id};
-- mode='anonymize': row exists, user_email pattern 'anonymized-XXX@deleted.local'
-- mode='hard_delete': row deleted

-- User meta personal fields cleared (anonymize mode)
SELECT meta_key, LEFT(meta_value, 50) AS meta_preview
FROM wp_usermeta WHERE user_id = {test_user_id};
-- Expected: dinoco_line_uid + first_name + last_name + billing_* removed
-- Kept: roles, capabilities, language preference

-- Orders should remain (legal retention) but PII anonymized
SELECT ID, post_title FROM wp_posts WHERE post_type = 'b2b_order' AND post_author = {test_user_id};
-- Expected: posts remain (5-year tax retention), author replaced with anonymized user
```

### Step 2.6 — Verify audit trail (immutable)

```sql
SELECT created_at, action, actor_id, payload_preview
FROM wp_dinoco_gdpr_audit_log
WHERE request_id = 124
ORDER BY id;
```

Audit trail ต้องอยู่ครบ — PDPA §39 บังคับ retention 90 days minimum (configurable)

---

## Test 3 — Admin Review UI smoke tests

### 3.1 — All tabs load

`/admin-command-center/#gdpr` — verify all 5 tabs load:
- Pending Review (count = N)
- Processing (count = N) — type='approved' หรือ 'processing'
- Ready (download links live, type='ready' && expires_at > NOW())
- Failed (status='failed' — cron errors if any)
- Audit Log (immutable trail)

### 3.2 — Filter + search

Filter by user_id, request_id, type (export/delete), status, date range → results filtered correctly

### 3.3 — Bulk actions (ถ้ามี)

Select multiple → bulk approve / reject → confirm modal → execute

### 3.4 — Export audit CSV

Tab "Audit Log" → button "📥 Export CSV" → download → verify columns

### 3.5 — Undo workflow

1. Approve a test request → status='approved', cancellation_window_at = NOW()+30s
2. กดปุ่ม "Undo" ภายใน 30s
3. Status → 'pending', scheduled event cancelled
4. หลัง 30s กด "Undo" → error 410 Gone "undo window expired"

## Test data cleanup

หลังเทสจบ — ลบ test data:

```sql
-- Delete test request rows
DELETE FROM wp_dinoco_gdpr_audit_log WHERE request_id IN (123, 124);
DELETE FROM wp_dinoco_gdpr_requests WHERE id IN (123, 124);

-- Delete test export ZIP file
-- ดู file path จาก scope_json column ก่อนลบ row
-- เช่น: rm /var/www/dinoco.in.th/wp-content/uploads/gdpr/{user_id}/dinoco-export-*.zip
```

หรือใช้ cron cleanup (ZIP files >7 days auto-delete):
```bash
wp cron event run dinoco_gdpr_export_cleanup_cron
```

## Failure scenarios to verify

| Scenario | Expected behavior |
|---|---|
| Submit export while user not logged in | 401 Unauthorized |
| Submit 2 exports within 1 hour same user | 429 Too Many Requests (rate limited) |
| Admin reject request | status='rejected', user notified via LINE, audit logged |
| Worker crashes mid-processing | status='failed', error_message stored, admin sees in Failed tab |
| OpenClaw agent down during export | line-messages-UNAVAILABLE.txt placeholder, rest of export proceeds |
| Download token expired (>7 days) | 410 Gone with friendly Thai message |
| Hard delete user with active subscriptions | 409 Conflict (block until subscriptions handled) |
| Approve, then admin tries Undo after 30s | 410 Gone "undo window expired" |

## Production readiness checklist

หลังเทสผ่าน:
- [ ] All 3 flows green (export + delete + admin review)
- [ ] Audit log entries verified
- [ ] LINE notifications to user verified (export ready / delete completed)
- [ ] Email notifications (if configured)
- [ ] Test data cleaned up
- [ ] Customer-facing LIFF GDPR page (ถ้ามี) usable
- [ ] Support team trained on admin review UI
- [ ] PDPA compliance audit document signed off

## Related files

- [`[System] DINOCO GDPR Data Requests`](../../%5BSystem%5D%20DINOCO%20GDPR%20Data%20Requests) V.4.6+
- [`docs/compliance/GDPR-PHASE-6-DESIGN.md`](../compliance/GDPR-PHASE-6-DESIGN.md) — erasure decision matrix
- [`docs/compliance/PDPA-BASICS.md`](../compliance/PDPA-BASICS.md) — Thai PDPA §30-39 reference
- OpenClaw agent: `/api/gdpr/line-messages` route

## Audit notes

This runbook was **rewritten V.2 (2026-05-16)** after audit found V.1 referenced:
- ❌ `dinoco_gdpr_process_queue_cron` (doesn't exist) → actual: `wp_schedule_single_event('dinoco_gdpr_process_request', [$id])` per approval
- ❌ `GET /dinoco-gdpr/v1/admin/download/{id}` (doesn't exist) → actual: direct `wp-content/uploads/gdpr/.../?token=...` URL with .htaccess token check
- ❌ `DELETE /my-data-status/{id}` for customer cancellation (no DELETE handler) → actual: admin-only `/admin/request/{id}/undo` within 30s window

V.2 corrected to actual REST routes + worker mechanism + download pattern. Verified via grep against `[System] DINOCO GDPR Data Requests` V.4.6+ snippet.
