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

ทำในเครื่อง local ที่มี repo clone (ไม่ใช่บน production server):

```bash
cd /Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End

# WP snippet files don't have .php extension — search all files except specific dirs
# Pattern matches: post_type=b2f_maker_product, 'b2f_maker_product' literal, get_posts/get_post_type calls
grep -rln "b2f_maker_product" . \
  --exclude-dir=node_modules \
  --exclude-dir=_archive-superseded \
  --exclude-dir=docs \
  --exclude-dir=.git \
  --exclude="*.md" \
  2>/dev/null
```

**Expected ALLOWED hits**:
- `[B2F] Snippet 0: CPT & ACF Registration` (CPT register_post_type — needed until Step 7)
- `[B2F] Snippet 0.5: Maker Product Dual-Write` (dual-write hook — kept until shadow_write OFF)
- `[Admin System] B2F Migration Audit` (audit/parity tools — kept for monitoring)
- `[B2F] Snippet 2: REST API` (HAS fallback path when `b2f_flag_read_from_junction=false`)

**⚠️ Snippet 2 fallback caveat** — เพราะ Snippet 2 อ่าน CPT ใน fallback path ถ้า `b2f_flag_read_from_junction` ถูก revert ระหว่างทำ Step 6 → API จะคืน 0 rows ทันที. **Add explicit verify ก่อน Step 6** (see Step 5.5 below).

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

### 1.1 — Full junction + CPT dump

**ใช้ WP CLI (recommended — ปลอดภัยกว่า grep cut)** — `wp db` รัน mysqldump โดยอ่าน credentials จาก wp-config.php ตรงๆ ผ่าน WP loader, ไม่ต้อง parse password manually:

```bash
# SSH เข้า server
ssh root@<wp-server>
mkdir -p /var/backups/b2f-cpt-retirement-2026-05-16
cd /var/backups/b2f-cpt-retirement-2026-05-16

# Path WP install (adjust ถ้า path ต่างจากนี้)
WP_PATH=/var/www/dinoco.in.th

# Backup junction tables (canonical) — wp db cli auto-loads credentials
wp --path=$WP_PATH db export junction-tables-2026-05-16.sql \
  --tables=wp_dinoco_product_makers,wp_dinoco_maker_product_observations

# Backup CPT posts + postmeta
wp --path=$WP_PATH db export cpt-posts-2026-05-16.sql \
  --tables=wp_posts \
  --where="post_type='b2f_maker_product'"

wp --path=$WP_PATH db export cpt-postmeta-2026-05-16.sql \
  --tables=wp_postmeta \
  --where="post_id IN (SELECT ID FROM wp_posts WHERE post_type='b2f_maker_product')"

# Verify sizes — ต้องไม่ใช่ 0 bytes
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
# Quick gzip layer check
gunzip -t b2f-cpt-retirement-2026-05-16.tar.gz && echo "Tarball OK"

# List contents
tar -tzf b2f-cpt-retirement-2026-05-16.tar.gz
# Expected: 3 .sql files listed

# Verify each SQL file actually contains valid SQL (not error message)
for f in *.sql; do
  echo "=== $f ==="
  head -5 "$f"
  echo "..."
  tail -3 "$f"
  wc -l "$f"
done
# Expected per file:
#   Lines start with "-- MySQL dump" / "-- Host:" / etc.
#   File size > 1KB (junction can be small but >0)
#   Last lines: "-- Dump completed on ..." or trailing INSERT

# Sanity check row count matches DB
echo "=== Row count sanity ==="
grep -c "^INSERT INTO" cpt-posts-2026-05-16.sql || echo "0 INSERT lines (multi-row INSERT pattern)"

# Test restore on staging DB (optional but recommended)
# wp --path=$STAGING_WP_PATH db import junction-tables-2026-05-16.sql
# wp --path=$STAGING_WP_PATH db query "SELECT COUNT(*) FROM wp_dinoco_product_makers"
```

⚠️ **DO NOT proceed to Step 2** until all 3 .sql files verified non-empty + valid SQL syntax.

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

## Step 5.5 — Pre-DROP flag verification (MANDATORY, ~1 min)

⚠️ **ก่อนทำ Step 6** — ยืนยันว่า `b2f_flag_read_from_junction` ยัง ON. ถ้า flag ถูก revert (accident หรือ rollback) → Snippet 2 V.10.0+ จะ fallback อ่าน CPT → ตอนนี้ CPT ถูก soft-delete อยู่ → API จะคืน 0 makers → LIFF B2B B2F E-Catalog + Admin Makers tab จะแสดงข้อมูลว่าง

```bash
# Verify flag is ON
wp --path=$WP_PATH option get b2f_flag_read_from_junction
# Expected: '1'

# Also verify shadow_write is OFF (per Step 2)
wp --path=$WP_PATH option get b2f_flag_shadow_write
# Expected: '0'
```

ถ้าผลไม่ตรง → **STOP, restore Step 2 state + investigate** ก่อนทำต่อ.

นอกจากนี้ smoke test endpoint อ่านจริง:

```bash
# Should return non-empty array
curl -sH "X-WP-Nonce: ADMIN_NONCE" -H "Cookie: ..." \
  "https://dinoco.in.th/wp-json/b2f/v1/makers" | jq '.data | length'
# Expected: > 0 (number of makers in junction)
```

ถ้าได้ 0 → API ทำงานผิด — investigate ก่อน DROP

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

## Audit notes

This runbook was **revised V.2 (2026-05-17)** after audit found V.1 had:

- ❌ Fragile DB password extraction via `grep DB_USER ... | cut -d "'" -f 4` (failed silently with double-quote configs → 0-byte backup) → replaced with `wp db export` (safer)
- ❌ Grep pattern `--include="\[*\]*"` worked on macOS but not on remote Linux ssh → simplified to `grep -rln "b2f_maker_product" .`
- ❌ `gunzip -t` only validated gzip layer, not SQL content → added `head`/`tail`/`grep INSERT` verify per file
- ❌ Missing pre-DROP flag verification (Snippet 2 has CPT fallback path → if flag reverted mid-runbook, soft-deleted CPT returns 0 makers to LIFF) → added Step 5.5 mandatory flag verify

V.2 corrected to wp-cli safer commands + content verification + Step 5.5 flag guard. Verified flag names + Snippet 2 fallback path via grep against `[B2F] Snippet 2: REST API` V.10.0+.
