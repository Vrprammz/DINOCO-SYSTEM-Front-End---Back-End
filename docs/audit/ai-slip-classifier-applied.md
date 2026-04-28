# AI Vision Slip Pre-Classifier — Applied 2026-04-24

## Context

**Production incident (post-V.34.14)**: ระบบมี heuristic pre-filter (aspect/size/dims) ซึ่ง block landscape banners ได้ดี แต่ **mid-range images** ผ่าน threshold:

- PPT receipt (portrait, ~500KB, ~1080px width) → ผ่าน heuristic → Slip2Go OCR fail → admin alert
- Portrait poster (1.4-2.7 ratio) → ผ่าน → Slip2Go quota burn
- Customer screenshot (กรอกฟอร์ม, screenshot list) → ผ่าน → Slip2Go quota burn

**Evidence (12:33 น. 24/04)**: ระบบยังเรียก Slip2Go กับรูปจากกลุ่มลูกค้า + admin alert "🔍 รูปจากกลุ่มลูกค้าที่ Slip2Go ไม่อ่าน"

**Cost analysis**:
- Slip2Go: ~3-5 บาท/call (subscription quota)
- Claude Haiku 4.5 vision: ~$0.001/call (~0.04 บาท) = **50-100x ถูกกว่า**
- Cache hit (image SHA-256 30d TTL): **0 cost** for repeat images

## Solution — AI Vision Pre-Classifier (Layer 2.5)

Insert AI classification AFTER heuristic + BEFORE Slip2Go. Use Claude Haiku 4.5 vision (DINOCO already has `B2B_ANTHROPIC_API_KEY` for receipt reader). Cache by image hash 30d → repeats free.

### Architecture (5-layer cascade)

```
Image arrives in LINE group
  ↓
[Layer 1] HEURISTIC PRE-FILTER (V.34.16, ~5ms, 0 cost)
  ├─ confidence < 0.3 → SILENT skip (status=not_slip_heuristic)
  └─ confidence ≥ 0.3 → continue
  ↓
[Layer 2] AI VISION CLASSIFIER (V.34.17 NEW, ~500-1500ms, ~0.04 บาท)
  ├─ Cache hit (image_hash matched, <30d) → reuse decision (0 tokens)
  ├─ AI 'not_slip' high-conf (≥0.7) → SILENT skip (status=not_slip_ai)
  ├─ AI 'is_slip' / 'uncertain' / 'error' → fall through to Slip2Go
  └─ B2B_ANTHROPIC_API_KEY missing OR flag OFF → skip layer entirely
  ↓
[Layer 3] REPLAY CASCADE (V.34.10 — unchanged)
  ↓
[Layer 4] SLIP2GO API CALL (cost: ~3-5 บาท quota)
  ↓
[Layer 5] RESPONSE CLASSIFIER + Needs Review Pool (V.34.14 — unchanged)
```

### SAFETY guardrails

False negative (real slip → "not_slip" → debt unpaid) is catastrophic. Asymmetric thresholds:

- `is_slip` decision: requires conf ≥ 0.7 (then falls through to Slip2Go anyway — Slip2Go validates)
- `not_slip` decision: requires conf ≥ 0.7 AND `is_slip=false` from AI
- Anything else → fall through (Slip2Go decides)

On AI failure (timeout, HTTP error, parse fail, exception, missing API key) → return `decision='error'` → caller falls through to Slip2Go (default-safe).

## Files Changed

| File | Version | Purpose |
|------|---------|---------|
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.16 → **V.34.17** | NEW `b2b_slip_ai_classify_image()` helper + extended `b2b_slip_log_insert()` to support 4 new AI columns |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.14 → **V.34.15** | Wire AI call between heuristic pre-filter (V.34.14) and replay cascade (V.34.10). Persist AI decision into slip_log audit row |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.11 → **V.8.12** | Schema +4 columns (`ai_classifier_decision`, `_confidence`, `_reason`, `_at`) + index `idx_hash_ai`. Idempotent ALTER for legacy installs |
| `[Admin System] DINOCO Slip Monitor` | V.1.9 → **V.1.10** | Stats card "AI Filtered 24h" + savings estimate, AI decision badge per recent row, toggle button, 2 new REST endpoints |
| `[Admin System] DINOCO Config Layer` | V.1.0 → **V.1.1** | Register `slip.ai_classifier_enabled` (bool, default ON) + `slip.ai_classifier_min_confidence` (float, default 0.7) |

## AI Prompt Design

```
SYSTEM: คุณเป็น classifier ตัดสินว่ารูปที่ส่งมาคือ "สลิปโอนเงินธนาคาร" (Thai bank
        transfer slip) หรือไม่. สลิปโอนเงินจะมี: ยอดเงิน + ชื่อผู้โอน + ชื่อผู้รับ +
        วันที่/เวลา + รหัสอ้างอิง (ref). รูปที่ไม่ใช่สลิป: โปสเตอร์ ป้ายประกาศ
        รูปสินค้า รูปคน รูปลายเซ็น screenshot ทั่วไป รูปคำถาม.

        ตอบเฉพาะ JSON object: {"is_slip": true|false, "confidence": 0.0-1.0,
        "reason": "1 ประโยคสั้นภาษาไทย"}
        ห้ามอธิบายเพิ่ม ห้ามใส่ markdown code fence. ตอบ JSON ตรงๆ.

USER: [image] + "Classify this image. Is it a Thai bank transfer slip (สลิปโอนเงิน)?"
```

**Tuning notes**:
- Model: `claude-haiku-4-5-20251001` (latest Haiku 4.5, fast + cheap)
- `max_tokens=100` (compact JSON response, ~50 tokens typical)
- `timeout=8s` hard cap — fall through fast on hang
- Force JSON-only output via system prompt + post-parse regex `/\{[\s\S]*\}/u` for resilience
- Reason field captured for admin forensic review (cached as "cached: ..." prefix on cache hit)

## REST Endpoints (NEW)

### GET `/wp-json/dinoco-slip/v1/ai-stats?days=1`

Returns AI classifier metrics:
```json
{
  "success": true,
  "ai_enabled": true,
  "api_key_set": true,
  "ai_cols_exist": true,
  "days": 1,
  "count_not_slip_ai": 47,
  "total_ai_runs": 312,
  "cache_hits": 89,
  "cache_misses": 223,
  "cached_hit_rate": 28.5,
  "estimated_savings_baht": 235
}
```

### POST `/wp-json/dinoco-slip/v1/ai-toggle`

Body: `{"enabled": true|false}` (omit to flip current value)
Sets `wp_option('b2b_slip_ai_classifier_enabled')` + audit log entry.

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| 1 | ส่งโปสเตอร์ portrait | AI classify `not_slip` conf 0.95 → Slip2Go **ไม่ถูกเรียก** + slip_log row `result_status='not_slip_ai'` |
| 2 | ส่งสลิปจริง KKP | AI classify `is_slip` → Slip2Go ตัดหนี้ปกติ |
| 3 | ส่งรูปเดียวกันซ้ำ (image_hash match) | Cache hit → 0 tokens used + decision จาก slip_log row เดิม + reason prefixed `cached:` |
| 4 | ส่งรูปคลุมเครือ (screenshot ตัวเลข) | AI `uncertain` (conf <0.7) → Slip2Go decide |
| 5 | AI timeout 8s | `decision=error` → fall through Slip2Go ปกติ (ไม่ block) |
| 6 | Admin disable AI (toggle off) | wp_option `b2b_slip_ai_classifier_enabled=0` → fall back heuristic + Slip2Go only |
| 7 | Stats card | แสดงจำนวน + savings estimate `~ประหยัด ฿N (Slip2Go)` |
| 8 | `B2B_ANTHROPIC_API_KEY` undefined | Helper returns `decision=error` immediate, no API call, no exception |
| 9 | Image_hash empty (binary corrupted) | Cache lookup skipped, AI runs fresh on binary |
| 10 | Recent table | "AI" column shows ✅/❌/❓/⚠️ badge per row + tooltip with confidence + reason |

## Cost Analysis (Production Estimate)

Assume 500 slips/day average:

| Layer | Caught | Cost |
|-------|--------|------|
| Heuristic | ~30% (150) | 0 |
| AI new | ~20% (100) | 100 × $0.001 = ~$0.10 (~3.5 บาท) |
| Cache hit | ~10% (50) | 0 |
| Slip2Go | ~40% (200) | 200 × ~5 บาท = ~1,000 บาท |
| **Total** | 500 | ~1,003 บาท |

**Before V.34.15**: 350 calls × 5 บาท = ~1,750 บาท/day
**After V.34.15**: ~1,003 บาท/day = **~43% reduction (~750 บาท/day saved)**

Cache hit rate climbs over time as image hashes accumulate (admin can see in stats card).

## Rollback Procedure

### Soft (instant — no redeploy)
```sql
UPDATE wp_options SET option_value = '0' WHERE option_name = 'b2b_slip_ai_classifier_enabled';
```
Or: Slip Monitor UI → "🤖 Toggle AI" button → confirm dialog.

Effect: Snippet 2 V.34.15 skips AI layer entirely → falls back to V.34.14 behavior (heuristic + Slip2Go only). slip_log AI columns become NULL on new rows.

### Hard (revert code)
```bash
git revert <commit_sha>
```
Schema columns (V.8.12) persist (no regression — INSERT defaults NULL). REG-029 byte-identical guarantee preserved (flag OFF path = V.34.14 behavior).

### Snippet 15 schema rollback (extreme)
Manual SQL only (idempotent migration won't roll back):
```sql
ALTER TABLE wp_dinoco_slip_log
  DROP INDEX idx_hash_ai,
  DROP COLUMN ai_classifier_decision,
  DROP COLUMN ai_classifier_confidence,
  DROP COLUMN ai_classifier_reason,
  DROP COLUMN ai_classifier_at;
UPDATE wp_options SET option_value = '8.11' WHERE option_name = '_dinoco_catalog_table_version';
```
Not recommended — columns are nullable and harmless even if unused.

## Defensive Patterns

- **API key undefined**: `B2B_ANTHROPIC_API_KEY` not defined OR empty → helper returns `decision=error` immediate, no API call, no exception → caller falls through.
- **Schema not synced**: `ai_classifier_*` columns probed via `INFORMATION_SCHEMA` per request (cached). If absent → cache lookup skipped, log_insert silently drops AI fields, no INSERT failure.
- **Try/catch + finally**: existing V.34.8 try/finally wrapper around `b2b_handle_slip_image()` covers AI exception → fall through to finally → audit row written + lock released.
- **Cache poisoning**: AI decision `error` is **not** cached (only `is_slip`/`not_slip`/`uncertain` cache for 30d) — transient API failures don't taint repeat lookups.
- **Token budget**: hard `max_tokens=100` + `timeout=8s` caps per-call cost. Logged via `dinoco_audit_log` event_type `ai_slip_classify` for cumulative monitoring.

## Companion docs

- `docs/audit/slip-classifier-pool-applied.md` — V.34.16 heuristic + needs_review pool design
- `CLAUDE.md` — Snippet versioning + DB_ID conventions

## Next Steps (deferred)

- Tune AI confidence threshold per heuristic confidence band (e.g. heuristic 0.3-0.5 = stricter AI ≥0.8, heuristic >0.7 = relaxed AI ≥0.6)
- Add cost tracking dashboard (cumulative tokens × pricing) — Slip Monitor V.1.11
- A/B test prompts (e.g. add few-shot examples) via Config Layer `slip.ai_classifier_prompt_variant`
