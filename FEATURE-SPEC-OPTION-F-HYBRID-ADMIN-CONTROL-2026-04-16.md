# FEATURE SPEC — Option F Hybrid Admin Control (Auto-Sync Review + Blacklist)

- **Author:** Tech Lead (DINOCO System Orchestrator)
- **Date:** 2026-04-16
- **Target release:** Snippet 5 V.6.3, Audit V.3.2
- **DB_IDs touched:** 1166 (B2F Snippet 5), Audit snippet (auto-assigned)
- **Kill switch:** `B2F_DISABLED`

---

## 1. Problem & Goal

### Problem statement
Phase 2 backfill auto-syncs orphan SETs into `wp_dinoco_product_makers` using a **strict rule** — "all descendants covered by the maker = orphan SET belongs to the maker". This rule is **correct for HTP** (makes crash-bar SETs where HTP owns every leaf) but **wrong for Test Fac2** (supplies only a subset of parts for multi-maker assemblies).

Current distribution of rows in junction table (116 total):

| Maker | CPT-registered (legacy_cpt_id ≠ NULL) | Auto-synced orphan SETs (legacy_cpt_id NULL) | Verdict |
|---|---|---|---|
| Happy Tech Pro | 91 | 9 | Keep all 9 auto |
| Test Fac2 | 7 | 4 | Remove 4 auto |
| Test Fac3 | 5 | 0 | No-op |

Admin has no UI to selectively review/remove auto-synced rows, and re-running backfill re-adds deleted rows.

### Goal
1. Expose **source badges** (📦 CPT vs ✨ Auto) in Admin Makers tab so admin can tell junction origin at a glance.
2. Let admin **filter + bulk-select + soft-delete** wrong auto-syncs for a specific maker.
3. **Blacklist** the deleted (maker_id, sku) pairs so subsequent backfill runs skip them.
4. Preserve HTP's 9 auto-synced SETs (admin simply won't delete them).
5. No destructive operations on CPT-originated rows.

### Non-goals
- Not changing the Phase 2 strict orphan rule globally (still useful default for HTP).
- Not creating an "approve-each-auto" workflow — admin reviews after backfill runs.
- Not building backfill audit UI for all previous runs.

---

## 2. User Flow (Admin)

```
เปิด Admin Dashboard → Makers tab → กด "จัดการสินค้า+ราคาทุน" ใน card ของ Maker (เช่น Test Fac2)
  ↓
เห็น products list พร้อม source badges:
  - 📦 CPT (blue)   — originally registered via Admin/CPT workflow
  - ✨ Auto (amber) — Phase 2 auto-synced orphan SET
  ↓
Summary strip บนหัว:
  "7 registered + 4 auto-synced — [ดู Auto-synced] [ดู blacklist]"
  ↓
Filter chips: [ทั้งหมด] [ที่ลงทะเบียนจริง (CPT)] [Auto-synced]
  ↓
เลือก Auto-synced filter → เห็นเฉพาะ 4 rows + checkbox column + Bulk action bar
  ↓
ติ๊กเลือก 4 rows → กด [🗑️ ลบที่เลือก]
  ↓
Confirm modal:
  ⚠️ ยืนยันการลบ 4 รายการ (auto-synced)
  Maker: Test Fac2
  SKUs: DNC4537SETGNDSTD001, DNC4537SETGNDSTD002, DNCGND37FULLSTDS, DNCGND37FULLSTDB
  ☑️ เพิ่มเข้า blacklist (ป้องกัน auto-sync re-add ในอนาคต)
  [ยกเลิก]  [🗑️ ยืนยันลบ]
  ↓
Toast: "ลบ 4 รายการ + เพิ่มเข้า blacklist สำเร็จ"
  ↓
List reload (4 rows หาย, blacklist summary: "ไม่ auto-sync: 4 SKUs")
  ↓
(Optional) กด [ดู blacklist] → modal แสดง list พร้อมปุ่ม "ปลด blacklist"
```

---

## 3. Data Model Changes

### wp_options (new)
| Key | Type | Shape |
|---|---|---|
| `b2f_autosync_blacklist` | JSON (string in DB) | `{ "<maker_id>": ["SKU1", "SKU2", ...] }` |

Rules:
- Keys = maker_id (string-cast), values = uppercase SKU arrays.
- Capped at ~50KB. Log warning if > 100KB.
- Written on bulk-delete confirm. Read during backfill orphan loop.

### Junction table (`wp_dinoco_product_makers`) — no schema change
- Soft delete: `UPDATE ... SET status='discontinued', deleted_at=NOW(), updated_by=<admin_uid>, updated_at=NOW() WHERE maker_id=? AND product_sku IN (...)`.
- Rollback: `UPDATE ... SET deleted_at=NULL, status='active' WHERE ...` manually.

### Source derivation
- `source = 'cpt'` ⇔ `legacy_cpt_id IS NOT NULL AND legacy_cpt_id > 0`
- `source = 'auto'` ⇔ `legacy_cpt_id IS NULL OR legacy_cpt_id = 0`

---

## 4. API Design

All new endpoints go under existing namespace `/wp-json/dinoco-b2f-audit/v1/` in `[Admin System] B2F Migration Audit`. Permission: `manage_options`. Nonce via `wp_create_nonce('wp_rest')` + `X-WP-Nonce` header.

### 4.1 `GET /maker-products-with-source/{maker_id}`
List junction rows for a maker with `source` + `is_auto_synced` enriched.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "product_sku": "DNCADV001-L",
      "maker_id": 2,
      "unit_cost": 1700,
      "moq": 1,
      "lead_time_days": 7,
      "shipping_land": 0,
      "shipping_sea": 0,
      "status": "active",
      "notes": "...",
      "legacy_cpt_id": 123,
      "source": "cpt",
      "is_auto_synced": false,
      "is_blacklisted": false,
      "created_at": "...",
      "updated_at": "..."
    },
    {
      "id": 99,
      "product_sku": "DNCSETNX500E002",
      "maker_id": 2,
      "legacy_cpt_id": null,
      "source": "auto",
      "is_auto_synced": true,
      "is_blacklisted": false,
      "notes": "Auto-added by Phase 2 migration 2026-04-15 — leaves=L1,L2,L3"
    }
  ],
  "summary": {
    "total": 11,
    "cpt": 7,
    "auto": 4,
    "blacklisted": 0
  },
  "maker": { "id": 2, "name": "Test Fac2" }
}
```

Rate limit: 20/hour/user (reuse `$rl` wrapper).

### 4.2 `POST /junction-bulk-delete`
Soft-delete junction rows + add to blacklist atomically.

Body:
```json
{
  "maker_id": 2,
  "skus": ["DNCSETNX500E002", "DNCSETNX500EX001"],
  "add_to_blacklist": true,
  "only_auto_synced": true,
  "confirm": true
}
```

Validation:
- `confirm=true` required (guard).
- `manage_options` + nonce.
- Rate limit: 5/min/user.
- If `only_auto_synced=true` → server-side filter skips rows with `legacy_cpt_id IS NOT NULL` (protects CPT rows).
- `skus` array capped at 200 items.
- SKUs normalized `UPPER(trim())`.

Response:
```json
{
  "success": true,
  "data": {
    "deleted": 4,
    "blacklisted": 4,
    "skipped_cpt_protected": 0,
    "errors": [],
    "updated_blacklist_count": 4
  }
}
```

Transaction: single `UPDATE ... WHERE maker_id=? AND UPPER(product_sku) IN (?) AND deleted_at IS NULL AND (legacy_cpt_id IS NULL OR legacy_cpt_id = 0)`.

### 4.3 `POST /autosync-blacklist`
Add or remove a single blacklist entry.

Body:
```json
{ "maker_id": 2, "sku": "DNCSETNX500E002", "action": "add" }
// or
{ "maker_id": 2, "sku": "DNCSETNX500E002", "action": "remove" }
```

Response:
```json
{
  "success": true,
  "data": {
    "blacklist_for_maker": ["DNCSETNX500E002"],
    "total_blacklist_count": 4
  }
}
```

### 4.4 `GET /autosync-blacklist`
Read entire blacklist (admin summary).

Response:
```json
{
  "success": true,
  "data": {
    "blacklist": { "2": ["SKU1", "SKU2"], "5": ["SKU3"] },
    "total_entries": 3,
    "size_bytes": 142
  }
}
```

### 4.5 Modify `b2f_phase2_run_backfill()` (STEP 3 orphan loop)
Insert blacklist check **before** the orphan INSERT:
```php
if ( b2f_autosync_is_blacklisted( $maker_id, $sku ) ) {
    $result['skipped']++;
    $result['skipped_blacklisted'][] = $sku . '@' . $maker_id;
    continue;
}
```
Also emits `skipped_blacklisted[]` in the result shape for visibility.

---

## 5. UI Wireframes

### 5.1 Makers tab Products modal header (new)
```
┌─────────────────────────────────────────────────────────────────────┐
│ สินค้า + ราคาทุน — Test Fac2 (CNY)               [ X ]              │
├─────────────────────────────────────────────────────────────────────┤
│ 📦 7 registered + ✨ 4 auto-synced                                   │
│ [🔍 ทั้งหมด (11)] [📦 CPT (7)] [✨ Auto (4)]  [👁️ ดู blacklist]    │
│                                                                       │
│ ☐ เลือกทั้งหมด (ใน filter ปัจจุบัน)   [🗑️ ลบที่เลือก (0)]          │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Row rendering (new source badge column)
```
┌──┬──────────┬──────────────┬───────┬─────┬─────┬────────┬────┐
│☐ │ DNCADV…  │ กันล้ม L     │ ¥1700 │ MOQ │ Lead│ 📦 CPT │ 🗑️ │
│☐ │ DNCSET…  │ ชุดเต็ม A    │ ¥5750 │  1  │  7  │ ✨ Auto│ 🗑️ │
└──┴──────────┴──────────────┴───────┴─────┴─────┴────────┴────┘
```

Badges CSS (mirror existing b2f-badge palette):
- `.b2f-src-cpt`  → `background:#dbeafe; color:#2563eb;` (blue)
- `.b2f-src-auto` → `background:#fef3c7; color:#d97706;` (amber)

### 5.3 Bulk delete confirm modal
```
┌─────────────────────────────────────────────┐
│ ⚠️ ยืนยันการลบ 4 รายการ (auto-synced)       │
├─────────────────────────────────────────────┤
│ Maker: Test Fac2                             │
│ SKUs:                                         │
│   • DNC4537SETGNDSTD001                      │
│   • DNC4537SETGNDSTD002                      │
│   • DNCGND37FULLSTDS                         │
│   • DNCGND37FULLSTDB                         │
│                                               │
│ ☑️ เพิ่มเข้า blacklist                        │
│    (ป้องกัน auto-sync re-add ในอนาคต)        │
│                                               │
│ หมายเหตุ: soft-delete (คืนค่าได้ผ่าน SQL)    │
│                                               │
│         [ยกเลิก]   [🗑️ ยืนยันลบ]             │
└─────────────────────────────────────────────┘
```

### 5.4 Blacklist viewer modal
```
┌───────────────────────────────────────────┐
│ 🚫 Auto-Sync Blacklist                     │
├───────────────────────────────────────────┤
│ Test Fac2 (4 SKUs):                        │
│   • DNCSETNX500E002       [ปลด blacklist] │
│   • DNCSETNX500EX001      [ปลด blacklist] │
│   • DNC4537SETGNDSTD001   [ปลด blacklist] │
│   • DNCGND37FULLSTDS      [ปลด blacklist] │
│                                             │
│ ขนาด: 142 bytes ของ 100KB cap              │
│                              [ปิด]         │
└───────────────────────────────────────────┘
```

---

## 6. Dependencies & Impact

### Files to modify
1. `[B2F] Snippet 5: Admin Dashboard Tabs` — V.6.2 → **V.6.3**
   - Filter chips (ทั้งหมด / CPT / Auto)
   - Source badge per row + checkbox column
   - Bulk-select + bulk-delete button + summary strip
   - Confirm modal + blacklist viewer
   - Wire to new audit endpoints (namespace `dinoco-b2f-audit/v1/`)

2. `[Admin System] B2F Migration Audit` — V.3.1 → **V.3.2**
   - 4 new REST endpoints (4.1–4.4)
   - 5 blacklist helper functions
   - `b2f_phase2_run_backfill()` STEP 3 — blacklist check before orphan INSERT
   - Result shape — add `skipped_blacklisted[]`

### Files NOT modified
- `[B2F] Snippet 2: REST API` — Frontend uses new audit endpoints directly for the source-enriched view (avoids touching the main `/maker-products/{id}` response shape used by LIFF). Existing `api('GET', 'maker-products/' + id)` call remains for product editing.
- `[B2F] Snippet 8: Admin LIFF E-Catalog` — junction read unchanged; deleted rows disappear naturally (soft-delete filtered via `deleted_at IS NULL`).
- `[B2F] Snippet 0.5: Maker Product Dual-Write` — no change (CPT dual-write unaffected).

### Integration points
- **Backfill (`b2f_phase2_run_backfill` STEP 3)** — check blacklist before INSERT orphan.
- **Dual-write** — **NOT gated** (admin manually adds a CPT → dual-write inserts; blacklist is only for auto-sync path).

### Side effects
- Soft-delete preserves data — restorable via SQL / via "ปลด blacklist" helper.
- LIFF B2F catalog: E-Catalog reads junction live → deleted rows disappear on next page load.

---

## 7. Implementation Roadmap

### Phase F.1 — Backend foundation (1.5 hours)
- **F.1.1** Audit snippet V.3.2 helpers (5 fns):
  - `b2f_autosync_blacklist_get_all()` → decoded array
  - `b2f_autosync_blacklist_get($maker_id)` → array of SKUs for that maker
  - `b2f_autosync_blacklist_add($maker_id, $sku)` → bool (dedup, uppercase)
  - `b2f_autosync_blacklist_remove($maker_id, $sku)` → bool
  - `b2f_autosync_is_blacklisted($maker_id, $sku)` → bool
- **F.1.2** Modify `b2f_phase2_run_backfill()` STEP 3 — blacklist check + `skipped_blacklisted[]` result.
- **F.1.3** 4 REST endpoints:
  - `GET /maker-products-with-source/(?P<maker_id>\d+)`
  - `POST /junction-bulk-delete`
  - `POST /autosync-blacklist`
  - `GET /autosync-blacklist`
- Permission `manage_options` + rate limits + nonce.

### Phase F.2 — Admin UI (2 hours)
- **F.2.1** In Products modal header: summary strip + filter chips + "ดู blacklist" button.
- **F.2.2** Products list — add checkbox column + source badge span per row. Hook the new `/maker-products-with-source/` endpoint (parallel GET alongside existing `/maker-products/` for metadata).
- **F.2.3** Bulk action bar + confirm modal + API wiring.
- **F.2.4** Blacklist viewer modal with "ปลด blacklist" per-SKU action.

### Phase F.3 — Testing + deploy (0.5 hours)
- **F.3.1** HTP verify: 9 auto-synced SETs intact untouched (just view).
- **F.3.2** Test Fac2 verify: bulk-delete 4 auto rows → rows disappear, blacklist summary shows 4.
- **F.3.3** Re-run backfill dry-run → verify `skipped_blacklisted` count = 4 (no re-add).
- **F.3.4** Update docs + single commit + push.

**Total: ~4 hours**

---

## 8. Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Admin accidentally deletes HTP's needed auto-synced SET | HTP LIFF missing SETs | Confirm dialog lists SKUs + soft-delete + blacklist viewer lets admin revert instantly. |
| Blacklist grows unboundedly | `wp_option` size bloat | Soft cap 100KB in helper + log warning. Real-world max ~200 entries * 30 bytes = 6KB. |
| Race: 2 admins bulk-delete simultaneously | Partial fail | Single-statement UPDATE is atomic. Blacklist write is last-writer-wins (acceptable — superset union). |
| Admin bulk-deletes a CPT row by mistake | Loses real mapping | Server-side guard `only_auto_synced=true` default + SQL clause `AND (legacy_cpt_id IS NULL OR legacy_cpt_id = 0)` protects CPT rows even if frontend is bypassed. Rows skipped counted in `skipped_cpt_protected`. |
| LIFF cache stale after delete | User sees deleted SETs | LIFF reads junction live each page load (no long cache). Admin should ask dealer to reload LIFF once. |
| Blacklist skipping valid orphan SET admin later wants | Missing SET after backfill | Viewer UI lets admin remove entry → re-run backfill → orphan SET returns. |

---

## 9. Testing Checklist

- [ ] Source badges render (📦 CPT blue / ✨ Auto amber) — verified across Test Fac2's 11 rows.
- [ ] Filter "Auto" shows only 4 rows (legacy_cpt_id NULL); "CPT" shows 7 rows; "ทั้งหมด" shows 11.
- [ ] Checkbox "เลือกทั้งหมด" scopes to current filter (only auto-synced get ticked under Auto filter).
- [ ] Bulk-delete button disabled when 0 selected; enabled when ≥1.
- [ ] Confirm modal shows exact SKU list + checkbox `☑️ เพิ่ม blacklist`.
- [ ] Soft-delete verified: `SELECT status, deleted_at FROM wp_dinoco_product_makers WHERE id IN (...)` → `discontinued` + timestamp.
- [ ] Blacklist persists across sessions (reload page → viewer still shows entries).
- [ ] Re-run backfill (dry_run=1) → response `skipped_blacklisted` includes the 4 SKUs; `orphans_added` reduced accordingly.
- [ ] Re-run backfill (real) → 4 SKUs NOT re-inserted.
- [ ] HTP's 9 auto-synced rows unaffected by Test Fac2 delete (spot-check junction counts).
- [ ] LIFF B2F for Test Fac2 → SET Detail page no longer shows the 4 deleted SETs.
- [ ] "ปลด blacklist" action removes entry; subsequent backfill re-adds orphan.
- [ ] Rate limit enforced: 6th bulk-delete in a minute returns 429.
- [ ] Server-side guard: POSTing a CPT row SKU with `only_auto_synced=true` → `skipped_cpt_protected` incremented, row untouched.

---

## 10. Rollback Plan

### If Admin UI misbehaves
- Git revert Snippet 5 V.6.3 → V.6.2 (UI only, no data impact).
- Revert Audit V.3.2 → V.3.1 removes endpoints; blacklist option remains but ignored.

### If admin mis-bulk-deletes
- Soft-delete preserves data.
- Restore SQL:
  ```sql
  UPDATE wp_dinoco_product_makers
     SET deleted_at = NULL, status = 'active'
   WHERE maker_id = <id>
     AND product_sku IN ('SKU1','SKU2');
  ```
- Then call `POST /autosync-blacklist` with `action=remove` for each SKU.

### If blacklist misbehaves (unexpected skips)
- `delete_option('b2f_autosync_blacklist')` — full reset.
- Re-run backfill → missing orphans return.

### Emergency kill
- `define('B2F_DISABLED', true)` — whole B2F module shuts down; junction untouched.

---

## 11. Out-of-scope (future work)

- Approve-each-auto workflow (per-row accept/reject during backfill).
- Audit log table for bulk-delete actions (currently logged via `b2b_log`).
- Bulk-unblacklist (remove all for a maker in one call).
- Export blacklist to CSV.
