# Slip Image Classifier + Needs Review Pool — Applied 2026-04-26

## Context

**Production incident** (post-V.34.11 LINE bot deploy 2026-04-26): when V.34.11 added customer reply for Slip2Go OCR-fail codes (200500/502/503), the system started replying "รูปไม่ชัด ส่งใหม่" to **non-slip images**. LINE groups receive every image (not just slips) — posters, banners, holiday announcements, customer question photos all triggered Slip2Go → 200500 → bot replied → confused customers.

**User evidence**: ห้อง ClubMoto ลูกค้าส่งรูปประกาศ "ร้านปิดวันแรงงาน" → bot ตอบ "ระบบตรวจสลิปไม่ผ่าน รูปอาจไม่ชัด..."

## Solution — Multi-Layer Slip Detection

### Architecture

```
Image arrives in LINE group
  ↓
[Layer 1] PRE-FILTER (heuristic, cost-free, ~5ms)
  ├─ confidence < 0.3 → SILENT (status=not_slip_heuristic, no Slip2Go, no reply)
  └─ confidence ≥ 0.3 → continue
  ↓
[Layer 2] REPLAY CASCADE (existing V.34.10 — unchanged)
  ↓
[Layer 3] SLIP2GO API CALL (cost: API quota)
  ↓
[Layer 4] RESPONSE CLASSIFIER:
  ├─ 200000/200200 verified slip → success path (existing — UNCHANGED)
  ├─ 200401/200402/200501/200404 → existing reply paths (UNCHANGED)
  └─ 200500/200502/200503/unknown → NEEDS REVIEW POOL
       ├─ NO customer reply (silent)
       ├─ Save image to wp-content/uploads/slip-pool/{YYYY-MM}/{hash}.{ext}
       ├─ Status = 'needs_review' (200500/502/503) | 'unknown_slip_code' (other)
       └─ Admin alert dedup 1/hr per (group, code)
  ↓
[Layer 5] ADMIN POOL UI (Slip Monitor V.1.9)
  ├─ Thumbnail per row (click → fullsize lightbox)
  ├─ ✅ "เป็นสลิป" → mark + scroll to Manual Process Tool
  ├─ ❌ "ไม่ใช่สลิป" → mark + delete image (PII hygiene)
  └─ 🔄 "Replay" → reuse cached Slip2Go response endpoint
```

## Pre-Filter Heuristic Tuning Notes

`b2b_slip_image_likely_slip($binary, $mime)` returns `{confidence: 0.0-1.0, reason, metadata}`.

**Threshold contract**: caller proceeds to Slip2Go iff `confidence >= 0.3` (deliberately permissive). False negatives (real slips that score below 0.3) flow through admin pool — admin sees them via the Manual Process Tool — no debt is missed.

**Scoring rules** (sum across 3 axes, clamped 0.0-1.0):

| Axis | Range | Score |
|------|-------|-------|
| Aspect ratio | h/w 1.4-2.7 (portrait) | +0.4 |
| Aspect ratio | h/w 1.1-1.4 (borderline portrait) | +0.2 |
| Aspect ratio | h/w < 1.0 (landscape — banners/posters) | -0.5 |
| File size | 50KB-800KB (typical screenshot) | +0.3 |
| File size | < 30KB (thumbnail) | -0.3 |
| File size | > 2MB (DSLR photo) | -0.2 |
| Width | 600-1300px (mobile screenshot) | +0.3 |
| Width | < 400px (tiny) | -0.2 |
| Width | > 2400px (desktop/DSLR) | -0.2 |

**Calibration cases**:

| Image type | Expected confidence |
|------------|---------------------|
| Real bank slip (KKP screenshot 1080×2400, 200KB, ratio 2.2) | 1.0 |
| Holiday poster landscape (1280×720 JPG, 500KB) | 0.0 (-0.5 ratio + +0.3 size + +0.3 width capped at 0) |
| Group greeting low-res square (400×400, 30KB) | ~0.1 |
| Customer question photo DSLR portrait (3000×4500, 5MB) | ~0.2 |
| Borderline cropped slip (800×1200, 40KB, ratio 1.5) | ~0.5 (proceed) |

## Pool Storage

**Path**: `wp-content/uploads/slip-pool/{YYYY-MM}/{first40_of_hash}.{ext}`

**Access control**:
1. `.htaccess` auto-written on first folder creation (`Order deny,allow / Deny from all`) — blocks direct web access
2. Admin views via REST proxy `GET /dinoco-slip/v1/pool-image?id={log_id}` — `manage_options` cap + path traversal guard + realpath() containment check + nosniff header

**Naming**: hash-based filename = idempotent (same image re-sent = same file = no duplicate writes)

## Retention Policy (PDPA hygiene)

Cron `dinoco_slip_pool_cleanup_cron` (daily 03:30 ICT, bounded LIMIT 200/run):

- **Reviewed entries** (`review_decision IS NOT NULL`): delete file 30 days after `reviewed_at`
- **Unreviewed entries** (`review_decision IS NULL`): delete file 90 days after `created_at` (max retention)
- **DB row preserved**: only `image_path` is NULL'd — slip_log audit trail remains

## REST API Surface (V.1.9)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dinoco-slip/v1/needs-review?days=30` | List recent pool entries (LIMIT 50) |
| POST | `/dinoco-slip/v1/review-decision` | Mark `is_slip` / `not_slip` / `manual_process` |
| GET | `/dinoco-slip/v1/pool-image?id={log_id}` | Stream pool image (admin proxy) |

**Rate limits**: review-decision = 10/min/user (bursty during pool sweep); pool-image = none (cap-gated).

## Schema Changes (Snippet 15 V.8.11)

`wp_dinoco_slip_log` +4 columns + 1 index (idempotent ALTER for legacy installs):

```sql
ADD COLUMN image_path VARCHAR(255) DEFAULT NULL AFTER replayed_from_log_id;
ADD COLUMN review_decision VARCHAR(32) DEFAULT NULL AFTER image_path;
ADD COLUMN reviewed_at DATETIME DEFAULT NULL AFTER review_decision;
ADD COLUMN reviewed_by BIGINT UNSIGNED DEFAULT NULL AFTER reviewed_at;
ADD INDEX idx_review (review_decision, created_at);
```

DB version bump: `_dinoco_catalog_table_version` 8.9 → 8.11.

## Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | ส่งรูปประกาศ landscape 1280×720 จากลูกค้า | pre-filter reject → silent (status=`not_slip_heuristic`, no Slip2Go call, no customer reply) |
| 2 | ส่งรูปสลิปจริง 1080×2400 KKP screenshot | pre-filter pass → Slip2Go 200000 → debt subtract + Flex (UNCHANGED — REG safe) |
| 3 | ส่งรูปสลิปเบลอ → Slip2Go คืน 200500 | needs_review pool: image saved + admin alert (dedup 1/hr) + NO customer reply |
| 4 | Admin เปิด Slip Monitor → "🔍 Needs Review Pool" | 1 row พร้อม thumbnail + 3 action buttons |
| 5 | Admin คลิก thumbnail | lightbox fullsize เปิด, ESC ปิด |
| 6 | Admin คลิก "❌ ไม่ใช่สลิป" | confirm dialog → log marked dismissed + image deleted from disk + row fade out |
| 7 | Admin คลิก "✅ เป็นสลิป" | confirm dialog → log marked is_slip + scroll smooth ไป Manual Process Tool |
| 8 | Admin คลิก "🔄 Replay" | confirm dialog → reuse `/replay-slip` (existing endpoint) |
| 9 | Schema not migrated (legacy install) | endpoint returns `schema_missing: true` + UI ขึ้น banner |
| 10 | Pool image >30d after reviewed | cleanup cron deletes file + nulls `image_path` (DB row stays for audit) |
| 11 | ส่งรูปสลิป 2 ครั้งติด (same hash) | pool save = idempotent (same filename, no dup write); replay cascade catches duplicate |
| 12 | Pre-filter disabled (`b2b_slip_prefilter_enabled=0`) | All images flow to Slip2Go (legacy V.34.11 behavior) |

## Rollback Procedure

### Pre-filter rollback (instant, no redeploy)
```sql
UPDATE wp_options SET option_value = '0' WHERE option_name = 'b2b_slip_prefilter_enabled';
```
After this: every image goes to Slip2Go again (V.34.11 behavior). Pool path still active for OCR-fail codes.

### Pool rollback (revert customer reply)
Revert Snippet 2 V.34.12 unknown-code branch back to V.34.11 customer reply. Files still pile up in `slip-pool/` but cleanup cron handles them.

### Full rollback (revert schema)
Schema is additive — columns are nullable; no need to drop. If desired:
```sql
ALTER TABLE wp_dinoco_slip_log
  DROP INDEX idx_review,
  DROP COLUMN reviewed_by, DROP COLUMN reviewed_at,
  DROP COLUMN review_decision, DROP COLUMN image_path;
```

## Files Touched

| File | Old Version | New Version | Lines Changed |
|------|-------------|-------------|---------------|
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.15 | **V.34.16** | +178 (heuristic helper + log_insert schema-aware) |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.13 | **V.34.12** (post-V.34.11 hotfix branch) | +96 -42 (pre-filter call + unknown-code branch rewrite) |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.10 | **V.8.11** | +98 (4 cols + idx + cleanup cron) |
| `[Admin System] DINOCO Slip Monitor` | V.1.8 | **V.1.9** | +280 (3 REST endpoints + UI section + JS handlers + lightbox) |

## Backward Compatibility (REG-safe)

- Existing slip codes (200000/200200/200401/200402/200404/200501) byte-identical paths
- Pre-filter is flag-gated — set `b2b_slip_prefilter_enabled=0` to instant-disable
- `b2b_slip_log_insert()` is schema-aware — drops new keys if Snippet 15 hasn't synced
- Slip Monitor `needs-review` endpoint returns `schema_missing: true` if image_path column absent
- All new columns nullable; default NULL preserves legacy install row shapes

## Wp_options Touched

- `b2b_slip_prefilter_enabled` (default `1`) — kill switch for heuristic
- `_dinoco_catalog_table_version` (bumped to `8.11`)
- `b2b_slip_pool_alert_*` (transient 1hr — admin alert dedup per group+code)

## Cron Hooks Added

- `dinoco_slip_pool_cleanup_cron` (daily 03:30 ICT) — pool image retention sweep
