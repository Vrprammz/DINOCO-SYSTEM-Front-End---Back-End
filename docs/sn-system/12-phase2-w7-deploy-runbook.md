# 📦 Phase 2 W7 — Member Dashboard Atomic 5-Step Deploy Runbook

**Version**: 1.0 (2026-05-07)
**Plan**: v2.13 Phase 2 W7
**Owner**: Tech Lead
**Pair**: บอส (boss) — final flip-on confirmation

---

## 🎯 Goal

Deploy 3 Member Dashboard snippets (V.31.0) to production atomically:

1. `[System] DINOCO Dashboard` V.31.0 — main shell
2. `[System] DINOCO Dashboard Header & Forms` V.31.0 — top nav + edit forms
3. `[System] DINOCO Dashboard Assets List` V.31.0 — warranty + plate cards

**Atomicity guarantee**: ลูกค้าที่กำลังใช้ Dashboard อยู่จะเห็นเวอร์ชันเดียว (ไม่มีหน้าแบบ mix V.30 + V.31) ตลอด deploy window.

---

## 📋 Pre-flight (T-24h)

### Code completeness checklist
- [ ] All 3 snippets pass `php -l` syntax check
- [ ] `tests/helpers/Sn*.php` PHPUnit suite green (1389+ tests)
- [ ] `tests/jest/sn-system-drift.test.js` green (1500+ assertions)
- [ ] No regression in `tests/helpers/SnLegacyBackwardCompatTest.php` (REG-088)
- [ ] WP staging environment running V.31.0 for ≥ 24 hr smoke test
- [ ] Manual QA: 5 customer accounts (legacy CPT + sn_pool active + transferred + claimed + expired)

### Comms
- [ ] Telegram alert to `B2B_ADMIN_GROUP_ID` 1 hr before window open
- [ ] LINE Flex broadcast deferred (no customer-visible regressions expected)
- [ ] Boss (บอส) confirms availability for go/no-go call

### Backups
- [ ] `mysqldump` on `wp_posts`, `wp_postmeta`, `wp_dinoco_sn_pool*` 30 min before flip
- [ ] Snapshot copy uploaded to off-site backup (Hetzner volume)
- [ ] Current snippet versions exported via WP Code Snippets export tool

---

## 🚀 Deploy Window — Atomic 5-Step

> **Flip-on protocol**: each step ≤ 60 seconds, total window ≤ 5 minutes.

### Step 1 — Drain (T-0)
1. Set kill switch: `wp option update dinoco_sn_dashboard_v31_drain_mode 1`
2. Existing requests continue on V.30; new requests get short-cache `cache-control: no-store, max-age=5`
3. Wait 5 sec for in-flight requests to settle

### Step 2 — Sync code (T+5s)
1. `git pull origin main` on production WP
2. Verify webhook auto-sync to WP Code Snippets:
   ```
   tail -n 50 /var/log/dinoco-sync.log | grep "V.31.0"
   ```
3. Confirm 3 snippets show DB_ID matched + activated

### Step 3 — Atomic flip (T+30s)
Run all 3 in a single transaction (via wp-cli):
```bash
wp option update dinoco_sn_dashboard_active_version "V.31.0"
wp option update dinoco_sn_dashboard_v31_drain_mode 0
wp cache flush
```

### Step 4 — Smoke test (T+60s)
- [ ] Hit `/dashboard/` as guest → should redirect to LINE login
- [ ] Hit `/dashboard/` as logged-in legacy customer → should render V.31.0 with legacy fallback (REG-088 path)
- [ ] Hit `/dashboard/` as sn_pool customer → should render V.31.0 with plate cards
- [ ] Open Edit Profile form → submit empty change → should not throw
- [ ] Verify response header `X-Dinoco-Dashboard-Version: V.31.0` present

### Step 5 — Sentinel period (T+5m to T+30m)
Monitor:
- Sentry error rate vs T-1h baseline (must be ≤ +20%)
- New PDPA export requests success rate (must be ≥ 95%)
- Telegram alerts for any 500 errors

---

## ⏪ Rollback (any step)

If any smoke test fails or Sentry spikes:
```bash
wp option update dinoco_sn_dashboard_active_version "V.30.x"
wp option update dinoco_sn_dashboard_v31_drain_mode 1
git checkout <prev-commit-hash> -- "[System] DINOCO Dashboard"*
wp cache flush
```

Rollback target: ≤ 30 seconds. If rollback fails, restore from `mysqldump` backup created in pre-flight.

---

## ✅ Acceptance Criteria

| Criterion | Threshold | Measurement |
|---|---|---|
| Deploy window | ≤ 5 minutes | Wall-clock from Step 1 to Step 4 success |
| Sentry error spike | ≤ +20% over baseline | Compare T-1h vs T+30m error rate |
| Customer-visible 500s | 0 | Sentry filter `tag:dashboard tag:V.31.0 status:500` |
| Legacy customer compat | 100% | Manual QA 5 legacy accounts ✓ |
| Rollback time (if needed) | ≤ 30 seconds | wp-cli execution wall-clock |

---

## 📝 Post-deploy

- [ ] Update `.second-brain/log.md` with deploy result + sentinel period observations
- [ ] Append to `docs/sn-system/07-boss-decisions-log.md` if any new decisions captured
- [ ] Sentinel review at T+24h: confirm no regression patterns
- [ ] Sentinel review at T+7d: lock in V.31.0 as canonical, drop drain-mode flag
- [ ] Schedule Phase 2 W8 (Service Center quick lookup) kickoff

---

## 📚 Related docs

- `docs/sn-system/15-phase2-w7-atomic-deploy-strategy.md` — strategy detail (existing)
- `docs/sn-system/14-q12-skip-pilot-risk-acceptance.md` — pilot-skip risk acceptance
- `docs/sn-system/13-kpi-baseline-measurement-plan.md` — baseline KPI snapshot before flip

---

**Owner sign-off**:
- [ ] Tech Lead — deploy plan reviewed
- [ ] บอส (boss) — go/no-go confirmation
- [ ] On-call admin — monitoring window confirmed

---

## 🛢️ Schema Migration CLI (R3 BLOCKER)

**Source**: Plan v2.13 §Phase 1 W4 R3 + REG-094
**Owner**: Tech Lead (boss observes)
**Run timing**: Pre-deploy T-30 min ก่อน Step 1 (Drain)

ก่อน Phase 2 W7 atomic deploy ต้อง migrate schema → v1.2 ให้สำเร็จก่อน เพราะ:
- New `uq_dedup` 4-col composite key + 3 covering indexes
- `dinoco_sn_schema_version` flips `1.1 → 1.2`
- ผลกระทบ: query plans ใน 5+ admin endpoints จะใช้ index ใหม่

### Step 1 — Pre-flight (T-30m)

```bash
# 1. Backup DB
mysqldump --single-transaction \
    --databases wp_dinoco_prod \
    --tables wp_dinoco_sn_pool wp_dinoco_sn_pool_meta \
             wp_dinoco_sn_audit wp_dinoco_sn_notifications \
    > /backup/sn-prew7-$(date +%Y%m%d_%H%M%S).sql

# 2. Verify backup OK
ls -lh /backup/sn-prew7-*.sql | tail -1
```

### Step 2 — Dry-run schema migration

```bash
ssh root@5.223.95.236
cd /var/www/html
wp eval '
$ok = dinoco_sn_install_schema( true /* dry_run */ );
echo $ok ? "DRY-RUN OK\n" : "DRY-RUN FAIL\n";
echo "Pre-version: " . get_option("dinoco_sn_schema_version") . "\n";
'
```

**Expected**:
- Output: `DRY-RUN OK` + `Pre-version: 1.1`
- ไม่มี error log ใน `/var/log/dinoco-debug.log`
- ไม่มีการเปลี่ยน schema (DB inspection)

**ถ้าล้มเหลว**:
- Log row count: `wp eval 'echo $GLOBALS["wpdb"]->get_var("SELECT COUNT(*) FROM wp_dinoco_sn_notifications");'`
- ถ้า > 100k rows → SKIP migration + เลื่อน W7 ไป run schema offline (ในช่วง maintenance window)
- ถ้า < 100k rows → debug error + retry

### Step 3 — Live migration

```bash
wp eval '
$ok = dinoco_sn_install_schema();
echo $ok ? "LIVE OK\n" : "LIVE FAIL\n";
echo "Post-version: " . get_option("dinoco_sn_schema_version") . "\n";
'
```

**Expected**:
- Output: `LIVE OK` + `Post-version: 1.2`
- รัน < 30 วินาที (ที่ row count < 100k)
- GET_LOCK acquired/released cleanly (no orphan lock)
- รันซ้ำได้ idempotent — รันครั้งที่ 2 = no-op + return OK

### Step 4 — Verify new indexes

```bash
wp eval '
$wpdb = $GLOBALS["wpdb"];
$indexes = $wpdb->get_results("SHOW INDEX FROM wp_dinoco_sn_notifications");
foreach ($indexes as $i) echo $i->Key_name . " - " . $i->Column_name . "\n";
'
```

**Expected output**:
```
uq_dedup - notification_type
uq_dedup - user_id
uq_dedup - sn
uq_dedup - scheduled_at
idx_user_status - user_id
idx_user_status - status
idx_sn_action - sn
idx_sn_action - action
idx_scheduled_at - scheduled_at
```

### Rollback SQL (ถ้า migration ทำให้ระบบล่ม)

```sql
-- 1. Drop new indexes
ALTER TABLE wp_dinoco_sn_notifications DROP INDEX uq_dedup;
ALTER TABLE wp_dinoco_sn_notifications DROP INDEX idx_user_status;
ALTER TABLE wp_dinoco_sn_notifications DROP INDEX idx_sn_action;
ALTER TABLE wp_dinoco_sn_notifications DROP INDEX idx_scheduled_at;

-- 2. Restore legacy 3-col uniq_dedup
ALTER TABLE wp_dinoco_sn_notifications
    ADD UNIQUE KEY uniq_dedup (notification_type, user_id, sn);

-- 3. Revert schema_version
UPDATE wp_options SET option_value = '1.1'
WHERE option_name = 'dinoco_sn_schema_version';
```

หรือ restore mysqldump:
```bash
mysql wp_dinoco_prod < /backup/sn-prew7-YYYYMMDD_HHMMSS.sql
```

### Owner sign-off — Schema migration

- [ ] Pre-deploy backup verified
- [ ] Dry-run output shows `Pre-version: 1.1` + no errors
- [ ] Live migration completes < 30s
- [ ] All 9 index columns present
- [ ] Schema version = "1.2"
- [ ] Boss + Tech Lead present
