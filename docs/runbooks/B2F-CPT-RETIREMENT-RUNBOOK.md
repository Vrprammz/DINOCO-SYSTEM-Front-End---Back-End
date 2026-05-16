# B2F Maker Product CPT Retirement — Runbook

[← Runbooks index](../)

> **Status**: Ready to execute · Boss decision approved 2026-05-16 (#3 = "ลบ")
> **⚠️ DESTRUCTIVE** — DROP TABLE operations after backup
> **Pre-req**: SSH + mysql access + WP admin · BACKUP MANDATORY
> **Time to complete**: ~30-45 นาที (backup ~15 min, drop ~5 min, verify ~15 min)
> **Risk**: High ถ้าไม่ backup, Low ถ้า backup + verify ตามขั้นตอน
> **Wait period**: ผ่านแล้ว — 14 วันหลัง junction cut-over 2026-04-18 = 2026-05-02 ขึ้นไป (วันนี้ 2026-05-16 = day 28+ safe margin)

---

## บริบท

B2F Maker Products migration (Phase 1-4) เสร็จสมบูรณ์เมื่อ 2026-04-17/18:
- Legacy: `b2f_maker_product` CPT (drift-prone dual source of truth)
- Canonical: `wp_dinoco_product_makers` junction table (1:N product × maker)

หลัง cut-over (2026-04-18) ระบบอ่าน-เขียน junction 100%. CPT data ยังคงอยู่ใน `wp_posts` + `wp_postmeta` แค่ **dead data** กิน DB space ไม่ใช้งานแล้ว.

### Pre-retirement state

| Component | Status |
|---|---|
| `b2f_flag_shadow_write` | ON (2026-04-16) — dual-write CPT + junction |
| `b2f_flag_read_from_junction` | ON (2026-04-18) — reads use junction |
| Junction table count | ~120+ rows |
| CPT (`b2f_maker_product`) post count | ~120+ posts (mirror of junction via shadow_write) |
| Days since cut-over | 28+ days |
| Production incidents related to junction | 0 |

### What we'll do today

1. **Backup** — full mysqldump of junction + CPT data (recovery insurance)
2. **Disable shadow_write** — stop new CPT writes (junction-only mode)
3. **Verify** — 1 week observation window (parallel run check) — *boss can skip if wants*
4. **Soft-delete CPT** — move posts to trash (recoverable for 30 days)
5. **Wait grace period** — 7 days in trash
6. **Hard delete** — empty trash + DROP unused indices
7. **Drop dead code** — remove dual-write helper snippet (V.10.x → V.10.y)

## Risks + safety controls

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Junction data corruption discovered post-DROP | Very Low | Critical | Full mysqldump backup before each step |
| Some code still reads CPT directly | Low | Medium | Pre-step grep audit + monitoring 7 days |
| Foreign-key cascade unexpected | Very Low | Medium | Junction has no FK to CPT post_id (validated) |
| Order history (`po_items` ACF) references CPT post_id | Low | High | Pre-step verify — ACF stores snapshot, not live ref |
| Webhook sync engine confusion (snippet sync) | Low | Low | Snippet code stays — only DB tables change |

## Pre-flight checks (MANDATORY)

### Check 1 — Junction has all the data

```sql
-- Count comparison
SELECT
  (SELECT COUNT(*) FROM wp_posts WHERE post_type = 'b2f_maker_product' AND post_status = 'publish') AS cpt_count,
  (SELECT COUNT(*) FROM wp_dinoco_product_makers WHERE deleted_at IS NULL) AS junction_count;
```

**Expected**: junction_count ≥ cpt_count (junction may have orphan SETs auto-synced)

```sql
-- Verify no CPT row missing from junction
SELECT p.ID, p.post_title
FROM wp_posts p
WHERE p.post_type = 'b2f_maker_product'
  AND p.post_status = 'publish'
  AND NOT EXISTS (
    SELECT 1 FROM wp_dinoco_product_makers j
    WHERE j.legacy_cpt_id = p.ID
  );
```

**Expected**: 0 rows (every CPT mirrored in junction)

ถ้ามี rows ออกมา → **STOP** — สอบสวนก่อนทำต่อ

### Check 2 — No code reads CPT directly

```bash
cd /Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End

# Direct WP_Query for b2f_maker_product CPT
grep -rln "post_type.*b2f_maker_product\|'b2f_maker_product'" \
  --include="*.php" --include="\[*\]*" 2>/dev/null | grep -v _archive

# get_posts() with b2f_maker_product
grep -rln "get_posts.*b2f_maker_product\|get_post_type.*b2f_maker_product" \
  --include="*.php" --include="\[*\]*" 2>/dev/null
```

**Expected**: Only `[B2F] Snippet 0` (CPT registration) + `[B2F] Snippet 0.5` (dual-write hook) + `[Admin System] B2F Migration Audit` (reads CPT for parity/drift checks)

ถ้ามี snippet อื่น reading CPT → ต้อง migrate ก่อน

### Check 3 — Order history doesn't reference CPT post_id

```sql
-- Sample: check po_items ACF doesn't store post_id of b2f_maker_product
SELECT meta_key, COUNT(*) AS row_count
FROM wp_postmeta
WHERE meta_key LIKE 'po_items%maker_product%' OR meta_key LIKE 'poi_maker%'
GROUP BY meta_key
ORDER BY row_count DESC
LIMIT 10;
```

→ ตรวจว่าไม่มี FK ที่จะ break

### Check 4 — Sync engine status

`/dinoco-sync-dashboard/` → ไม่มี snippet ค้าง error

## Step 1 — Backup (MANDATORY, ~15 min)

### 1.1 — Full junction + CPT mysqldump

```bash
# SSH เข้า server, cd ที่ working dir
ssh root@<wp-server>
mkdir -p /var/backups/b2f-cpt-retirement-2026-05-16
cd /var/backups/b2f-cpt-retirement-2026-05-16

# DB credentials from wp-config.php
DB_USER=$(grep DB_USER /var/www/dinoco.in.th/wp-config.php | cut -d "'" -f 4)
DB_PASS=$(grep DB_PASSWORD /var/www/dinoco.in.th/wp-config.php | cut -d "'" -f 4)
DB_NAME=$(grep DB_NAME /var/www/dinoco.in.th/wp-config.php | cut -d "'" -f 4)

# Backup junction table (canonical)
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  wp_dinoco_product_makers \
  wp_dinoco_maker_product_observations \
  > junction-tables-2026-05-16.sql

# Backup CPT data (posts + postmeta for b2f_maker_product)
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  --where="post_type='b2f_maker_product'" wp_posts \
  > cpt-posts-2026-05-16.sql

mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  --where="post_id IN (SELECT ID FROM wp_posts WHERE post_type='b2f_maker_product')" wp_postmeta \
  > cpt-postmeta-2026-05-16.sql

# Verify sizes
ls -lh
# Expected: junction ~50KB, cpt-posts ~50KB, cpt-postmeta ~500KB-1MB
```

### 1.2 — Copy backup off-server (recommended)

```bash
# Tarball + scp to local
tar -czf b2f-cpt-retirement-2026-05-16.tar.gz *.sql
# Copy to local machine (ทำจาก local)
scp root@<wp-server>:/var/backups/b2f-cpt-retirement-2026-05-16/b2f-cpt-retirement-2026-05-16.tar.gz \
    ~/Backups/dinoco/
```

### 1.3 — Verify backup integrity

```bash
# Quick sanity check
gunzip -t b2f-cpt-retirement-2026-05-16.tar.gz && echo "Tarball OK"
tar -tzf b2f-cpt-retirement-2026-05-16.tar.gz
# Expected: 3 .sql files listed

# Test restore on staging DB (optional but recommended)
mysql -u staging_user -p staging_db < junction-tables-2026-05-16.sql
# verify junction data round-trips
```

## Step 2 — Disable shadow_write (1 min)

ก่อน DROP CPT, หยุด dual-write — ป้องกัน new posts สร้างขณะกำลังลบ

```bash
wp option update b2f_flag_shadow_write '0'
```

หรือ SQL:
```sql
UPDATE wp_options SET option_value = '0' WHERE option_name = 'b2f_flag_shadow_write';
```

**Verify**: B2F Migration Audit dashboard → "Shadow Write Status" = OFF

## Step 3 — (Optional) 1-week parallel observation

Boss สามารถข้ามได้ ถ้าต้องการลบทันที. แต่ถ้าให้ safety margin:

- Day 0 (today): Step 1+2 done
- Day 1-7: ดูว่ามี customer/admin complaint หรือไม่
  - ลูกค้า LIFF B2F E-Catalog ทำงานปกติ?
  - Admin Makers tab + Products modal ทำงานปกติ?
  - PO creation flow ทำงานปกติ?
  - Cron jobs B2F (observations TTL, diff hourly) ทำงานปกติ?
- Day 7: ถ้าไม่มี issue → ไป Step 4

ถ้า boss skip — ไป Step 4 ตอนนี้เลย (Step 1+2 done = ปลอดภัยพอ เพราะมี backup + junction proven 28+ days)

## Step 4 — Soft-delete CPT posts (move to trash, ~5 min)

```sql
-- Move all b2f_maker_product posts to trash
UPDATE wp_posts
SET post_status = 'trash',
    post_modified = NOW(),
    post_modified_gmt = UTC_TIMESTAMP()
WHERE post_type = 'b2f_maker_product'
  AND post_status = 'publish';

-- Verify
SELECT post_status, COUNT(*) FROM wp_posts WHERE post_type = 'b2f_maker_product' GROUP BY post_status;
-- Expected: trash = ~120, publish = 0
```

Posts ยังอยู่ใน DB แค่ trash → recoverable ภายใน 30 days (WP default)

**Monitoring**: 7 วันแรก — ดูว่ามี code path ใดพังเพราะหา publish posts ไม่เจอ

## Step 5 — Wait grace period (7 days recommended)

Day 0 = soft-delete
Day 7 = ตรวจ — ถ้าไม่มี issue → Step 6

ถ้าเจอ issue ใน 7 days → restore:
```sql
UPDATE wp_posts SET post_status = 'publish'
WHERE post_type = 'b2f_maker_product' AND post_status = 'trash';
UPDATE wp_options SET option_value = '1' WHERE option_name = 'b2f_flag_shadow_write';
```

(Plus debug code issue)

## Step 6 — Hard delete CPT (~5 min)

หลัง grace period ผ่าน safely:

```sql
START TRANSACTION;

-- Delete postmeta first (FK relationship)
DELETE pm FROM wp_postmeta pm
INNER JOIN wp_posts p ON p.ID = pm.post_id
WHERE p.post_type = 'b2f_maker_product' AND p.post_status = 'trash';

-- Delete posts
DELETE FROM wp_posts
WHERE post_type = 'b2f_maker_product' AND post_status = 'trash';

-- Verify count = 0
SELECT COUNT(*) FROM wp_posts WHERE post_type = 'b2f_maker_product';
-- Expected: 0

-- If OK
COMMIT;
-- If wrong
ROLLBACK;
```

## Step 7 — Drop dual-write helper snippet (~5 min)

ใน WP admin → Code Snippets → ค้นหา `[B2F] Snippet 0.5: Maker Product Dual-Write`

**Option A**: Deactivate snippet (เก็บ code, ไม่ run) — แนะนำ
- คลิก Deactivate
- รอ 1-2 weeks → ถ้ายังไม่มี issue → Delete

**Option B**: Delete snippet (permanent)
- คลิก Delete in WP UI
- Sync engine จะ remove จาก wp_snippets

หรือลบ DB_ID matching จาก GitHub repo:
```bash
# Move file to archive (not delete — preserves git history)
mkdir -p _archive-superseded
git mv "[B2F] Snippet 0.5: Maker Product Dual-Write" _archive-superseded/
git commit -m "chore(b2f): retire dual-write helper after CPT cleanup (snippet 0.5 archived)"
git push origin main
```

## Step 8 — Update flags + docs

```bash
# Reflect final state
wp option update b2f_flag_shadow_write '0'              # already done in Step 2
wp option update b2f_flag_read_from_junction '1'        # confirm still ON
wp option delete b2f_schema_v10_activated               # optional cleanup marker
```

Update docs:
- `CLAUDE.md` — add note "CPT retired 2026-05-XX, junction-only since"
- `docs/sn-system/34-phase6-backlog-tracker.md` — mark "B2F CPT retirement" done
- `B2F-ARCHITECTURE-PLAN.md` — note Phase 4 complete

## Verification checklist (post-retirement)

- [ ] `SELECT COUNT(*) FROM wp_posts WHERE post_type='b2f_maker_product'` = 0
- [ ] Admin Dashboard "Makers" tab loads (reads junction)
- [ ] LIFF B2F E-Catalog loads products (reads junction)
- [ ] Admin can edit Maker Product → save → write to junction only
- [ ] Create new PO → uses junction prices + MOQ
- [ ] B2F cron (`b2f_diff_cron_hourly`, `b2f_observations_ttl_cron`) runs without error
- [ ] Snippet 0.5 deactivated or archived
- [ ] Backup file safe in `/var/backups/` + off-server copy

## Emergency rollback (within 7 days of Step 6)

ถ้าเกิด issue ร้ายแรงหลัง hard delete:

```bash
# Restore from backup
cd /var/backups/b2f-cpt-retirement-2026-05-16
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < cpt-posts-2026-05-16.sql
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < cpt-postmeta-2026-05-16.sql

# Re-activate shadow_write
wp option update b2f_flag_shadow_write '1'

# Re-activate dual-write snippet (Step 7 Option A reverse)
```

หลัง 7 days: rollback ยังทำได้ — backup ไม่หาย แค่ต้อง manual SQL import

## Boss decision points (ระหว่างทำ)

ผมจะ pause + ถามบอสที่:
1. **หลัง Step 1 (backup done)** — โอเคไป Step 2 ไหม?
2. **หลัง Step 2 (shadow_write off)** — รอ 1 สัปดาห์หรือทำต่อ Step 4 ตอนนี้?
3. **หลัง Step 4 (soft delete)** — รอ 7 days แล้วค่อยทำ Step 6 (recommended)
4. **ก่อน Step 6 (hard delete)** — confirm final?

## Related files

- [`[B2F] Snippet 0`](../../%5BB2F%5D%20Snippet%200%3A%20CPT%20%26%20ACF%20Registration) (CPT registration — will remove after Step 7)
- [`[B2F] Snippet 0.5`](../../%5BB2F%5D%20Snippet%200.5%3A%20Maker%20Product%20Dual-Write) (will deactivate/archive in Step 7)
- [`[Admin System] B2F Migration Audit`](../../%5BAdmin%20System%5D%20B2F%20Migration%20Audit) V.3.X (audit tools)
- `B2F-ARCHITECTURE-PLAN.md` (Option F 4-phase plan)
- `B2F-SCHEMA-V10.sql` (junction canonical schema)
