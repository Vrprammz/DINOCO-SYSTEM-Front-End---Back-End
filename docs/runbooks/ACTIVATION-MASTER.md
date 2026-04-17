# Master Activation Runbook — DINOCO Session 2026-04-17

**Purpose**: step-by-step ให้ user activate ทุกอย่างที่ session ทำ scaffold ไว้

**Total session: 63 commits, 6 phases, 14 parallel agent dispatches**

---

## 📋 Activation Status

| # | Item | Code ready? | User action needed | Priority |
|---|------|:-----------:|-------------------|----------|
| 1 | **BO System flag ON** | ✅ | ✅ DONE 2026-04-17 | — |
| 2 | **LIFF AI strict mode** (dinoco_line_uid) | ✅ | ✅ DONE 2026-04-17 | — |
| 3 | **OpenClaw auth changes deploy** | ✅ | ✅ DONE 2026-04-17 | — |
| 4 | **RPi auth changes deploy** | ✅ | ⏳ SSH + systemctl restart | Medium |
| 5 | **Sentry (WP + OpenClaw)** | ✅ scaffold | ⏳ DSN + composer + npm + flags | Low |
| 6 | **B2F Phase 4 migration** | ✅ code ready | ⏳ Dry-run → verify → LIVE click | Medium |
| 7 | **PDPA full implementation** | ⏳ stubs only | ⏳ legal review + sprint (2-3 wk) | Low |
| 8 | **BO monitoring 24-72h** | N/A | ⏳ SQL queries periodic | **HIGH** |
| 9 | **phpunit CI integration** | ✅ scaffold | ⏳ composer install on CI | Low |

---

## 🚨 URGENT — ทำตอนนี้ (HIGH)

### #8 — BO Monitoring (24-72h passive observation)

BO system ON globally since 2026-04-17 — ต้อง monitor เช็คไม่มี regression

**เปิด phpMyAdmin → Database `dinoco_21e` → SQL tab**

### A1. Stock negative check (ควรเป็น 0 rows)
```sql
SELECT sku, name, stock_qty FROM wp_dinoco_products WHERE stock_qty < 0;
```
ถ้าเจอ → BUG-C2 (stock double-subtract) ไม่ปิดสนิท → ส่ง SKU + order ที่เจอ

### A2. BO queue distribution
```sql
SELECT status, COUNT(*) AS n FROM wp_dinoco_bo_queue GROUP BY status;
```
Expected sooner or later: `pending` (waiting), `ready` (admin should act), `fulfilled` (done), `cancelled` (admin/customer)

### A3. Pending review ค้าง > 4 ชม. (admin action needed)
```sql
SELECT p.ID, p.post_title, 
  (SELECT meta_value FROM wp_postmeta WHERE post_id=p.ID AND meta_key='_b2b_opaque_accept_at') AS accepted_at,
  TIMESTAMPDIFF(HOUR, FROM_UNIXTIME(CAST(
    (SELECT meta_value FROM wp_postmeta WHERE post_id=p.ID AND meta_key='_b2b_opaque_accept_at') AS UNSIGNED
  )), NOW()) AS hours_waiting
FROM wp_posts p
JOIN wp_postmeta pm ON pm.post_id=p.ID AND pm.meta_key='order_status' AND pm.meta_value='pending_stock_review'
WHERE p.post_type='b2b_order' 
ORDER BY hours_waiting DESC;
```

### A4. Enumeration security flags (suspicious distributors)
```sql
SELECT p.ID, p.post_title, CAST(pm.meta_value AS UNSIGNED) AS flags
FROM wp_posts p
JOIN wp_postmeta pm ON pm.post_id=p.ID AND pm.meta_key='_b2b_enumeration_flags'
WHERE CAST(pm.meta_value AS UNSIGNED) > 0;
```
→ ถ้าเจอ → Admin Dashboard → Security Log tab → investigate

### A5. Rollback ถ้าเจอปัญหาใหญ่
```sql
UPDATE wp_options SET option_value='0' WHERE option_name='b2b_flag_bo_system';
```

**เช็คทุก 6-12 ชั่วโมง ใน 72h แรก** — ส่ง screenshots มาถ้าเจอผิดปกติ

---

## 🔧 MEDIUM — ทำเมื่อสะดวก

### #4 — RPi Restart (5 นาที)

ทำเมื่อกลับไปที่ RPi หรือ SSH ได้:

```bash
ssh dinocoth@<rpi-host>
cd /home/dinocoth/DINOCO-SYSTEM-Front-End---Back-End
git pull origin main
sudo systemctl restart dinoco-dashboard
sudo systemctl status dinoco-dashboard  # verify running
```

**ผลกระทบ**: S10 auth fix จะ active — `/api/ticket-lookup/{id}` + `/api/pno-lookup/{pno}` ต้องการ `X-Print-Key` header. ปัจจุบัน LAN attack surface ยังเปิดอยู่จนกว่าจะ restart

### #6 — B2F Phase 4 Migration (CPT Retirement)

**ระวัง**: Destructive DB operation — ALTER TABLE + classification UPDATE loop + CHECK constraint

#### Prerequisites (ทำก่อน)

1. **Verify MySQL version ≥ 8.0.16** (CHECK constraint enforcement):
```sql
SELECT @@version, @@version_comment;
```
ถ้าต่ำกว่า 8.0.16 → CHECK constraints ไม่ enforce → app-layer validation ยังทำงาน แต่ drift risk สูงขึ้น

2. **Verify Phase 3 state** (Junction cutover ต้อง ON):
```sql
SELECT option_name, option_value FROM wp_options 
WHERE option_name IN ('b2f_flag_shadow_write', 'b2f_flag_read_from_junction', 'b2f_schema_version');
```
Expected:
- `b2f_flag_shadow_write = 1`
- `b2f_flag_read_from_junction = 1`
- `b2f_schema_version = '10.1'`

3. **Backup DB** (ต้องทำจริงๆ):
```bash
# ผ่าน SSH (หรือ hosting cPanel → Backups)
mysqldump -u <user> -p dinoco_21e > dinoco_21e_pre_phase4_$(date +%Y%m%d_%H%M%S).sql
```

#### Phase 4 Execution

**Step 1 — Dry-run** (ปลอดภัย — แค่ report):
1. WP Admin → sidebar → "B2F Migration Audit"
2. Scroll → "Phase 4 Controls" section
3. Click **"🧪 Dry-Run"** button
4. รอ ~30 วินาที → CSV download link ปรากฏ
5. Download CSV + review rows:
   - `classified_set_assembled` count
   - `classified_sub_unit` count
   - `classified_single` count
   - `classified_cross_factory` count
   - `confirmed_preserved` count (rows ที่ admin เคย confirm → skip)
6. ถ้าเห็น `errors[]` array ไม่ว่าง → ส่ง error list ให้ผม — **ห้าม run Live**

**Step 2 — Verify state** (ระหว่าง dry-run และ live):
```sql
SELECT option_name, option_value FROM wp_options 
WHERE option_name LIKE 'b2f_phase4_%';
```
Expected: `b2f_phase4_migration_in_progress` = ไม่มี row (ถ้ามี = lock stuck — รอ auto-clear 1 ชม. หรือ delete option manually)

**Step 3 — Live migration** (กดครั้งเดียว):
1. Same page → **"🚀 Run LIVE Migration"** button
2. **modal ยืนยัน** (จาก `02173f6` migration — dinocoModal) → ยืนยัน
3. รอ ~1-2 นาที (ขึ้นกับ junction row count)
4. เห็น success response: `rows_updated: N` + `finished_at: timestamp`
5. Auto-clear lock + fire `b2f_junction_updated` cache flush

**Step 4 — Verify migration**:
```sql
-- Classification distribution
SELECT confirmation_status, production_mode, COUNT(*) 
FROM wp_dinoco_product_makers 
WHERE deleted_at IS NULL
GROUP BY confirmation_status, production_mode;

-- CHECK constraint active (MySQL 8.0.16+)
SELECT * FROM wp_dinoco_product_makers 
WHERE confirmation_status = 'confirmed' 
  AND (confirmed_by IS NULL OR confirmed_at IS NULL);
-- ควร 0 rows — ถ้าเจอ = CHECK constraint ไม่ enforce
```

**Step 5 — Monitor 72 ชั่วโมง**:
- B2F REST endpoints ทุกวัน — no errors
- Create PO + receive-goods flow works
- Maker LIFF works
- Admin Makers tab — classification badges show correct

**Rollback** (ถ้าพัง):
```bash
# Restore from mysqldump (ต้องใช้ถ้าจริงๆ)
mysql -u <user> -p dinoco_21e < dinoco_21e_pre_phase4_<timestamp>.sql
# + flip flag:
```
```sql
-- Emergency: turn OFF junction reads
UPDATE wp_options SET option_value='0' WHERE option_name='b2f_flag_read_from_junction';
```

---

## ⏱️ LOW — ทำเมื่อพร้อม (ไม่เร่ง)

### #5 — Sentry Activation

**📖 ดู**: [`docs/runbooks/SENTRY-ACTIVATION.md`](./SENTRY-ACTIVATION.md) — comprehensive step-by-step

**Quick path**:
1. Sign up sentry.io + create 2 projects (PHP + Node.js) → get 2 DSNs
2. WP:
   ```bash
   cd /path/to/wordpress && composer require sentry/sentry:^4.0
   ```
   + wp-config.php:
   ```php
   define('DINOCO_SENTRY_DSN', 'https://...@sentry.io/WP_PROJECT');
   define('DINOCO_SENTRY_ENV', 'production');
   define('DINOCO_SENTRY_SAMPLE_RATE', '0.1');
   ```
   + SQL:
   ```sql
   UPDATE wp_options SET option_value='1' WHERE option_name='dinoco_obs_sentry_enabled';
   UPDATE wp_options SET option_value='1' WHERE option_name='dinoco_obs_correlation_enabled';
   ```
3. OpenClaw:
   ```bash
   ssh root@5.223.95.236
   cd /opt/dinoco/openclawminicrm/proxy && npm install @sentry/node
   # Add SENTRY_DSN to ../.env
   docker compose -f ../docker-compose.prod.yml up -d --build agent
   ```

**Cost**: Free tier 5K events/month = suitable for start

### #7 — PDPA Full Implementation

**📖 ดู**: [`docs/compliance/PDPA-BASICS.md`](../compliance/PDPA-BASICS.md) — Thai PDPA skeleton + activation checklist

**Current state**: V.1.0 stubs deployed (endpoints return 503, flag OFF)

**To activate** (ต้องทำ sprint 2-3 สัปดาห์):
1. Legal review:
   - Hire lawyer → review Privacy Policy + Terms of Service + consent wording
   - Retention policy alignment (5-year accounting vs section 35 deletion)
2. Build admin UI (`[dinoco_admin_gdpr]` shortcode):
   - Pending queue table
   - Approve/Reject modals
   - Preview data modal
3. Build backend workers:
   - `dinoco_gdpr_generate_export_zip()` — ZIP + signed download (7-day expiry)
   - `dinoco_gdpr_process_anonymize()` — PII redaction
   - `dinoco_gdpr_cron_process_queue()` — hourly wp_cron
   - Email templates (Thai-first)
4. Add consent banner → member registration form
5. Flag flip:
   ```sql
   UPDATE wp_options SET option_value='1' WHERE option_name='dinoco_gdpr_enabled';
   ```

### #9 — phpunit CI Integration

**Current state**: Scaffold + 33 tests passing locally

**To activate** (dev/staging CI):
```bash
# On dev or CI server
cd /path/to/DINOCO-SYSTEM-Front-End---Back-End
composer install  # installs phpunit/phpunit ^10.0
./vendor/bin/phpunit
```

GitHub Actions workflow example:
```yaml
name: phpunit
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.1' }
      - run: composer install --no-interaction --prefer-dist
      - run: ./vendor/bin/phpunit
```

---

## 📚 Reference Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/runbooks/SENTRY-ACTIVATION.md`](./SENTRY-ACTIVATION.md) | Sentry setup step-by-step |
| [`docs/compliance/PDPA-BASICS.md`](../compliance/PDPA-BASICS.md) | Thai PDPA skeleton + activation checklist |
| [`docs/api/openapi.yaml`](../api/openapi.yaml) | OpenAPI 3.1 spec (61 endpoints) |
| [`docs/api/README.md`](../api/README.md) | How to preview OpenAPI |
| [`AUDIT-REPORT-2026-04-17.md`](../../AUDIT-REPORT-2026-04-17.md) | Full audit report + remediation status |
| [`CLAUDE.md`](../../CLAUDE.md) | Project overview + all subsystem specs |
| [`SYSTEM-REFERENCE.md`](../../SYSTEM-REFERENCE.md) | Snippet inventory + REST API reference |
| [`WORKFLOW-REFERENCE.md`](../../WORKFLOW-REFERENCE.md) | Business workflow flows |
| [`FEATURE-SPECS.md`](../../FEATURE-SPECS.md) | Feature specifications |
| [`liff-src/README.md`](../../liff-src/README.md) | LIFF build pipeline roadmap |

---

## 🎯 Session Success Metrics (verify after 1-2 weeks)

### Immediate (within 24h)
- ✅ Zero PHP fatal errors in production (critical error page)
- ✅ BO flow completes for beta distributors
- ✅ LIFF AI admin login success (after provisioned)
- ✅ All REST endpoints return 200 (no 500 regressions)

### Short-term (72h)
- ✅ Stock ไม่ติดลบ
- ✅ Debt numbers balance (recalculate == current_debt meta)
- ✅ BO queue drains (no eternal pending)
- ✅ No enumeration flags triggered

### Long-term (1-2 weeks)
- ✅ TTFB LIFF catalog ~40-60% faster (PERF-H1/M1/M12 combined)
- ✅ Admin dashboard load time improved (PERF-H2/H3)
- ✅ Zero customer complaints about BO UX
- ✅ No legal issues from PDPA (until fully activated — minimal exposure)

---

## 📞 Escalation Path

**If BO fails**:
1. Rollback flag OFF immediately (1-line SQL)
2. Capture error + screenshot + affected order IDs
3. Report via LINE to tech lead

**If DB corruption** (Phase 4 migration):
1. STOP any further operations
2. Restore from mysqldump backup
3. Contact tech lead before retry

**If production down**:
1. Check WP error_log (`wp-content/debug.log`)
2. Flip suspicious flag OFF
3. Revert last commit if needed: `git revert HEAD && git push`
4. GitHub Webhook Sync will auto-deploy revert

---

**Last updated**: 2026-04-17 21:30 (Session close)
**Status**: Scaffolds deployed, monitoring active, 4 items pending user action (RPi/Sentry/Phase 4/PDPA)
