# DINOCO B2F Maker Product Architecture — Deep Plan

> Status: **DRAFT — ROUND 2 (reconsidered)**
> Author: Tech Lead (synthesized from 4 sub-agent perspectives)
> Date: 2026-04-15
> Decision owed: User approval before any migration work begins
> Prior recommendation (round 1): Option A (hook-based auto-sync) — **now superseded**

---

## Executive Summary (≤200 words)

ระบบ B2F ใช้ข้อมูลสินค้าจาก **2 แหล่งคู่ขนาน** — `wp_dinoco_products` (custom table, source of truth) + `b2f_maker_product` CPT (per-maker price/MOQ/lead time) — ทำให้เกิด **data drift** ต้องแก้ซ้ำตลอด 72 ชม. ที่ผ่านมา (8 commits V.9.11→V.9.19 ไล่แก้ virtual SET, filter NX500, ui_role_override mismatch). ปัญหาหลักคือ CPT pattern (WP posts + postmeta) ไม่เหมาะกับ association table ที่ต้อง JOIN กับ custom table ทำให้ query N+1, classification logic ซ้ำซ้อน, manual registration error-prone.

**คำแนะนำใหม่: Option F (Hybrid — normalize แต่ shadow-write CPT ไว้ก่อน)** แทน Option A เดิม. เหตุผลสามข้อหลัก (1) จบ dual source of truth ถาวร — ไม่ใช่แค่เพิ่ม auto-sync ทับ (2) migration risk ต่ำเพราะ shadow-write 1 เดือน + feature flag switch (3) performance จริง (1 JOIN vs N+1) แก้ root cause ไม่ใช่ symptom.

**แผน**: 4 phases × 1-5 วัน/phase = ~3 สัปดาห์ calendar. Phase 0 (baseline export — ไฟล์นี้ + snippet V.1.0) **เสร็จแล้ว**. Phase 1-4 รอ user approve.

---

## Section 1: Current State (verified)

### 1.1 Data volume (จะ confirm ด้วย baseline export)

| Entity | Storage | Row count (approx) |
|--------|---------|---------------------|
| Products (global) | `wp_dinoco_products` (custom table) | ~153 rows (ยืนยันจาก `/health`) |
| SKU relations (parent→children) | `wp_options` key `dinoco_sku_relations` | ~20-40 parents |
| Maker products (per-maker price) | `b2f_maker_product` CPT + postmeta | ประมาณ 200-500 rows |
| Makers | `b2f_maker` CPT + postmeta | ประมาณ 5-15 |

> Exact numbers ได้หลัง run `GET /dinoco-export/v1/health` บน prod

### 1.2 Known bug pattern (last 72 hours — 8 commits trying same fix area)

```
e5afff8  V.9.19  opt-in virtual SET injection         ← revert of revert of revert
f8fdec4  V.9.18  SET cost auto-compute sum(leaves)    ← stale mp_unit_cost drift
d5c450a  V.9.17  revert virtual SET + respect ui_role_override
db209cf  V.9.16  virtual SET cost = sum(children)     ← UX band-aid
a032197  V.9.15  cleanup temp debug + virtual SET polish
a88d69f  V.9.14  virtual SET injection (NX500 missing)
60b927d  V.9.13  debug endpoint maker-catalog diagnosis
444a7c7  V.6.0   Admin Makers Product Picker refactor
```

**Pattern**: ทุกครั้งที่ admin ลืม register SET ใน maker → frontend ต้องมี band-aid (virtual injection) → band-aid ทำ ui_role_override แตก → revert → user เจอ edge case ใหม่ → add opt-in flag. **Root cause ไม่ใช่ code — root cause คือ data model forcing manual maintenance**.

### 1.3 Pain points (5 core)

1. **Dual source of truth** — `wp_dinoco_products` (global) กับ `b2f_maker_product` CPT (per-maker) ไม่ reference กัน ด้วย FK ชัดเจน. เวลา admin แก้ราคา retail ใน Product Catalog → CPT ไม่รู้ → แสดง stale data (`฿666` ที่ user เจอ)
2. **Manual SET registration** — admin ต้อง register SET ของ maker ให้ครบทุก SET ที่ maker ผลิตได้ → ถ้าลืม → NX500 E-clutch filter เจอ 1 SET (จริงๆ maker ทำได้ 5). V.9.14-V.9.19 คือการไล่แก้ UX symptom ของปัญหานี้
3. **Stale data ค้างใน ACF postmeta** — ACF คงค่าเดิมไว้แม้ custom table update แล้ว. ไม่มี UI ให้ลบ postmeta เฉพาะ field
4. **Virtual SET runtime walk** — `b2f_format_maker_product()` + `b2f_build_hierarchy_context()` + `catalog_map` enrichment = query + compute ทุก API call. ทุก PO create / maker-products list / LIFF catalog load กิน CPU ซ้ำ
5. **CPT architecture mismatch** — CPT = WP posts (1 row + many postmeta rows). Query "ทุก product ของ maker X" = `meta_query` on `mp_maker_id` → full table scan postmeta. N+1 ชัด: 1 CPT post × 8 postmeta rows × N products = ~1,500-4,000 SELECTs per makers-tab page load

### 1.4 Performance baseline (estimated, ยืนยันด้วย Query Monitor หลัง baseline export)

| Operation | Current | Projected (Option F after migrate) |
|-----------|---------|-------------------------------------|
| `GET /b2f/v1/maker-products?maker_id=X` | ~300-800ms (~1,500 SQL) | ~40-80ms (1 JOIN + 1 relations option) |
| Admin Makers tab load (all makers × all products) | ~2-5s | ~200-400ms |
| PO create with 20 items (DD-7 expand) | ~400ms | ~80ms |

---

## Section 2: Options Re-evaluated

### Option A — Hook-based auto-sync (prior recommendation — **REJECTED on reconsideration**)

**Pros (short-term)**
- Non-invasive: CPT ยังอยู่ → admin UI, ACF forms ไม่ต้องแก้
- Rollback ง่าย: แค่ disable hook
- Time to deploy: 1-2 วัน

**Cons (long-term — ที่ทำให้เปลี่ยนใจ)**
- **Dual source ยังอยู่** — แค่ลด drift probability ไม่ได้ eliminate. hook fail silent = drift กลับมา
- Hook logic ซับซ้อน: `save_post` + `update_field` + `delete_post` + ต้อง reverse for deletion
- **Performance ไม่ดีขึ้นเลย** — N+1 queries ยังเหมือนเดิม เพราะยังอ่านจาก CPT
- CPT ยังเป็น "accidental association table" ซึ่งผิด pattern ตั้งแต่แรก
- 3 เดือนข้างหน้าจะเจอ bug category เดียวกัน (drift, stale, sync race) — เหมือน V.9.11-V.9.19 series

**Verdict**: ซ่อมที่ symptom ไม่ใช่ root cause. Long-term technical debt.

### Option C — Collapse CPT → canonical association table (**strong candidate**)

**Pros**
- **Single source of truth** — ต้นเหตุ data drift หายไป 100%
- **1 JOIN query** แทน `meta_query` + N+1
- Clean normalization: `dinoco_maker_products` (maker_id, sku, unit_cost, moq, lead_time_days, shipping_land, shipping_sea, status, created_at, updated_at)
- Future-proof: ง่ายต่อ reporting, BI, CSV bulk edit, API consumers
- Audit trail ง่าย: add `created_by`, `updated_by`, `updated_at` columns + versioning

**Cons**
- **Migration risk สูง** — ต้อง freeze writes ช่วง migrate + validate data
- ACF admin UI (wp-admin → CPT → edit post) หาย → ต้อง build custom form (หรือใช้ Snippet 5 Makers tab เดิมอยู่แล้ว)
- Consumer refactor มาก: Snippet 2 (all B2F REST), Snippet 5 (Admin tab), Snippet 0 (CPT registration — ต้อง retire)
- Effort: 1-2 สัปดาห์

**Verdict**: Right architecture, but migration risk บน live system ที่ process ~10 PO/day.

### Option D — Pure derivation (no maker-specific storage) — **REJECTED**

อ่าน prior analysis: maker-specific data (unit_cost, MOQ per maker) ต้องเก็บที่ไหนสักที่ — **ไม่มีทาง derive ได้**. Pricing varies per maker deal. Skip.

### Option F — Hybrid: normalize + shadow-write CPT (1-month observe) — **RECOMMENDED**

Idea: **ใช้ Option C architecture** แต่ migrate แบบปลอดภัย — shadow-write CPT ไว้ 1 เดือน เพื่อ rollback ได้ถ้าเจอ edge case

**Flow**
1. สร้าง table `dinoco_maker_products` (canonical)
2. **Backfill 1 ครั้ง**: CPT → table (idempotent, re-runnable)
3. **Dual-write phase** (2-4 สัปดาห์):
   - writes ไปทั้งสอง (table = primary, CPT = shadow)
   - reads ไปที่ table เป็น default + feature flag `B2F_LEGACY_CPT_READ=true` fallback ไป CPT
4. **Observe**: verification cron + daily diff report (table vs CPT) → Telegram alert ถ้า diff
5. **Cutover**: ถ้า 7 วันติดไม่มี diff → disable feature flag → reads ใช้ table only
6. **Retire CPT**: disable writes (keep rows as archive 3 เดือน) → eventually `wp_options` flag `B2F_CPT_RETIRED=true` → cron purge

**Pros**
- Single source เมื่อ migration เสร็จ (same as C)
- **Rollback safe**: 4-สัปดาห์ window ให้ CPT เป็น truth fallback
- **Zero downtime**: shadow write ขณะ live
- Performance benefit ได้ทันที phase 3 (reads จาก table)
- Migration validation เป็น automated (diff cron) ไม่ต้อง manual sweep

**Cons**
- Code 2 paths ระหว่าง dual-write phase (cleanup หลัง cutover)
- Effort: 2-3 สัปดาห์ (vs C = 1-2 สัปดาห์)
- ต้อง monitor ใกล้ชิด 1 เดือน

**Verdict**: เอา "right architecture" ของ C มา แต่ลด migration risk ด้วย observability + rollback window. Best for live prod system

### Scoring Matrix (weighted)

| Criteria | Weight | A (hook) | C (collapse) | F (hybrid) | D (derive) |
|----------|--------|----------|--------------|------------|------------|
| Correctness (eliminate drift) | 25% | 4 | 10 | 10 | — |
| Performance (query speed) | 15% | 2 | 10 | 10 | — |
| Admin UX | 20% | 8 | 7 | 7 | — |
| Migration risk (lower=better) | 25% | 10 | 5 | 8 | — |
| Maintainability (future) | 15% | 3 | 10 | 9 | — |
| **Weighted total** | **100%** | **5.5** | **8.25** | **8.85** | — |

> Scoring methodology: each option scored 1-10 per criterion, multiplied by weight, summed. Option F wins by 0.6pt margin driven by correctness + maintainability outweighing slightly higher effort.

---

## Section 3: Recommendation — **Option F (Hybrid Shadow-Write)**

### Why changed from Option A

**Original argument for A**: "non-invasive, rollback easy, time-to-deploy 1-2 days"

**Why that reasoning was flawed**:
- "Rollback easy" applies only to *deploy* rollback, not *design* rollback. Once hook is in production, undoing the dual-source architecture still requires Option C/F work — A delays the real fix
- "Non-invasive" = does not solve the problem, just routes around it
- Last 72h evidence (V.9.11-V.9.19, 8 commits) = symptom of dual-source drift. Option A would produce **identical** commit churn 3-6 months out

**Why F is better than pure C**:
- Same destination architecture
- +4 weeks observability window = catches data edge cases (shared child DD-3, ui_role_override, virtual SET) before point-of-no-return
- Aligned with existing DINOCO patterns — observability-first (learned from Sprint 3 M17 fix)

### Trade-offs accepted

- Accept 2-3 week implementation instead of 1-2 days (A)
- Accept transient code complexity (dual-write paths) for 4 weeks
- Accept one-time effort to build Admin form (replace ACF post edit UI) — but Snippet 5 Makers tab already has form, just need to remove CPT-specific plumbing

---

## Section 4: Implementation Plan (4 Phases)

### Phase 0: Baseline Export ✅ DONE (this commit)

- [x] `[Admin System] Product Catalog Export Tool` V.1.0 — new snippet
- [x] `.export/README.md` — usage instructions
- [x] `.gitignore` — allow `.export/*.{json,csv,txt}` commits, ignore `.tmp`
- Next: User runs curl → commits `.export/product-catalog-YYYYMMDD.*` files

**Rollback**: delete snippet. Zero impact on live system (read-only REST).

### Phase 1: Canonical Table + Backfill (3 days)

**Goals**: Create `wp_dinoco_maker_products` table + idempotent backfill script + feature flag

**Deliverables**
- New snippet `[B2F] Snippet 12: Maker Products Canonical Table` (or add to Snippet 0)
  - DDL: `id, maker_id, sku, unit_cost, moq, lead_time_days, shipping_land, shipping_sea, status, legacy_cpt_id (nullable), created_at, updated_at`
  - Unique key: `(maker_id, sku)`
  - Index: `maker_id`, `sku` separately
- `dinoco_b2f_backfill_maker_products()` — idempotent, re-runnable
- Admin-only REST: `POST /b2f/v1/admin/backfill-maker-products` (dry-run + execute modes)
- Feature flag constants:
  - `B2F_CANONICAL_READ` (default false) — reads from table
  - `B2F_CANONICAL_WRITE` (default false) — dual-write
  - `B2F_LEGACY_CPT_READ_FALLBACK` (default true) — fallback CPT if row missing
- Diff cron `dinoco_b2f_diff_cron` (twicedaily) → Telegram alert น้องกุ้ง

**Time estimate**: 3 days (1 day DDL + helpers, 1 day backfill + test, 1 day cron/alerts)

**Rollback**: drop table + delete snippet. CPT untouched throughout.

### Phase 2: Dual-Write + Observe (1 week elapsed, ~2 days coding)

**Goals**: turn on dual-write, observe diff for 7-14 days

**Deliverables**
- Snippet 5 V.7.0 Makers tab save handler dual-writes (table primary + CPT shadow if `B2F_CANONICAL_WRITE=true`)
- Snippet 0 V.4.0 ACF `save_post_b2f_maker_product` action → mirror to table (catches manual wp-admin edits)
- Diff cron reports:
  - rows in table but not in CPT
  - rows in CPT but not in table
  - rows with mismatched unit_cost / moq / status
  - zero diff → green flag for Phase 3

**Flag flip**: `B2F_CANONICAL_WRITE=true` → dual-write on

**Time estimate**: 2 days coding + **1 week observation**

**Rollback**: flip `B2F_CANONICAL_WRITE=false` → CPT resumes as single writer. Table becomes stale but harmless.

### Phase 3: Reads Switch-over (2 days coding + 1 week observe)

**Goals**: flip reads to table

**Deliverables**
- Snippet 2 V.10.0 `maker-products` / `maker-product` / `create-po` endpoints:
  - `SELECT * FROM dinoco_maker_products WHERE maker_id=?` (single query)
  - Remove `WP_Query + meta_query` path
  - Remove virtual SET injection band-aid (V.9.14-V.9.19) — now correct data always available
- Snippet 5 V.8.0 Makers tab: reads from table
- Snippet 8 V.6.0 LIFF E-Catalog: reads from table via API
- Remove `catalog_map` enrichment (V.9.11) — no longer needed because table has all data via single JOIN
- Keep `B2F_LEGACY_CPT_READ_FALLBACK=true` during this week (if row missing → CPT read)

**Flag flip**: `B2F_CANONICAL_READ=true`

**Time estimate**: 2 days coding + 1 week observation

**Rollback**: flip `B2F_CANONICAL_READ=false` → reads revert to CPT. Since dual-write still on, no data loss.

### Phase 4: CPT Retirement (2 days)

**Goals**: disable CPT writes, archive rows, clean up code

**Deliverables**
- `B2F_CANONICAL_WRITE=false` **but now meaning inverted** — rename to `B2F_CPT_WRITE_ENABLED=false`
- CPT posts set to `post_status=archive` (custom status) — queryable but not editable
- Snippet 0 V.5.0 ACF fields → removed (or kept read-only)
- Remove Snippet 2 `B2F_LEGACY_CPT_READ_FALLBACK` branch
- Add CSV import/export UI in Snippet 5 Makers tab (replaces ACF form for bulk ops)
- Documentation updates: CLAUDE.md, SYSTEM-REFERENCE.md, topic `dinoco-b2f-system.md`

**Flag flip**: `B2F_CPT_WRITE_ENABLED=false`

**Time estimate**: 2 days

**Rollback**: flip `B2F_CPT_WRITE_ENABLED=true` + `B2F_LEGACY_CPT_READ_FALLBACK=true`. Table + CPT sync could be up to 2 days stale, run diff cron to catch.

### Critical Path + Dependencies

```
Phase 0 (done)
  │
  ▼
Phase 1 (3d) ─────────► enables dual-write infrastructure
  │
  ▼
Phase 2 (2d + 1wk) ───► validates backfill correctness
  │
  ▼  (gate: 7 days zero diff)
  │
Phase 3 (2d + 1wk) ───► validates query/perf improvement
  │
  ▼  (gate: 7 days zero error logs on canonical path)
  │
Phase 4 (2d) ─────────► cleanup, retire CPT
```

Total: **3 weeks calendar** (7 active coding days + 2 weeks observation)

### Feature Flags (summary)

| Flag | Default | Purpose | Flip in Phase |
|------|---------|---------|---------------|
| `B2F_CANONICAL_READ` | false | Use table as read source | 3 |
| `B2F_CANONICAL_WRITE` | false | Dual-write to table | 2 |
| `B2F_LEGACY_CPT_READ_FALLBACK` | true | Fallback to CPT when table miss | disable in 4 |
| `B2F_CPT_WRITE_ENABLED` | true | Allow ACF/Admin writes to CPT | disable in 4 |

### Observability

- Diff cron twicedaily → Telegram `n2f_drift` channel (น้องกุ้ง)
- `dinoco_b2f_observations` MySQL table — row per read/write with source path (`canonical` vs `cpt`)
- Grafana-style dashboard card in Admin Dashboard (Phase 1+):
  - reads_canonical / reads_cpt_fallback ratio (target: 99%/1% end of Phase 3)
  - writes dual-success / write-drift count
  - backfill diff count
- Telegram alert rules:
  - write-drift > 0 → immediate
  - read-fallback > 5% → investigate
  - diff-cron > 10 rows → immediate

---

## Section 5: Migration Plan

### Pre-migration checklist

- [ ] Phase 0 export committed (baseline)
- [ ] DB backup verified (snapshot in Hetzner panel)
- [ ] Staging environment mirrors prod (if available)
- [ ] Telegram น้องกุ้ง alert channel `b2f_drift` registered
- [ ] User approval of this doc
- [ ] Freeze window scheduled (Phase 2 flip → low-traffic time, e.g., 09:00-09:15 Sunday)

### Data mapping (CPT → canonical table)

| CPT field (ACF) | Canonical column | Transform |
|-----------------|-------------------|-----------|
| `mp_maker_id` | `maker_id` | cast int, validate `b2f_maker` post exists |
| `mp_product_sku` | `sku` | UPPER(), validate in `wp_dinoco_products` |
| `mp_unit_cost` | `unit_cost` | DECIMAL(12,2), 0 if null |
| `mp_moq` | `moq` | INT UNSIGNED, default 1 |
| `mp_lead_time_days` | `lead_time_days` | INT UNSIGNED, default 7 |
| `mp_shipping_land` | `shipping_land` | DECIMAL(10,2), default 0 |
| `mp_shipping_sea` | `shipping_sea` | DECIMAL(10,2), default 0 |
| `mp_status` | `status` | ENUM('active','discontinued'), default 'active' |
| (CPT ID) | `legacy_cpt_id` | nullable, for reverse lookup |
| `post_date_gmt` | `created_at` | DATETIME |
| `post_modified_gmt` | `updated_at` | DATETIME |

### Validation queries (run after backfill)

```sql
-- 1. Row count parity
SELECT
  (SELECT COUNT(*) FROM wp_posts WHERE post_type='b2f_maker_product' AND post_status IN ('publish','draft')) AS cpt_count,
  (SELECT COUNT(*) FROM wp_dinoco_maker_products) AS canonical_count;

-- 2. Orphan check (maker_id no longer exists)
SELECT mp.* FROM wp_dinoco_maker_products mp
LEFT JOIN wp_posts p ON p.ID = mp.maker_id AND p.post_type='b2f_maker'
WHERE p.ID IS NULL;

-- 3. SKU in canonical but not in products table
SELECT mp.sku, COUNT(*) as maker_count
FROM wp_dinoco_maker_products mp
LEFT JOIN wp_dinoco_products prod ON UPPER(prod.sku) = UPPER(mp.sku)
WHERE prod.sku IS NULL
GROUP BY mp.sku;

-- 4. Unit cost divergence (dual-write phase)
SELECT mp.maker_id, mp.sku, mp.unit_cost AS canonical_cost,
       pm.meta_value AS cpt_cost, mp.legacy_cpt_id
FROM wp_dinoco_maker_products mp
JOIN wp_postmeta pm ON pm.post_id = mp.legacy_cpt_id AND pm.meta_key = 'mp_unit_cost'
WHERE ABS(mp.unit_cost - CAST(pm.meta_value AS DECIMAL(12,2))) > 0.01;
```

### Rollback script (per phase)

**Phase 1** (table created, not yet writing):
```sql
DROP TABLE IF EXISTS wp_dinoco_maker_products;
DELETE FROM wp_options WHERE option_name LIKE 'b2f_canonical_%';
```

**Phase 2** (dual-write on):
```php
// 1. Flag disable → instant
wp_delete_option('b2f_canonical_write_enabled'); // or flip constant
// 2. Table data left as archive → no deletion needed
// 3. CPT is authoritative since write branch is idempotent
```

**Phase 3** (reads switched):
```php
wp_delete_option('b2f_canonical_read_enabled'); // instant revert to CPT reads
// Runtime performance will regress but correctness preserved
```

**Phase 4** (CPT retired):
```php
// Re-enable CPT writes:
wp_delete_option('b2f_cpt_write_disabled');
// Run reverse backfill: canonical → CPT (idempotent helper, shipped with snippet)
dinoco_b2f_backfill_cpt_from_canonical();
```

### Monitoring (daily first week, weekly thereafter)

- Telegram daily summary 09:00 (include: drift count, read-fallback %, write-errors)
- Admin Dashboard "B2F Migration Status" card (Phase 1+)
- PagerDuty/Telegram escalation if diff > 10 rows 2h straight

---

## Section 6: Files Affected (concrete)

### New files

| File | DB_ID | Purpose | Version |
|------|-------|---------|---------|
| `[Admin System] Product Catalog Export Tool` | (auto) | Phase 0 baseline export | V.1.0 ✅ |
| `[B2F] Snippet 12: Maker Products Canonical Table` | (auto) | DDL + backfill + diff cron | V.1.0 (Phase 1) |

> Alternative: absorb Snippet 12 into Snippet 0 (CPT & ACF Registration) — prefer separate to keep concerns split

### Modified files (by phase)

| File | Phase | Effort | Version bump |
|------|-------|--------|--------------|
| `[B2F] Snippet 0: CPT & ACF Registration` | 2 | 0.5d | V.3.3 → V.4.0 (add save_post mirror) |
| `[B2F] Snippet 0: CPT & ACF Registration` | 4 | 0.5d | V.4.0 → V.5.0 (deprecate ACF write) |
| `[B2F] Snippet 2: REST API` | 3 | 1d | V.9.19 → V.10.0 (canonical reads) |
| `[B2F] Snippet 5: Admin Dashboard Tabs` | 2 | 0.5d | V.6.1 → V.7.0 (dual-write Makers tab) |
| `[B2F] Snippet 5: Admin Dashboard Tabs` | 3 | 0.5d | V.7.0 → V.8.0 (canonical read) |
| `[B2F] Snippet 5: Admin Dashboard Tabs` | 4 | 1d | V.8.0 → V.9.0 (CSV import/export UI) |
| `[B2F] Snippet 8: Admin LIFF E-Catalog` | 3 | 0.5d | V.5.9 → V.6.0 (remove catalog_map band-aid) |
| `[B2F] Snippet 1: Core Utilities & Flex Builders` | 3 | 0.5d | V.6.4 → V.7.0 (helpers use canonical) |
| `CLAUDE.md` | 4 | 0.25d | add section "B2F Canonical Maker Products" |
| `SYSTEM-REFERENCE.md` | 4 | 0.25d | DB schema update |
| `.second-brain/topics/dinoco-b2f-system.md` | 4 | 0.25d | architecture history |

**Total coding effort**: ~7 active days spread across 3 weeks

### Consumers NOT affected (verified via grep)

- B2B snippets — no direct access to `b2f_maker_product` CPT
- Inventory (Snippet 15) — only reads `wp_dinoco_products`
- Finance Dashboard — reads `b2f_receiving` / `b2f_payment` CPTs, not maker products
- Cron Jobs (Snippet 11) — reads PO + reminders, no maker product queries
- MCP Bridge — no maker product endpoints exposed

---

## Section 7: Success Metrics

### Before (current, approximate — confirm with baseline)

| KPI | Value |
|-----|-------|
| `/b2f/v1/maker-products` avg latency | 300-800ms |
| Admin Makers tab load | 2-5s |
| Drift bugs per month (90-day rolling) | ~3-5 |
| "missing SET in maker list" support issues per month | ~2 |
| Lines of code in virtual SET / catalog_map band-aids | ~350 |

### After (post-Phase 4 target)

| KPI | Target |
|-----|--------|
| `/b2f/v1/maker-products` avg latency | < 100ms (p95) |
| Admin Makers tab load | < 500ms |
| Drift bugs per month | 0 (structural elimination) |
| "missing SET" support | 0 (single source = admin registers once, everywhere) |
| Lines of band-aid code | 0 (deleted in Phase 3) |

### Monitoring dashboard ideas

Card 1: **Canonical adoption** — `reads_canonical / (reads_canonical + reads_cpt_fallback)` over time (target: 100% after week 4)

Card 2: **Drift counter** — rows with canonical ≠ CPT (target: 0, alert if > 0 for 2h)

Card 3: **Latency histograms** — p50/p95/p99 for 3 hot endpoints before/after cutover

Card 4: **Error budget** — canonical path errors over errors total (target: ≤ CPT baseline)

---

## Appendix A: Sub-agent Perspectives (synthesized)

**Database-expert**: Prefers C/F strongly. CPT + meta_query is the single biggest DINOCO perf anti-pattern (same issue as `wp_postmeta` queries vs custom tables — already solved for products in V.32.6).

**API-specialist**: Impacts 6 B2F endpoints. Contract stays same (JSON response shape), internal query changes. Breaking change = zero for API consumers. LIFF catalogs need feature flag to coordinate rollout.

**Code-reviewer**: Migration risk mitigated by 4-phase gating. Key code smells today: virtual SET injection (V.9.14-V.9.19) is symptom of data model mismatch. Each band-aid added ~30-50 LOC. Deletion in Phase 3 is net -350 LOC.

**Frontend-design**: No UI change for admin Makers tab (same form, different backend). LIFF E-Catalog gets perceived speed boost (<500ms vs 2s+). Support ticket "SET หาย" → structural fix.

---

## Appendix B: Open Questions (pre-approval)

1. **Staging env** — มี staging mirror prod ไหม? ถ้ามี → ทดสอบ Phase 1 backfill ที่นั่นก่อน
2. **Business freeze window** — ช่วงไหน PO volume ต่ำสุด (weekend? เช้าวันจันทร์?) — ใช้สำหรับ Phase 2/3 flag flip
3. **Currency handling during migrate** — maker_currency อยู่บน maker CPT (ไม่ใช่ maker_product) — ยังไม่ต้องแก้ใน phase นี้ ✓
4. **Who approves Phase 1 → Phase 2 gate** — 7-day zero diff criteria ต้องมีคนอนุมัติ manual หรือ auto?

---

*End of Architecture Plan. Awaiting user approval before Phase 1 kickoff.*
