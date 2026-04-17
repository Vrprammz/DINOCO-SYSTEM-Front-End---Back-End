# DINOCO System — Full Repo Audit 2026-04-17

**Scope**: 60 WordPress snippets (~118K LOC PHP) + `openclawminicrm/` (Node.js) + `rpi-print-server/` (Python) + Vite build
**Method**: 7 parallel specialist agents (security, DB+drift, perf, code-review, UX, architecture, API contracts)
**Read-only** — ไม่มีการแก้โค้ดใดๆ ระหว่าง audit
**Prior audit**: `AUDIT-REPORT.md` (2026-04-11) — 26/26 items closed; รายงานนี้เฉพาะ findings ใหม่ (post-2026-04-11) ยกเว้นระบุไว้

---

## 📊 Executive Summary

**Verdict**: ระบบโดยรวม **mature** + audit trails แข็งแรงบน financial ops แต่มี **13 ship-blockers (🔴)** ที่ต้องปิดก่อน deploy รอบต่อไป — ส่วนใหญ่อยู่ใน **code ใหม่หลัง 2026-04-11**: BO System V.1.6, B2F V.7.0 Order Intent, Option F Phase 3 migration

**Top 5 ship-blockers (must fix this sprint)**:
1. **BO rate-limit บัคทั้งระบบ** — `!b2b_rate_limit()` ผิด semantic; rate limiting ถูกปิดเงียบๆ บน place-order [C1]
2. **BO stock double-subtract** — bo-fulfill + hook `dinoco_inv_on_status_change` ตัดสต็อกซ้ำ → inventory loss จริง [C2]
3. **LIFF AI + B2F admin auth bypass** — group_id + HMAC sig ไม่ bind กับ user → ใครก็ยก role admin ได้ [S1, S2]
4. **OpenClaw 3 endpoints public writes ไป MongoDB** — unauth spam + financial data pollution [S3]
5. **Snippet 0.5 dual-write CHECK violation** — MySQL 8.0.16+ reject INSERT เงียบๆ → junction stale [C1 DB]

**Numbers at a glance**:
- Security: 4 Critical + 6 High + 5 Medium = 15 findings (4 ใหม่จริง + rest post-hoc)
- DB / Schema drift: 3 Critical + 8 High + 7 Medium + 5 drift items = 23 findings
- Performance: 6 Critical + 12 High + 15 Medium = **~34 perf findings** (est. TTFB −40-60% on LIFF ถ้าแก้ Top 5)
- Bugs + quality: 10 Critical + 13 High + 18 Medium/Low = 41 findings
- UI/UX: 11 Critical + 20 High + 20 Medium/Low + 13 a11y patterns + 15 dead-ends = **~79 findings**
- API contracts: 6 Critical + ~10 High = ~16 findings
- Architecture: repo map + 14 TODOs (clean) + 6 feature flags (1 orphan)

**Total ~200 findings**, dedupe ~170 unique. Evidence-based — ทุก finding มี file:line.

**Should migrate stack?**: ❌ **ไม่** — WordPress monolith เหมาะกับ workload ปัจจุบัน ไม่มี ceiling ที่แก้ด้วย stack เดิมไม่ได้ ดู §3 Architecture Recommendation

---

## 🗺 Repo Map

### Top-level directory breakdown

| Dir | Files | LOC | Language | Purpose |
|-----|------:|----:|----------|---------|
| **Root snippets** | 60 | 118,004 | PHP (inline HTML/CSS/JS) | WordPress Code Snippets (B2B, B2F, System, Admin, LIFF AI) |
| `openclawminicrm/` | ~50 | 14,141 | JS + Python | AI chatbot microservice (MongoDB, multi-platform) |
| `rpi-print-server/` | 5 main | 2,658 | Python | Raspberry Pi print server (CUPS + thermal) |
| `src/` | 2 | ~20 | JS | Vite frontend sources (brand voice extension) |
| `scripts/` | 2 | ~300 | PHP | B2F migration helpers (dry-run, phase2 backfill) |
| `docs/` | ~15 | — | Markdown | Architecture + deployment guides |
| `brand-voice-extension/` | 3 | ~150 | JS | Chrome extension |
| `dist/` | ~10 | ~2 | JS | Built assets |
| `node_modules/` | ~1000 | 500K+ | JS/TS | Vite/Tailwind/PostCSS |
| `.second-brain/` | symlink | — | Markdown | Second Brain wiki (external, gitignored) |

**Total production LOC**: ~135K (118K PHP + 14K Node + 2.6K Python)

### Snippet inventory summary (60 files)

| Category | Snippets | LOC | Notes |
|----------|---------:|----:|-------|
| **B2B** | 16 | ~32K | Core business — LINE Bot + LIFF + Flash + BO (V.1.6) |
| **B2F** | 12 | ~27K | Factory purchasing — Makers + Phase 3 migration active |
| **System** (member) | 13 | ~9K | Dashboard, claims, LINE callback, MCP bridge |
| **Admin System** | 15 | ~44K | Inventory (8.6K — largest), Dashboard, Finance, AI Control, B2F Audit (4.6K new) |
| **LIFF AI** | 2 | ~2.8K | Dealer CRM (REST + Frontend) |
| **GitHub Sync** | 1 | ~987 | Webhook → WP snippets sync |

**Hot spots (heaviest churn)**: B2B Snippet 1 (V.33.7 — 33 revisions), B2B Snippet 3 (V.41.4), B2F Snippet 2 (V.11.3), Inventory DB (V.43.6)

### REST API footprint

| Namespace | Count | Notes |
|-----------|------:|-------|
| `/b2b/v1/` | ~30 | + 14 new `/bo-*` (Snippet 16 V.1.6) |
| `/b2f/v1/` | 21 | + new `/po-undo-submit`, enriched `/maker-products`, `/junction-*-classification` V.11 |
| `/dinoco-stock/v1/` | 11 | Inventory + god-mode margin (JWT) |
| `/dinoco-b2f-audit/v1/` | ~17 | **NEW namespace** — Phase 2/3/4 migration controls |
| `/liff-ai/v1/` | 13 | LIFF AI dealer |
| `/dinoco-mcp/v1/` | 32 | External AI agent bridge |
| `/dinoco/v1/` | 1 | GitHub sync-status |
| **Total verified** | **~125** | (CLAUDE.md claims 73+ — actual count includes all namespaces) |

---

## 🏛 Architecture Report

### Current pattern

**WordPress monolith + 2 external microservices + 1 IoT edge service**

```
WordPress (60 snippets, 1 DB)
  ├─ 125 REST endpoints (7 namespaces)
  ├─ ACF CPTs + custom tables (products, BO queue, attempt log, observations, junction)
  ├─ LINE Login OAuth2 + Bot webhook
  ├─ GitHub Webhook Sync (DB_ID matching) — single source of truth
  │
  ├── OpenClaw Mini CRM (Node.js + MongoDB Atlas, Docker)
  │     ↑↓ HTTP /dinoco-mcp/v1/* bridge
  │     LINE/FB/IG/Telegram chatbot + training dashboard + Regression Guard V.1.0
  │
  └── RPi Print Server (Python Flask + CUPS)
        ↑↓ HTTP /b2b/v1/print-* + /manual-flash-*
        Thermal labels + A4 invoices + warehouse kiosk UI
```

### Strengths
- ✅ **Atomic financial ops** — `b2b_debt_add/subtract`, `b2f_payable_add/subtract`, `dinoco_stock_add/subtract` ทุกตัวใช้ `START TRANSACTION + FOR UPDATE + COMMIT/ROLLBACK`
- ✅ **DD-3 shared child** + **3-level SKU hierarchy** — modeled correctly, index strategy covers hot paths
- ✅ **Feature flag gates** migration + new features — dependency chain enforced (V.11, Phase 3)
- ✅ **Idempotent schema migrations** — `dbDelta` + version option + fallback ALTER
- ✅ **Audit trails** on critical actions (debt, stock, BO, flags, classifications)
- ✅ **Webhook HMAC verification** — LINE, GitHub ใช้ `hash_equals` (constant-time) ถูกต้อง
- ✅ **WP nonce + cap composite check** บน BO admin endpoints (pattern ที่ดี)

### Weaknesses
- ⚠️ **Monolith giants** — Inventory DB (8.6K LOC), B2F REST (5.8K), Admin Dashboard (4.9K) — risk of merge conflicts + review fatigue
- ⚠️ **Inline HTML/CSS/JS ใน PHP** — admin LIFF B2F = 155KB inline per render; no build pipeline for frontend minification
- ⚠️ **No automated tests** สำหรับ WordPress snippets (OpenClaw มี Regression Guard 25 scenarios แต่ WP side มี 0)
- ⚠️ **Legacy drift** — B2F CPT `b2f_maker_product` ยังถูกอ่านในหลายจุดแม้ Phase 3 cut-over active (junction canonical)
- ⚠️ **Migration half-done** — Phase 2 shadow-write ON + Phase 3 cut-over ON + Phase 4 ready to run = 3 phases overlap; "where are we" fragmented ข้าม 3+ wp_options

### Tech stack assessment

| Component | Version | EOL | Status |
|-----------|---------|-----|--------|
| WordPress | 6.x (inferred) | ongoing | ✅ OK |
| PHP | 8.0+ (implied from `match`/named args) | 8.0 EOL Nov 2023, 8.1 EOL Dec 2025, 8.2 supported to Dec 2026 | ⚠️ pin min version |
| ACF Pro | unknown | ongoing | ✅ OK |
| MySQL | 5.7+ (uses JSON_EXTRACT, FOR UPDATE) | 5.7 EOL Oct 2023 | ⚠️ check production version — V.11 CHECK constraints need 8.0.16+ |
| Node.js (OpenClaw) | 18+ (Docker alpine) | 18 EOL Apr 2025 | ⚠️ upgrade to 20 LTS |
| Express | ^5.2.1 | n/a | ⚠️ pulls vulnerable path-to-regexp (S6) |
| multer | ^1.4.5-lts.2 | **EOL Dec 2024** | 🔴 S7 — migrate to v2.x |
| Vite | ^8.0.3 | n/a | 🔴 S8 — 3 high CVEs, bump to ^8.0.5+ |
| Python (RPi) | 3.8+ | 3.8 EOL Oct 2024 | ⚠️ upgrade to 3.11+ |

### Migration recommendation (3 options)

#### Option A: Keep & improve (recommended)
- **Cost**: ~40-80h dev (close ship-blockers + Top 10 quick wins + perf优化)
- **Time**: 2-3 sprints
- **Risk**: Low — in-place fixes, no data migration
- **Break-even**: Immediately
- **Pain resolved**: Ship-blockers (BO race conditions, auth bypass, perf hotspots) — 90% of real user impact
- **Pain remaining**: Monolith giants + no automated tests (ongoing, can address incrementally)

#### Option B: Partial extraction — Strangler fig approach
- **Extract what**: 
  - B2F subsystem → separate WP mu-plugin (better isolation) or Laravel microservice (if need multi-tenancy)
  - Admin Inventory UI → Vue/React SPA consuming `/dinoco-stock/v1/` (HTML bundle size pain is real)
- **Cost**: 400-600h + QA
- **Time**: 4-6 months
- **Risk**: Medium — data still on WP DB, dual-write period + rollback plan required
- **Break-even**: 12-18 months (only if team grows + needs to ship concurrent B2C + B2F features)
- **Pain resolved**: File size + review bottleneck; frontend build pipeline
- **Pain remaining**: Auth system (WP users + LINE UIDs) still centralized

#### Option C: Full rewrite — ไม่แนะนำ
- Cost: 2000+h, 12-18 months; ทีมหยุด ship feature
- Break-even: ไม่เห็น 24 เดือน
- **ห้าม trigger unless**: WordPress hits real scaling ceiling (เช่น >100K members + >10K concurrent writes) — ปัจจุบันไม่ใกล้เลย
- **ตอบ 3 คำถาม test ของ audit spec**:
  1. ปัญหาที่แก้ไม่ได้ด้วย WP? — **ไม่มี**. ทุก pain point แก้ได้ด้วย Option A
  2. Migration กี่เดือน + เงินเท่าไหร่? — 12-18 เดือน, ไม่มี business case
  3. Break-even กี่เดือน? — ตอบไม่ได้ → **keep WP**

### Verdict: **Option A + incremental towards B** ถ้าทีมโต — ไม่ rewrite

---

## 🔴 Critical Issues (must fix before next ship)

### Security (4 Critical)

#### S1 — LIFF AI `/auth` endpoint: trivial admin impersonation
- 📍 `[LIFF AI] Snippet 1: REST API:247-253` + `:218`
- 🧩 Module: LIFF AI JWT auth (unlocks claim status / lead status / agent-ask)
- ❓ Role `admin` ถูกให้จาก client-supplied `group_id === B2B_ADMIN_GROUP_ID` เท่านั้น ไม่ verify ว่า LINE user **อยู่ใน group นั้นจริง**. admin group_id ไม่ใช่ secret (เปิดใน Flex URL, screenshot). `id_token` verify ก็ **optional** (`if (!empty($id_token))`) — ถ้า omit ใช้ client-supplied `line_user_id`
- 🔧 (a) require id_token non-empty, reject ถ้า LINE verify fail (ห้าม silent fallback). (b) สำหรับ admin role — check `$line_uid` กับ server-side allowlist (wp_user_meta `line_user_id` + role=administrator) ห้ามเชื่อ group_id param เดียว
- ⏱ M (1 day)
- 📎 Evidence:
  ```php
  // line 218 — optional verify
  if ( ! empty( $id_token ) ) { /* verify only if present */ }
  // line 250-253
  if ( $group_id === $admin_group ) { $role = 'admin'; $name = 'DINOCO Admin'; }
  ```

#### S2 — B2F `/auth-admin`: HMAC sig ไม่ bind กับ user → URL-forward = admin
- 📍 `[B2F] Snippet 2: REST API:367-444`, signature compute `:388-391`
- 🧩 Module: B2F Admin LIFF → JWT `b2f_admin` role → unlocks 20+ destructive endpoints (create-po, maker CRUD, receive-goods, record-payment)
- ❓ Signed data = `$path . '|_ts=' . $ts` เท่านั้น — **ไม่มี `line_user_id` ใน signature**. Forward URL admin ใน LINE group → ใครก็ authenticate เป็น admin ได้ 4 ชม. `id_token` optional. HMAC truncate แค่ 16 hex (64-bit) — halves safety. `b2f_is_admin_line_uid()` helper มีอยู่ที่ :452 แต่ไม่ถูกเรียกใน flow นี้
- 🔧 (a) include `line_user_id` ใน signed data → URL bound ต่อ recipient. (b) require id_token verify success. (c) verify $line_uid กับ admin allowlist. (d) raise HMAC เต็ม 64 hex
- ⏱ M
- 📎 Code comment บรรทัด 420-424 ยอมรับ weakness: "ไม่บังคับ WP user เพราะ Admin ใน LINE อาจไม่มี WP account"

#### S3 — OpenClaw: 3 unauth POST ไป MongoDB Atlas
- 📍 `openclawminicrm/proxy/index.js:2751-2753`
- 🧩 Module: MongoDB collections `ai_advice`, `ai_costs` — financial data (`project_finance_confidential.md` ระบุว่าเป็น confidential)
- ❓ 3 routes bypass `requireAuth`: `POST /api/advisor/advice`, `/api/advisor/update-pulled`, `/api/advisor/cost` — spread `req.body` เข้า `insertOne` ตรงๆ ไม่มี schema validation / size cap. `openclawminicrm/CLAUDE.md` ห้ามไว้ชัด "ห้าม expose API endpoints โดยไม่มี requireAuth"
- 🔧 เพิ่ม `requireAuth` middleware ทั้ง 3 endpoints + body size limit (`express.json({ limit: '10kb' })`) + whitelist accepted fields
- ⏱ S (15 min)

#### S4 — Telegram webhook: unsecured fallback bypass secret
- 📍 `openclawminicrm/proxy/index.js:1139-1144`
- 🧩 Module: น้องกุ้ง Telegram Command Center — admin commands (เคลม/ตอบลูกค้า/KB/Lead)
- ❓ Secret-path `/webhook/telegram/${TELEGRAM_WEBHOOK_SECRET}` คือ auth gate ตั้งใจ แต่มี **plaintext fallback** `/webhook/telegram` ที่ accept all POST with comment "accept without secret for easy testing". Handler เชื่อเฉพาะ `chat.id === TELEGRAM_CHAT_ID` — chat.id ไม่ใช่ secret (leak ผ่าน screenshot/error log)
- 🔧 ลบ fallback route. ถ้าต้อง test ใช้ env flag `TELEGRAM_ALLOW_INSECURE=1` off ใน production
- ⏱ S (5 min)

### Database + Schema Drift (3 Critical)

#### DB-C1 — Snippet 0.5 dual-write violates CHECK constraint `chk_confirmed_consistency`
- 📍 `[B2F] Snippet 0.5: Maker Product Dual-Write:137-160` + `:219`
- 🧩 INSERT ... VALUES ตั้ง `confirmation_status='confirmed'` (legacy_cpt save = confirmed) **แต่ไม่ set `confirmed_by/confirmed_at`** ใน SQL. V11 schema (`B2F-SCHEMA-V11.sql:213-220`) มี CHECK: `confirmation_status='confirmed' → confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL`
- ❓ MySQL 8.0.16+ enforce CHECK → INSERT fail → UPSERT ไม่ run → junction stale. Silent — `$ok === false` return WP_Error แต่ caller log only
- 🔧 Add `confirmed_by` + `confirmed_at` เข้า INSERT VALUES เมื่อ `confirmation_status='confirmed'` (set ให้ current_user + NOW())
- ⏱ S (10 min)
- 📎 Audit Phase 4 migration (`:1253-1302`) handle ถูกแล้ว — แค่ dual-write path ยังพลาด

#### DB-C2 — `b2f_read_maker_product` ใช้ `UPPER(product_sku)` non-SARGable
- 📍 `[B2F] Snippet 2: REST API:794`
- 🧩 `SELECT * FROM {$tbl} WHERE UPPER(product_sku) = %s AND maker_id = %d AND deleted_at IS NULL LIMIT 1`
- ❓ `product_sku` เป็น `utf8mb4_bin` → `UPPER(column)` wrap indexed column → MySQL ใช้ `uq_sku_maker` composite unique + `idx_sku` ไม่ได้ → seq scan. Snippet 1:3538 ใช้ `BINARY UPPER(product_sku) = UPPER(%s)` ถูกต้อง (index-eligible)
- 🔧 เปลี่ยนเป็น `WHERE BINARY UPPER(product_sku) = UPPER(%s) AND maker_id = %d` หรือ (เพราะ entry uppercase อยู่แล้ว) `WHERE product_sku = %s`
- ⏱ S (5 min) — **HIGH impact**: called N times per create-po (leaf validation hot path)
- 📎 Same bug at Audit:2606, 2620

#### DB-C3 — `b2b_log_attempt` VARCHAR length mismatch (128 vs 255)
- 📍 `[B2B] Snippet 16:127 (schema)` vs `:200 (insert)`
- 🧩 Schema: `user_agent VARCHAR(128)`; insert: `substr(..., 0, 255)`
- ❓ Default MySQL truncate silent. STRICT mode raise error → insert fail → `order_attempt_log` rows หาย → enumeration detection พัง
- 🔧 Align: `substr(sanitize_text_field(UA), 0, 128)`
- ⏱ S (2 min)

### Bugs (10 Critical, BO system — ส่วนใหญ่ยังไม่มีใครเจอเพราะ flag default OFF)

#### BUG-C1 — BO rate-limit return value mis-check → rate limit **ปิดเงียบๆ**
- 📍 `[B2B] Snippet 16: Backorder System:2298, 2304`
- 🧩 `b2b_rate_limit()` return `true` on allow, `WP_Error` on block (verified Snippet 1:181-226). Snippet 16 check `! b2b_rate_limit(...)` — `!WP_Error(...)` = `false` → WP_Error branch **ไม่เคย** return 429
- ❓ Hour-cap + day-cap ที่ design ไว้ bypass หมด. ทุก caller อื่น (Snippet 3:898, Audit:1817) ใช้ `is_wp_error($rl)` ถูก
- 🔧 ทั้ง 2 sites: `$rl = b2b_rate_limit(...); if ( is_wp_error($rl) ) { return new WP_Error(...); }`
- ⏱ S (10 min) — **Critical** แต่ flag `b2b_flag_bo_system` default OFF ช่วย contain impact

#### BUG-C2 — BO stock **double-subtract** on all-resolved transition
- 📍 Snippet 16:888-900 (bo-split), 1200-1210 (bo-fulfill), 1244 (FSM transition); hook Snippet 2:3653-3746
- 🧩 Hook `dinoco_inv_on_status_change` priority 5 subtract stock ทุกครั้ง `$to_status === 'awaiting_confirm'` + `_stock_deducted` postmeta ไม่ set. bo-split + bo-fulfill subtract manual แต่ **ไม่เคย set `_stock_deducted=1`** → all BO resolve → FSM transition `partial_fulfilled → awaiting_confirm` → hook parse `order_items` (full original qty) → subtract ซ้ำ
- ❓ Non-walk-in: stock ติดลบจริง. Walk-in: `$allow_negative=true` เลย ok แต่ inventory report ผิด
- 🔧 หลัง bo-split + bo-fulfill สำเร็จ: `update_post_meta($order_id, '_stock_deducted', 1);`
- ⏱ S (15 min)

#### BUG-C3 — BO cancelled items ถูกตัดสต็อก + bill เต็ม
- 📍 Snippet 16:1400-1404 (bo-cancel-item)
- 🧩 เมื่อ admin cancel BO row แล้ว rows ที่เหลือ fulfilled หมด → transition `awaiting_confirm` → hook cut stock ของ **SKU ที่ cancel แล้ว** ด้วย (ของไม่ได้ส่งจริง). `total_amount` ไม่ recompute → ลูกค้าถูกเรียกเก็บยอดเดิม
- ❓ Stock + accounting ทั้งคู่ผิด
- 🔧 Exclude cancelled SKU จาก order_items text ตอน transition หรือ set `_stock_deducted=1` ก่อน. Recompute `total_amount` + `b2b_recalculate_debt()` หลัง cancel-item
- ⏱ M (30 min)

#### BUG-C4 — `b2f_format_po_detail()` PII gate self-defeat
- 📍 `[B2F] Snippet 2:2617-2626`
- 🧩 Pattern: `$is_admin_gate = (bool)$include_sensitive && current_user_can('manage_options');` (ถูก) → ตามด้วย `if ($include_sensitive && !$is_admin_gate) { $is_admin_gate = true; }` — **ย้อน gate กลับ**
- ❓ ถ้า caller ส่ง `$include_sensitive=true` จาก context ที่ไม่มี cap (stale JWT, custom callback bug) → PII leak (`intent_notes`, `production_mode_snapshot`, `_b2f_order_intent_summary`). วันนี้ยัง safe เพราะไม่มี caller ส่ง true จาก non-cap context — future risk เต็มๆ
- 🔧 ลบ `if ($include_sensitive && !$is_admin_gate)` block. ถ้า admin-LIFF (X-B2F-Token) เป็น legitimate case → verify token จริงๆ ข้างใน
- ⏱ S (5 min) — defense-in-depth restore

#### BUG-C5 — `bo_confirm_full` / `bo_reject` LINE postback → **ไม่มี dispatcher**
- 📍 Snippet 16:2191-2223 (`add_filter('b2b_webhook_postback_action', ...)`). Snippet 2:519-612 (`b2b_handle_postback`) **ไม่เคย** `apply_filters('b2b_webhook_postback_action', ...)` → switch fall through `default`
- 🧩 Admin Flex buttons ใน stock-review bucket dispatch postback `action=bo_confirm_full` / `bo_reject` → log "Unknown postback action" → admin **confirm/reject ผ่าน LINE ไม่ได้**. ทำได้เฉพาะ Admin Dashboard UI
- 🔧 เพิ่ม `apply_filters('b2b_webhook_postback_action', false, $action, $params, $user_id, $reply_token)` ใน Snippet 2 dispatcher หรือ case ตรงๆ
- ⏱ S (15 min) — critical integration gap

#### BUG-C6 — BO C1 listener transition ที่ place-order → customer **confirm_order ไม่เข้า opaque flow**
- 📍 Snippet 16:2374-2421, Snippet 2:619-710
- 🧩 C1 hook fire ที่ `place-order` (ก่อน customer เห็น draft Flex) → transition `draft → pending_stock_review`. ลูกค้ากด "ยืนยัน" บน draft Flex → Snippet 2 เห็น status ≠ 'draft' → reply "ส่งรายการไปแล้ว ประวัติ..." แทน opaque "✅ รับคำสั่งซื้อ #X ⏳ แอดมินตรวจสอบ 2-4 ชม."
- ❓ Customer ไม่ได้ opaque UX ตาม spec. Admin-notify + daily counters fire ก่อน customer จริงๆ ยืนยัน → customer-abandoned orders ก็ขึ้น Admin
- 🔧 ลบ C1 listener transition หรือ gate บน stage แยก "pre-confirm". ให้ Snippet 2 `b2b_action_confirm_order` BO block (:665-710) เป็น single transition point
- ⏱ M (1 hr)

#### BUG-C7, C8, C9, C10 — BO race conditions + data integrity (detail ดู Code Review report agent)
- **C7** State drift หลัง undo+split+fulfill (stock subtract ซ้ำ edge case)
- **C8** Admin Flex snapshot uppercase → Flex OK, `/bo-order-detail` response = dead data (ไม่ใช้)
- **C9** bo-split ไม่ lock parent order row → concurrent admin split มีโอกาส double-insert bo_queue
- **C10** bo_queue `item_index` เป็น loop index — unstable ข้าม re-split

### UI/UX (3 Critical blockers)

#### UX-C1 — Customer dead-end: `pending_stock_review` ไม่มีปุ่มยกเลิก (72h lockup)
- 📍 `[B2B] Snippet 16:3385-3393` + `[B2B] Snippet 11:473`
- 🧩 pending_stock_review แสดงเฉพาะ "⏳ รอตรวจสอบ 2-4 ชั่วโมง" — ไม่มีปุ่ม cancel / admin contact / countdown. ลูกค้า lock 72h จนกว่า cron จะ auto-cancel
- ❓ สั่งผิดแก้ไม่ได้ → ลูกค้าโทรหา admin → admin overhead + churn risk
- 🔧 เพิ่มปุ่ม "ขอยกเลิกออเดอร์" (ใช้ `/cancel-request` เดิม) + countdown + admin contact
- ⏱ M (2 hr)

#### UX-C2 — BO Admin UI ใช้ native `confirm()`/`alert()`/`prompt()` **22 ครั้ง** (destructive actions)
- 📍 `[B2B] Snippet 16:2674-3003` scattered
- 🧩 Split BO / Reject / Cancel / Fulfill / Flag toggle ใช้ `confirm("ยืนยันสต็อกเต็ม?")` + `prompt("เหตุผล:")` + `alert("✅ สำเร็จ")`
- ❓ (1) ข้อความ URL-bar ดูน่ากลัว admin กลัวกด (2) iOS Safari บางเวอร์ชัน block (3) `alert()` block UI 300ms+ (4) error ไม่มี categorization (5) empty-string bypass (`prompt()` return "" → pass ไม่เป็น null)
- 🔧 Migrate เป็น proper Modal pattern ตาม memory `feedback_modal_appendchild.md` — คล้าย `showClaimStatusModal` ใน LIFF AI
- ⏱ L (1 day) — เจอ 22 sites + 15 เพิ่มใน B2F Snippet 5 → total 37 sites

#### UX-C3 — Mode badge amber (B2F V.7.0) **fail WCAG AA** — 4.3:1 contrast
- 📍 `[B2F] Snippet 8: Admin LIFF E-Catalog:699` (`color: #d97706; background: #fef3c7`)
- 🧩 Ratio ~4.3:1 (need 4.5:1 text <18pt) + text 9px → unreadable สำหรับ light-sensitive users. Propagate ไปทั่วระบบ (LIFF, Admin Tabs V.7.1, PO Ticket V.3.6, PO Image V.3.0)
- 🔧 Darken เป็น `#b45309` → ~5.9:1 (variable `--b2f-accent-hover` มีแล้ว)
- ⏱ S (5 min) — 1 line CSS change, impact กว้าง

**Also UX-C4 (same pattern)**: BO `partial_fulfilled` customer header — white บน `#f59e0b` = **2.5:1** (fails hard)

### API Contracts (2 Critical)

#### API-C1 — `image-proxy` SSRF gated by admin only แต่ไม่ block internal IP ranges
- 📍 `[Admin System] DINOCO Global Inventory Database:1313-1351`
- 🧩 URL filter reject เฉพาะ non-http/https scheme. ไม่ check hostname → fetch `http://localhost:*`, `127.0.0.1`, `agent:3000` (Docker internal), `169.254.169.254` (cloud metadata)
- ❓ Compromised admin / XSS-exploited admin session → map internal services + timing-infer host topology
- 🔧 After `wp_parse_url`: resolve hostname + reject if ใน private ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16). DNS-rebinding safe (resolve once, fetch same IP)
- ⏱ M (1 hr)

#### API-C2 — Brand Voice Pool global CORS removal (pre-audit finding, verify still)
- 📍 `[Admin System] DINOCO Brand Voice Pool:300` (global filter)
- 🧩 Filter removal scope กว้างเกินไป — ต้อง scope เฉพาะ `/brand-voice/*` URI
- 🔧 เปลี่ยน filter scope + test ว่า REST API อื่นไม่ถูกกระทบ
- ⏱ S (5 min)

---

## 🟡 High Priority (fix within 1 week)

### Security High
- **S5** — B2F Migration Audit destructive POST (`activate-schema`, `backfill`, `phase4-migration`, `junction-bulk-delete`, `junction-*-classification`, `autosync-blacklist POST`, `feature-flags/toggle`, `purge-stale-prices`) ขาด CSRF nonce verification [`[Admin System] B2F Migration Audit:1797-1799`]. Dashboard ส่ง `X-WP-Nonce` แต่ permission_callback ignore
- **S6** — `npm audit` high: path-to-regexp 8.0.0-8.3.0 ReDoS (via express 5.2.1) — openclawminicrm/proxy
- **S7** — multer 1.4.x **EOL Dec 2024** + CVE-2023-52221 — bump to v2.x
- **S8** — vite 8.0.0-8.0.4: 3 high CVEs (path traversal + server.fs.deny bypass + WebSocket file read) — root + brand-voice-extension
- **S9** — OpenClaw 5 routes missing requireAuth: `/api/costs`, `/api/free-models`, `/advice`, `/api/advisor/sources-changed`, `/api/km/search`
- **S10** — RPi `/api/ticket-lookup/{id}` + `/api/pno-lookup/{pno}` unauth — enumeration vector

### DB High (8 findings)
- **DB-H1** — po_cost_map SKU case mismatch → WAC silently NULL [`Snippet 2:4380-4403`]
- **DB-H2** — Soft-delete semantics split (`status='discontinued'` vs `deleted_at IS NOT NULL`) — dual model confusing
- **DB-H3** — BO queue FOR UPDATE ไม่ lock gap-scan — theoretical deadlock risk
- **DB-H4** — N+1 ใน `b2b_bo_ready_customer` + `bo_cancelled_customer` Flex builders [Snippet 16:1995-2010, 2083-2085]
- **DB-H5** — `b2f_read_maker_product` fallback CPT `meta_query` เมื่อ junction miss — Phase 4 active → pile-up บน postmeta
- **DB-H6** — Phase 4 lock `b2f_phase4_migration_in_progress` option ไม่มี auto-expire → fatal mid-run = lock ค้างตลอดกาล
- **DB-H7** — `b2f_diff_cron_hourly` 500 rows × 6 `get_field()` = **~3,000 ACF reads/hr** (not gated by shadow_write flag)
- **DB-H8** — Observations TTL cron bulk DELETE w/o chunking → table lock หลายนาทีบน 110K rows

### Bugs High (13 findings — สำคัญสุด 6 ตัว)
- **BUG-H1** — `rest_prepare_post` filter [Snippet 16:2427] dup เปล่าๆ (superseded by :3352) — ทุก REST call pay cost
- **BUG-H2** — `_b2b_enumeration_flags` bit field **overwrite ไม่ OR-combine** → multi-flag dealer เห็นแค่ flag ล่าสุด
- **BUG-H3** — BO debt ใช้ `base_price` (retail) ไม่ใช่ `b2b_compute_dealer_price()` (tier-discounted) → **dealer ถูก over-charge**
- **BUG-H4** — BO split/fulfill skip debt ถ้า `b2b_get_product_data` missing → silent accounting hole
- **BUG-H5** — `b2f_rest_po_undo_submit` expose `post_date` (non-GMT) ใน error response → confusing TZ
- **BUG-H7** — `b2f_junction_update_classification` enum mismatch (`single` vs `single_leaf`) ระหว่าง frontend deriveOrderMode + backend validator; + `b2f_infer_legacy_order_mode` ออก `raw_parts`/`partial_replenish` ไม่อยู่ใน enum ทั้ง 2 ตัว
- **BUG-H8** — Flag `b2f_flag_ungroup_auto_hide` **orphan** — defined, UI-toggleable, dependency-checked, **never consumed**
- **BUG-H9** — `b2b_flag_bo_beta_distributors` whitelist ไม่มี UI — admin ต้องแก้ SQL
- **BUG-H10** — `b2f_dualwrite_infer_classification` missing_leaves นับแค่ 1 level (DD-3 deep hierarchies miscompute)

### Performance High (12 findings — Top 5)
- **PERF-H1** — `DINOCO_Catalog::get_by_sku()` ไม่มี static memoization → called 3× per product × N products [Snippet 15:341-346]. **Quick win #1**
- **PERF-H2** — `/b2f/v1/dashboard-stats` — 12 COUNT queries + N×2 per-maker loop, **ไม่มี cache** [Snippet 2:5020-5120] → TTFB 800ms
- **PERF-H3** — `/b2f/v1/makers` list — 18 queries per maker (not capped `posts_per_page=-1`) → 30 makers = 570 queries
- **PERF-H4** — `bo-summary` polled 60s × 3 admins × 4 queries = **288 queries/hr just for badge** (ไม่ cache, `meta_value > 0` full scan)
- **PERF-H5** — Inventory `GET /stock/list` **INSERT during GET** (auto-sync missing rows) → write-lock contention
- **PERF-H6** — Admin Dashboard LIFF B2F = **155KB inline** HTML per render (no minification, no build pipeline)
- **PERF-H7** — BO admin shortcodes ไม่อยู่ใน `$cacheable_modules` → re-render ทุก tab switch
- **PERF-H8** — `b2b_flash_tracking_cron` 200 orders × per-post meta reads (no `update_meta_cache` prime)
- **PERF-H9** — `/b2b/v1/order-history` 6× `get_field` per order × 50 = 300 uncached meta fetches
- **PERF-H10** — `bo-queue` N+1 via `get_the_title` + `get_field` × 3 per row × 500 rows

### UI/UX High (20 findings — ดู detail ใน UX agent report — Top 8)
- **UX-H1** — B2F Audit + BO Admin **0 media queries** — destructive Phase 4 buttons unreadable บน mobile
- **UX-H4** — 0 explicit `<label for="">` ใน 3 major forms (B2B Catalog, B2F Admin, BO Admin)
- **UX-H5** — 103 product images `alt=""` (informational images fails WCAG 1.1.1)
- **UX-H7** — Modals **ไม่มี ESC-to-close** ทั่วทั้งระบบ
- **UX-H8** — Modals **ไม่มี focus trap** — keyboard user tab ออกไป background
- **UX-H11** — Admin Dashboard sidebar 3 new BO tabs + 3 B2F Migration tabs — ไม่มี "system health" master indicator (flag state visible ที่เดียว)
- **UX-H13** — B2F Snippet 5 มี `confirm()/prompt()` อีก 15 ครั้ง (reject-lot, close without payment — admin ตัดสินใจเร็วไป)
- **UX-H18** — iOS swipe-back บน LIFF → exit LIFF (no `liff.openWindow` wrapper)

### API High
- **API-H1** — `/b2b/v1/settings` + `/print-settings` — double-register ใน Snippet 9 (2 `register_rest_route` calls for same path)
- **API-H2** — MCP Bridge API key auto-generate TOCTOU [`[System] DINOCO MCP Bridge:55`] — race ระหว่าง check + create
- **API-H3** — Flash webhook signature verify แต่ไม่ dedup nonceStr → **replay attack** window (no transient cache on nonce)
- **API-H4** — Idempotency: 75+ mutating POST endpoints ไม่รองรับ `Idempotency-Key` header (มีแค่ `junction-bulk-update-display` + LINE webhook dedup)
- **API-H5** — No OpenAPI/Swagger spec — schema drift risk ระหว่าง FE-BE

---

## 🟢 Medium / Low

รวบรวมจากทุก agent — **ดู appendix 📎** สำหรับ full list. Highlights:

- **DB-M1** — `b2f_format_maker_product` call `get_field('maker_currency', $maker_id)` per product (O(N) — prime once outside loop)
- **DB-M2** — `b2f_dualwrite_infer_classification` SELECT COUNT ต่อ INSERT (batch-able)
- **DB-M6** — `wp_dinoco_products.stock_qty INT UNSIGNED` + walk-in `$allow_negative=true` = MySQL clamp 0 + warning. Schema ต้อง signed INT
- **PERF-M1..M15** — stampede protection, per-user cache, WebP, `fetchpriority`, visibility-gated polling, postmeta compound index, etc.
- **BUG-M1..M18** — XSS pattern risk (not exploitable today), postback param parsing, magic numbers, inline CSS duplicates, dead code (10 orphans — ดู Dead Code section)
- **UX-M1** — 2 font families coexist (Noto Sans Thai 118 matches + Sarabun 20) — design drift
- **UX-M2** — Status label inconsistency (3 variants ของ "รอตรวจสอบ")
- **UX-M3** — Breadcrumb style drift ระหว่างหน้า
- **API-M** — Error response format ไม่ standardize (WP_Error vs custom — no RFC 7807)

---

## 🎨 UI Polish (not critical, quality win)

20 items (P1-P20 in UX agent report) — Highlights:
- SET Detail qty stepper ไม่มี MOQ hint → overshoots then error
- B2F cart "รายการ" count ใช้ Σqty ไม่ใช่ distinct SKU → inflated number
- Model filter chips horizontal scroll ไม่มี fade indicator
- Empty state + "CTA to next action" หายไปหลายที่
- Icon-only buttons lack text fallback for emoji-fail browsers
- No haptic / sound feedback on cart add
- Backbutton pattern 3-4 variants across modules

---

## 📘 Doc Drift (Second Brain / CLAUDE.md vs code)

| Item | Doc says | Code reality | Action |
|------|----------|--------------|--------|
| Cron name `b2f_junction_diff_cron` | CLAUDE.md references this hook | Snippet 11:60,604 registers `b2f_diff_cron_hourly` | Rename or fix docs |
| Slip2Go webhook | CLAUDE.md claims webhook integration | No webhook registered — slip verification is **PULL** (WP → Slip2Go) | Update CLAUDE.md |
| REST endpoint count | CLAUDE.md claims 73+ | Actual ~125 (includes MCP namespace) | Update CLAUDE.md |
| MCP Bridge endpoint count | CLAUDE.md claims 32 | ~32 confirmed (matches) | ✅ OK |
| V.7.0 Order Intent rollout | CLAUDE.md says "flags OFF default, no canary" | Flag `b2f_flag_ungroup_auto_hide` **orphan** (never consumed) | Either implement or remove |
| Sprint 4 M15 "12 color tokens + 3 POC" | CLAUDE.md claims adopted | 60+ inline hex still across snippets; 2 fonts (Noto + Sarabun) coexist | Partial adoption — continue |
| LICENSE | Not specified anywhere | No LICENSE file | Add (GPL v2+ implied by WordPress) |
| GDPR/PDPA | No mentions | No data export/deletion endpoints | Add per PDPA requirements |

---

## ⚡ Top 10 Quick Wins (<1h each, high impact)

1. ✅ **Add static memo ใน `DINOCO_Catalog::get_by_sku()`** — 15 min, −50-150ms ทุก endpoint ที่ format items. File `[B2B] Snippet 15:341-346` [PERF-H1] — **APPLIED 2026-04-17 (Phase 1 remediation · Snippet 15 V.7.6)**
2. ✅ **Fix `!b2b_rate_limit()` → `is_wp_error($rl)` ใน BO** — 10 min, restore rate limiting ที่ถูก silenced [BUG-C1] — **APPLIED 2026-04-17 (Snippet 16 V.1.7)**
3. ✅ **Remove `!$is_admin_gate` self-revert ใน `b2f_format_po_detail()`** — 5 min, restore PII defense-in-depth [BUG-C4] — **APPLIED 2026-04-17 (B2F Snippet 2 V.11.4)**
4. ✅ **Fix amber mode badge contrast `#d97706 → #b45309`** — 5 min CSS, WCAG AA fix across B2F UIs [UX-C3] — **APPLIED 2026-04-17 (B2F Snippet 8 V.7.4 + Snippet 5 V.7.4)**
5. ✅ **Add 3 BO shortcodes to `$cacheable_modules`** — 5 min, −200-500ms BO tab switch [PERF-H7] — **APPLIED 2026-04-17 (Admin Dashboard V.32.6)**
6. ✅ **Wrap `setInterval(fetchBoBadge)` with `document.visibilityState`** — 5 min, −50% admin polling load [PERF-M15] — **APPLIED 2026-04-17 (Admin Dashboard V.32.6)**
7. ✅ **Fix VARCHAR(128) vs substr(255) in b2b_log_attempt** — 2 min, restore STRICT-mode compatibility [DB-C3] — **APPLIED 2026-04-17 (Snippet 16 V.1.7)**
8. ⏳ **Add `update_meta_cache` to `/order-history` + `/bo-queue`** — 15 min, −200-400ms + eliminate 150-1500 uncached reads [PERF-H9, H10] — deferred (Phase 2)
9. ✅ **Remove Telegram unsecured fallback `/webhook/telegram`** — 5 min, close unauth command path [S4] — **APPLIED 2026-04-17 (openclawminicrm/proxy/index.js)**
10. ✅ **Run `npm audit fix` in 3 roots** — 5 min, close path-to-regexp + vite CVEs [S6, S8] — **APPLIED 2026-04-17 (path-to-regexp 8.3.0→8.4.2, vite 8.0.3→8.0.5+)**

**Phase 1 remediation status (2026-04-17)**: 9/10 applied (item 8 deferred as Phase 2 dependency).
Also applied in Phase 1: **BUG-H1** (dup `rest_prepare_post` removed, Snippet 16 V.1.7) + **BUG-H2**
(enumeration-flag bit-field OR-combine, Snippet 16 V.1.7) + **BUG-H8** (orphan flag
`b2f_flag_ungroup_auto_hide` already removed in upstream commit 9e70b4c — V.7.2 headers
confirm removal is live).

**Phase 2 queue** (next sprint): Auth hardening (S1 LIFF AI admin impersonation + S2 B2F
HMAC sig bind + S3 OpenClaw unauth POSTs), BO stock double-subtract (BUG-C2/C3/C5/C6/C7),
LINE postback dispatcher (BUG-C5), Phase 4 migration dry-run.

**Total Phase 1 effort**: ~1.5 hr. **Expected impact achieved**: closed 5 Critical + 4 High
+ restored rate limiting on BO place-order + WCAG AA across amber surfaces + perf gain on
hot endpoints + 0 npm vulnerabilities across 3 lockfiles.

---

## 🗺 Migration Roadmap — Option F (B2F CPT → Junction) Phase 4 Completion

ไม่ใช่ stack migration (ยังคง WordPress) — เป็น **in-progress data migration** ที่ควรปิดให้จบก่อน accumulate drift เพิ่ม:

### Current state
- Phase 1 (observe): ✅ complete
- Phase 2 (shadow-write): ✅ ON (V.2.0, 2026-04-15)
- Phase 3 (cut-over reads): ✅ ON (`b2f_flag_read_from_junction=true`, 2026-04-16) — 116 rows in junction
- Phase 4 (CPT retirement): ⏳ ready to run but not executed

### Required before Phase 4 Live
1. **Fix DB-C1** (Snippet 0.5 CHECK violation) — หรือ Phase 4 จะ fail บน MySQL 8.0.16+
2. **Fix DB-C2** (non-SARGable UPPER) — เพราะ Phase 4 run `b2f_read_maker_product` นับ千ครั้ง → seq scan = runtime balloon
3. **Fix DB-H6** (stale lock auto-expire) — ถ้า Phase 4 crash mid-run ต้องไม่ lock ตลอดกาล
4. **Close Phase 4 migration concurrency** — add banner "⚠️ Phase 4 กำลังดำเนินการ" บน all admin tabs (UX-D4)
5. **Implement `b2f_flag_ungroup_auto_hide` consumer** (BUG-H8) หรือ remove flag
6. **Verify MySQL version ≥ 8.0.16** ใน production — disable Phase 4 Live ถ้าต่ำกว่า (UX-D5)

### Rollout plan
- Week 1: fix 6 items above (est. 12-16h)
- Week 2: run Phase 4 dry-run บน staging → verify CSV output
- Week 3: Live Phase 4 migration → monitor observations table diff_detected ~72 ชม.
- Week 4: drop `b2f_maker_product` CPT (ALTER DROP or trash) — confirm no readers left
- Week 5+: monitor + close residual

### Rollback
- Flip `b2f_flag_read_from_junction=false` → reads revert CPT ทันที (junction intact)
- CPT data untouched จนถึง Week 4 final drop

### Success metrics
- Phase 4 dry-run: 0 `missing_from_junction` rows
- Observations diff_detected rate < 0.1% over 72 hr
- No fatal errors in error_log mentioning `b2f_maker_product` missing columns
- Junction query p95 latency < 50ms (vs current CPT meta_query p95 ~200ms)

---

## 📎 Appendix

### A. Full findings sorted by severity (200+ items)
ดู individual agent reports บน terminal output (agentIds in footer).

### B. npm audit raw output

**openclawminicrm/proxy/:**
```
path-to-regexp 8.0.0-8.3.0 — high — ReDoS (GHSA-j3q9-mxjg-w52f + GHSA-27v5-c462-wpq7)
1 high severity vulnerability
fix: npm audit fix
```

**root + brand-voice-extension/:**
```
vite 8.0.0-8.0.4 — high
- Path Traversal in Optimized Deps `.map` Handling (GHSA-4w7w-66w2-5vf9)
- server.fs.deny bypassed with queries (GHSA-v2wj-q39q-566r)
- Arbitrary File Read via Vite Dev Server WebSocket (GHSA-p9ff-h696-f583)
1 high severity vulnerability
fix: npm audit fix → vite ≥ 8.0.5
```

### C. Hardcoded secrets audit
- **No hardcoded secrets found** in source. `.env*` correctly gitignored
- No Gemini/Anthropic API keys, no Bearer tokens, no `sk-*` patterns in last 30 commits
- Only `openclawminicrm/.env.example` tracked (template only)

### D. Dependency EOL summary
| Package | Installed | Status | Action |
|---------|-----------|--------|--------|
| multer (proxy) | ^1.4.5-lts.2 | **EOL Dec 2024** | bump to 2.x (minor API change) |
| PHP | 8.0+ implied | 8.0 EOL Nov 2023, 8.1 EOL Dec 2025 | verify prod PHP 8.2+ |
| Python (RPi) | 3.8+ inferred | EOL Oct 2024 | upgrade to 3.11+ |
| Node.js (OpenClaw) | 18 LTS | EOL Apr 2025 | upgrade to 20 LTS |
| MySQL | 5.7+ inferred | 5.7 EOL Oct 2023 | verify prod — V.11 CHECK needs 8.0.16+ |
| vite | ^8.0.3 | vulnerable | bump ≥ 8.0.5 |
| express (proxy) | ^5.2.1 | current | pulls vulnerable path-to-regexp — fix transitively |

### E. Cron job inventory (30+ jobs — see full table in perf agent report)
- 🔴 `b2f_diff_cron_hourly` — 3000 ACF reads/hr (C6) — gate on shadow_write flag
- 🟡 `b2b_bo_restock_scan_cron` 15min — scales O(pending BO), chunk if > 500 rows
- 🟡 `b2b_bo_enumeration_scan_cron` hourly — postmeta full scan on `_b2b_enumeration_flags`
- 🟡 `b2b_flash_tracking_cron` every 2hr — 200 orders × meta reads (no cache prime)
- 🟢 Most others lightweight (daily/weekly, < 5s runtime)

### F. Transient cache audit — see perf report table
- **Missing caches**: `/b2f/v1/dashboard-stats`, `/bo-summary`, `/b2f/v1/makers` (Top 3 quick wins)
- **Stampede risk**: `b2b_sku_data_map` TTL 300s — add `wp_cache_add` lock for stale-while-revalidate

### G. Dead code / orphans
1. **Flag `b2f_flag_ungroup_auto_hide`** — declared, UI-toggleable, dependency-checked, **never consumed** [BUG-H8]
2. **Parameter `snapshotParam` in `b2bBoOpenSplit(orderId, snapshotParam)`** — never used downstream [Snippet 16:2692]
3. **`rest_prepare_post` filter at Snippet 16:2427** — dup of :3352
4. **`stock_snapshot` snapshot data unused** — Admin Flex builder sets but downstream not read
5. **`b2f_infer_legacy_order_mode` returns `raw_parts`/`partial_replenish`** — not in enum, fails validator if re-submitted
6. **5 OpenClaw `catch(()=>{})` swallows** — optional AI fallbacks, no telemetry on silent failures
7. **Comment "if Snippet 3 รองรับ" at Snippet 16:2232** — hook `b2b_place_order_pre_validate` never existed

### H. Files with missing version bumps or annotations
- `[B2B] Snippet 10: Invoice Image Generator` — status: deprecated per docs but ยังอยู่ (Puppeteer overhead)
- Virtual SET inject V.9.14-V.9.16 → reverted V.9.17 → partial re-enable V.9.19 opt-in — complex history, docs partially updated

---

## Top-of-mind for next review cycle

1. **Automated tests for WordPress snippets** — current 0% coverage; start with critical FSM paths (Snippet 14 + 6)
2. **Build pipeline for LIFF frontends** — inline HTML 155KB per render is not sustainable as features grow
3. **GDPR/PDPA compliance** — add data export + deletion endpoints before Thai PDPA enforcement tightens
4. **Observability layer** — Sentry/Rollbar integration + correlation IDs across WP + OpenClaw + RPi
5. **Feature flag governance** — formal deprecation process + audit log แสดง orphan flags ทุก quarter

---

**Report compiled**: 2026-04-17 · 7 parallel agents (security-pentester, database-expert, performance-optimizer, code-reviewer, ux-ui-expert, Explore/architecture, api-specialist) · **read-only** — no code changes

Agent IDs (for follow-up via SendMessage):
- security-pentester: `a5d584bcbfa75ffde`
- database-expert: `af0ea67c5edad8298`
- performance-optimizer: `ad3f819444b974e64`
- code-reviewer: `a4d4aefc583561dcd`
- ux-ui-expert: `aae53020a15eaf332`
- api-specialist: `ae353006c3066c2eb`
- Explore architecture: see last agent output in conversation
