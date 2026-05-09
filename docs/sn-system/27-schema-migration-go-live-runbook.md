# 27 — Schema Migration Go-Live Runbook (Boss-runnable, 5 minutes)

**Status**: Boss directive 2026-05-09 = "เริ่มลย" (start now). This runbook is the complete step-by-step โดยใช้ WP-CLI ที่ทีมเตรียมไว้แล้ว (migrate-schema.php V.1.1).

**Why Boss runs (not Claude)**: Migration ต้องการ SSH + DB credentials บน production server. Claude/AI assistant ไม่มี access. Boss SSH + รัน 3 commands → เสร็จ.

**Risk level**: 🟢 LOW with `--online` flag (uses `pt-online-schema-change` — concurrent INSERTs ทำได้ระหว่างรัน). Estimated downtime: **0 seconds**.

---

## Pre-flight (1 minute) — ตรวจก่อนรัน

```bash
# SSH เข้า production server
ssh dinoco@<production-host>

# Navigate to WP root
cd /var/www/dinoco.in.th  # หรือ path ของบอส

# Check WP-CLI works
wp --info | head -5

# Check current schema version (optional, verify state)
wp option get dinoco_sn_schema_version
# Expected: 1.1 (or empty if SN system not yet bootstrapped)
```

---

## Step 1 — Dry Run (1 minute, NO writes)

```bash
wp dinoco-sn migrate-schema --version=1.2 --dry-run
```

**Expected output**:
```
Pre-flight check
  Current schema version: 1.1
  Target version:         1.2
  Row count:              <number>
  Estimated duration:     <minutes>
  uq_dedup collisions:    0
  Active sessions (5min): <number>

Migration plan
  - ALTER TABLE wp_dinoco_sn_pool ADD COLUMN ...
  - ALTER TABLE wp_dinoco_sn_audit ADD INDEX ...
  - ...

DRY-RUN MODE — no changes applied.
Run with --execute --online to apply.
```

**Decision tree**:
- ✅ Row count < 100K → **Step 2 in-place** (faster, ~2-5 min)
- ✅ Row count ≥ 100K → **Step 2 online** (zero-downtime, ~10-30 min)
- ❌ uq_dedup collisions > 0 → **STOP** — call team
- ❌ Active sessions > 0 + want in-place → use --online แทน

---

## Step 2 — Execute Migration

### Option A: In-place (low row count, < 100K)

```bash
wp dinoco-sn migrate-schema --version=1.2 --execute
```

**During execution**:
- Admin pages may freeze 15-30 sec
- INSERT/UPDATE คำสั่ง queue + รันต่อหลังเสร็จ
- LINE bot ยังตอบลูกค้าได้ (ไม่กระทบ)

### Option B: Online via pt-osc (≥ 100K rows or want zero-downtime — RECOMMENDED)

```bash
wp dinoco-sn migrate-schema --version=1.2 --execute --online --auto-rollback
```

**During execution**:
- ZERO downtime
- INSERTs continue normally
- Triggers backfill old → new schema
- หาก fail → auto-rollback restores from snapshot

**Output progresses**:
```
[10:02:03] Starting online migration (pt-online-schema-change)
[10:02:05] Snapshot saved: /tmp/sn-pool-snap-2026-05-09-1002.sql.gz (24MB)
[10:02:30] pt-osc: Created table _sn_pool_new
[10:02:31] pt-osc: Altered _sn_pool_new
[10:02:35] Copying rows: 10000 / <total> (5%)
[10:02:55] Copying rows: 50000 / <total> (25%)
...
[10:08:42] pt-osc: Swapping tables
[10:08:43] Done. Schema version 1.1 → 1.2.
[10:08:44] Audit row #<id> recorded.
```

---

## Step 3 — Verify (30 seconds)

```bash
# Verify schema version flipped
wp option get dinoco_sn_schema_version
# Expected: 1.2

# Verify new column exists (sample — actual column depends on 1.1→1.2 delta)
wp db query "SHOW CREATE TABLE wp_dinoco_sn_pool\G" | grep -E "^\s+\`(prev_status|lock_version|claim_id|legacy_request_id)"

# Verify smoke (5 specs would run here on staging — production-side just check):
wp dinoco-sn migrate-schema --version=1.2 --dry-run | grep "Already at target"
# Expected: "Schema already at version 1.2 — nothing to do."
```

---

## Rollback (if anything looks wrong)

### Auto rollback (if used --auto-rollback flag)
ถ้า migration fail → ระบบ restore snapshot อัตโนมัติ. ไม่ต้องทำอะไร.

### Manual rollback
```bash
# Restore from snapshot taken at Step 2
gunzip < /tmp/sn-pool-snap-2026-05-09-1002.sql.gz | wp db cli

# Or use repo's rollback SQL:
wp db cli < scripts/sn-system/rollback-schema.sql

# Verify reverted
wp option get dinoco_sn_schema_version
# Expected: 1.1
```

---

## Post-migration (5 minutes)

1. **Smoke test admin command center**:
   - Open `https://dinoco.in.th/admin-command-center?tab=production_sn`
   - Verify 5 tabs load (Batches/รับเพลท/Pool/จัดการ S/N/Audit)
   - Click "Batches" → see batch list (ถ้ามี) without 500 error

2. **Smoke test customer LIFF**:
   - Open `https://dinoco.in.th/warranty/activate?sn=DNCSSTEST00000001` (test plate)
   - Verify "ยังไม่พร้อมลงทะเบียน" page renders (not 500)

3. **Check Sentry / observability**:
   - Open Sentry → DINOCO project → filter `tag:context sn_*` last 1h
   - Expected: 0 new errors related to schema

4. **Notify ทีม + ข้อ 4 KPI baseline**:
   - หลัง migration ผ่าน → บอสรัน KPI baseline measurement (ดู `13-kpi-baseline-measurement-plan.md`)
   - 7-day baseline ก่อน flip flag F1 ON

---

## Common errors

| Error | Meaning | Action |
|---|---|---|
| `MySQL version too low` | Server < 5.7 | Upgrade MySQL or use mysqldump backup workflow |
| `pt-osc not installed` | Percona toolkit missing | `apt install percona-toolkit` หรือ use `--execute` (in-place) |
| `Active sessions > 0` | Live admin sessions | Wait 5 min หรือใช้ `--online` flag |
| `uq_dedup collisions: N>0` | Duplicate notifications row | Run `POST /flag-audit/cleanup-duplicates` first |
| `Permission denied` | DB user can't ALTER | Check DB user GRANTs: `ALTER, INDEX, CREATE` needed |

---

## Timing

| Schema state | Recommended path | Duration | Downtime |
|---|---|---|---|
| Fresh install (0 rows) | `--execute` (in-place) | 1-2 sec | 0s |
| < 10K rows | `--execute` (in-place) | 30 sec | <5s admin freeze |
| 10K-100K rows | `--execute --online` (pt-osc) | 1-3 min | 0s |
| > 100K rows | `--execute --online --auto-rollback` | 5-30 min | 0s |
| > 1M rows | Off-hours window 02:00-04:00 + `--online --auto-rollback` | 30-60 min | 0s |

**บอสน่าจะอยู่ในกลุ่ม < 10K rows** (ระบบยังไม่ launch — sn_pool ตอนนี้น่าจะ empty) → in-place 30 sec OK.

---

## After migration succeeds

1. Update `07-boss-decisions-log.md` Round 4 entry: schema 1.1 → 1.2 done @ <timestamp>
2. Update `26-operations-pending-decisions.md` Item 7 → ✅
3. Notify ทีมใน LINE: "Schema migration done — KPI baseline เริ่มได้"
4. Boss starts KPI baseline measurement (Item 3) → ใช้ `13-kpi-baseline-measurement-plan.md`

---

_Last updated: 2026-05-09 — boss directive "เริ่มลย"_
_File: docs/sn-system/27-schema-migration-go-live-runbook.md_
