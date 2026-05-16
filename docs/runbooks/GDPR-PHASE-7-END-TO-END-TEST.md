# GDPR Phase 7 — End-to-End Test Plan

[← Runbooks index](../)

> **Status**: Ready · Boss decision approved 2026-05-16 (#1 = "ทดสอบเลย")
> **Pre-req**: GDPR flag ON (verified 2026-05-16 commit `3640d16` + ✅ ACTIVE banner)
> **Time to complete**: ~30-45 นาที (export flow + delete flow + admin review)
> **Risk**: ต่ำ — ใช้ test account (admin), data export/delete กระทบเฉพาะ account ทดสอบ

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
```

### Check 3 — Cron worker scheduled

```bash
wp cron event list | grep gdpr
# Expected: dinoco_gdpr_process_queue_cron (hourly)
#           dinoco_gdpr_retention_cron (daily)
```

### Check 4 — OpenClaw agent reachable (สำหรับ LINE messages export)

```bash
curl -H "Authorization: Bearer $LIFF_AI_AGENT_KEY" \
  https://dinoco.in.th/agent/api/health
# Expected: 200 OK, { "status": "ok" }
```

ถ้า agent ไม่ตอบ → LINE messages export จะคืน placeholder `unavailable=true` (graceful degradation)

## Test 1 — Data Export Flow

### Step 1.1 — Use test account (สมัครก่อน ถ้าไม่มี)

ใช้ test account ของ admin ที่มี:
- user_meta `dinoco_line_uid` set
- มี warranty registrations + claims + B2B orders (data ครบ)

### Step 1.2 — Submit export request

**ทาง A — REST API (สำหรับ admin test)**:

```bash
# Login first to get nonce (browser, then copy cookie + nonce)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: wordpress_logged_in_XXX=..." \
  -H "X-WP-Nonce: ..." \
  -d '{"scope":"all","format":"zip","reason":"e2e test by admin"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-export
```

**Expected response** (HTTP 202 Accepted):
```json
{
  "request_id": 123,
  "status": "pending",
  "estimated_complete_at": "2026-05-16T13:00:00+07:00",
  "cancellation_window_at": "2026-05-16T12:30:00+07:00",
  "message": "คำขอ export ได้รับแล้ว — รอ admin review ภายใน 30 นาที"
}
```

**ทาง B — LIFF (สำหรับ real customer flow simulation)**:
เปิด LIFF GDPR page (ถ้ามี) หรือ Member Dashboard → Settings → "ขอ export ข้อมูลของฉัน"

### Step 1.3 — Verify request created

```sql
SELECT id, user_id, type, status, scope_json, created_at
FROM wp_dinoco_gdpr_requests
ORDER BY id DESC LIMIT 1;
```

→ ต้องเห็น row ใหม่ status='pending'

### Step 1.4 — Admin review

ไป `/admin-command-center/#gdpr` → tab "Pending Review" → ต้องเห็น row ใหม่

**Action 1 — Approve**:
- คลิก "Approve" → ระบบ schedule cron processing
- Status → 'approved' → 'processing'

**Action 2 — รอ cron (~1 นาที) หรือ trigger manual**:

```bash
wp cron event run dinoco_gdpr_process_queue_cron
```

### Step 1.5 — Verify export ZIP generated

```sql
SELECT id, status, processed_at, download_token, file_size_bytes
FROM wp_dinoco_gdpr_requests
WHERE id = 123;
```

→ status='ready', `download_token` set, `file_size_bytes` > 0

### Step 1.6 — Download ZIP

```bash
curl -o test-export.zip \
  "https://dinoco.in.th/wp-json/dinoco-gdpr/v1/admin/download/123?token={download_token}"
```

**Verify ZIP contents**:
```bash
unzip -l test-export.zip
```

Expected files:
- `user-profile.json` (wp_users + wp_usermeta)
- `warranties.json` (warranty CPT)
- `claims.json` (claim_ticket CPT)
- `b2b-orders.json` (B2B orders)
- `distributor-profile.json` (ถ้ามี)
- `line-messages.json` (MongoDB via OpenClaw — ถ้า agent reachable, ถ้าไม่ → `line-messages-UNAVAILABLE.txt`)
- `audit-trail.json` (gdpr request audit)
- `README.txt` (cover letter)

**Sanity check**:
```bash
unzip -p test-export.zip user-profile.json | jq .
# ต้องเห็น email, display_name, registered_date ฯลฯ
```

### Step 1.7 — Verify audit log

```sql
SELECT created_at, request_id, action, actor_id, success
FROM wp_dinoco_gdpr_audit_log
WHERE request_id = 123
ORDER BY id;
```

Expected actions: `submitted`, `approved_by_admin`, `processing_started`, `export_completed`, `download_link_issued`

### Step 1.8 — Test download expiry

Wait 7 days OR manually update DB:
```sql
UPDATE wp_dinoco_gdpr_requests SET expires_at = NOW() - INTERVAL 1 HOUR WHERE id = 123;
```

Try download again → ต้องคืน 410 Gone with message "Download link expired"

---

## Test 2 — Data Delete Flow

### Step 2.1 — Submit delete request

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: wordpress_logged_in_XXX=..." \
  -H "X-WP-Nonce: ..." \
  -d '{"reason":"e2e test deletion","confirm":"DELETE_MY_ACCOUNT"}' \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-delete
```

**Expected** (HTTP 202):
```json
{
  "request_id": 124,
  "status": "pending",
  "cancellation_window_at": "2026-05-16T13:00:00+07:00",
  "message": "คำขอลบบัญชีได้รับ — มี grace period 30 นาทีก่อน admin review"
}
```

### Step 2.2 — Test cancellation window

ภายใน 30 นาที — ลูกค้ายกเลิกได้:

```bash
curl -X DELETE \
  -H "Cookie: wordpress_logged_in_XXX=..." \
  -H "X-WP-Nonce: ..." \
  https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-status/124
```

→ status='cancelled'. ทดสอบเสร็จ submit ใหม่สำหรับ Step 2.3

### Step 2.3 — Admin review delete request

`/admin-command-center/#gdpr` → tab "Pending Review" → row ใหม่ type='delete'

Admin จะเห็น **erasure decision matrix** (per `docs/compliance/GDPR-PHASE-6-DESIGN.md`):
- ข้อมูลที่ลบจริง (right to be forgotten): user_meta personal fields, claim photos, brand voice reviews
- ข้อมูลที่ anonymize (legal retention): order records (tax 5y), warranty (legal duration), claim ticket (audit trail)
- ข้อมูลที่เก็บ (legitimate interest): aggregated analytics (no PII)

### Step 2.4 — Approve + execute

Admin click "Approve + Execute" → cron process:

```bash
wp cron event run dinoco_gdpr_process_queue_cron
```

### Step 2.5 — Verify deletion

```sql
-- User row should be either deleted or anonymized
SELECT ID, user_login, user_email, display_name FROM wp_users WHERE ID = {test_user_id};
-- Expected: row deleted OR user_email = 'anonymized-XXX@deleted.local'

-- User meta personal fields cleared
SELECT meta_key, meta_value FROM wp_usermeta WHERE user_id = {test_user_id};
-- Expected: dinoco_line_uid removed, profile fields cleared

-- Orders should remain (legal retention) but PII anonymized
SELECT ID, post_title FROM wp_posts WHERE post_type = 'b2b_order' AND post_author = {test_user_id};
-- Expected: posts remain, but linked user data anonymized
```

### Step 2.6 — Verify audit trail (immutable)

```sql
SELECT * FROM wp_dinoco_gdpr_audit_log WHERE request_id = 124 ORDER BY id;
```

Audit trail ต้องอยู่ครบ — PDPA §39 บังคับ retention

---

## Test 3 — Admin Review UI smoke tests

### 3.1 — All tabs load

`/admin-command-center/#gdpr` — verify all 5 tabs load:
- Pending Review (count = N)
- Processing (count = N)
- Ready (download links live)
- Failed (cron errors if any)
- Audit Log (immutable trail)

### 3.2 — Filter + search

Search by user_id, request_id, type, date range → results filtered correctly

### 3.3 — Bulk actions

Select multiple → bulk approve / reject → confirm modal → execute

### 3.4 — Export audit CSV

Tab "Audit Log" → button "📥 Export CSV" → download → verify columns

### 3.5 — Refund decision UI (delete flow)

When approving delete, admin sees:
- ✅ "Anonymize ข้อมูลส่วนตัว, เก็บ orders 5 ปี (tax law)" (default)
- ⚠️ "Hard delete ทุกอย่าง" (advanced, requires 2nd admin approval per Q15)

## Test data cleanup

หลังเทสจบ — ลบ test data:

```sql
-- Delete test request rows
DELETE FROM wp_dinoco_gdpr_audit_log WHERE request_id IN (123, 124);
DELETE FROM wp_dinoco_gdpr_requests WHERE id IN (123, 124);

-- Delete test export ZIP file
-- (path stored in row before deletion — note it for manual rm)
```

หรือใช้ WP CLI helper:
```bash
wp dinoco gdpr cleanup-test-data --request-ids=123,124
```

(ถ้า helper command ยังไม่มี — manual SQL OK)

## Failure scenarios to verify

| Scenario | Expected behavior |
|---|---|
| Submit export while user not logged in | 401 Unauthorized |
| Submit 2 exports within 1 hour same user | 429 Too Many Requests (rate limited) |
| Admin reject request | status='rejected', user notified via LINE, audit logged |
| Cron crashes mid-processing | status='failed', error_message stored, admin sees in Failed tab |
| OpenClaw agent down during export | line-messages-UNAVAILABLE.txt placeholder, rest of export proceeds |
| Download token expired | 410 Gone with friendly Thai message |
| Hard delete user with active subscriptions | 409 Conflict (block until subscriptions handled) |

## Production readiness checklist

หลังเทสผ่าน:
- [ ] All 3 flows green
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
