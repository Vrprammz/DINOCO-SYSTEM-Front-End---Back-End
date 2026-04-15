# Feature Spec: B2B Backorder System (Hard Cap + Opaque Accept + Admin Split)

**Version**: 1.0
**Date**: 2026-04-16
**Author**: Feature Architect
**Status**: Draft — Ready for security review + database-expert review
**Target Audience**: tech lead, database-expert, fullstack-developer, security-pentester
**Supersedes**: Issue #2 section of `FEATURE-SPEC-B2F-HIERARCHY-B2B-BO-2026-04-16.md`
**Related**: [[B2B Backorder]] [[Stock Enumeration Attack]] [[B2B Order FSM]] [[B2B Debt System]] [[Walk-in Distributor]] [[Inventory System]] [[Rate Limiting]]

---

## Executive Summary

Feature นี้ปิดช่องโหว่ **stock enumeration attack** ใน B2B place-order + เพิ่ม **opaque accept pipeline** + **admin split BO workflow**. เปลี่ยนปรัชญาจาก "เช็คสต็อก realtime ตอนสั่ง" → "รับคำสั่งซื้อแบบ opaque แล้วให้ admin ตัดสินใจ split ตอน review"

### Three Pillars

1. **Opaque Accept**: place-order ไม่เช็คสต็อก → agent ไม่มีทาง probe inventory
2. **Admin Split**: Admin เห็น stock delta (enumeration-safe เพราะ admin ได้รับอนุญาต) + กด "Split BO" ได้ใน 1 คลิก
3. **Combined Notification**: ลูกค้าเห็น Flex เดียวที่บอก "ส่งทันที X + รอสต็อก Y (ETA)" ไม่รู้ว่าสต็อกเหลือเท่าไหร่

### Severity & Estimated Effort

- 🟠 **P2 Large** — 7 วัน implementation + 1 สัปดาห์ beta rollout
- **Risk**: high (กระทบ order flow + debt + invoice + Flash shipping)
- **Deploy strategy**: 4-phase feature flag rollout

---

## 1. Problem & Goal

### 1.1 Current State (Verified from code)

**File references**:
- `[B2B] Snippet 3: LIFF E-Catalog REST API` line 628+ — `b2b_rest_place_order()`
- `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` line 3628-3691 — stock cut at `awaiting_confirm`
- `[B2B] Snippet 14: Order State Machine` line 25-85 — FSM transitions
- `[B2B] Snippet 1` line 146-165 — `b2b_rate_limit()` helper

**Current flow**:
```
Agent LIFF → POST /place-order
  ↓ duplicate guard (transient 30s)
  ↓ credit_hold check
  ↓ price lookup (server-side)
  ↓ items ≤50 check
  ↓ NO STOCK CHECK
  ↓ create post_type=b2b_order, status=draft (or checking_stock)
  ↓ LINE Flex → admin group "ตรวจสอบสต็อก"
  ↓ admin clicks "ยืนยัน" → FSM: checking_stock → awaiting_confirm
  ↓ b2b_order_status_changed hook (priority 5) → dinoco_stock_subtract()
  ↓ if not enough → cap 0 (or negative if walk-in)
```

**Existing rate limits** (from Snippet 1 line 155):
```php
b2b_rate_limit($key, $max=10, $window=60)  // generic transient-based
```
- `/cancel-request` uses `b2b_rate_limit('cancel_'.$group_id, 5, 60)` (5 per 60s)
- `/place-order` has ONLY duplicate-guard (30s dedup per items hash)
- **No qty cap, no daily limit, no per-SKU cap**

### 1.2 Problems Identified

**P1 — Stock Enumeration Attack**:
- Agent สร้าง order qty=1000 → admin กดยืนยัน → stock cap 0 (หรือติดลบ) → agent cancel
- Agent สร้าง order qty=500 → stock cap < 500 → infer stock ≤ 500
- Binary search: 1000 → 500 → 250 → 125 → ~10 attempts เจอ exact count
- **Impact**: คู่แข่ง/ตัวแทนทุจริตรู้ inventory ของ DINOCO

**P2 — Cancel+Retry Probe**:
- Place order → cancel → place order ใหม่ → cancel (probe inventory โดยไม่ commit)
- Current cancel rate limit = 5/60s → 300 probes/hour possible

**P3 — Race Condition on Same SKU** (exists even with FOR UPDATE):
- A สั่ง 5, B สั่ง 5, stock=8 → FSM lock กันไม่ให้ oversell (ok) แต่ B ได้ 0 โดยไม่มี recourse
- Current code: B's order goes to `awaiting_confirm` with qty=5 but stock=0 → ship process fails downstream

**P4 — No Partial Fulfill Concept**:
- ตัวแทนต้องรอทั้งออเดอร์ หรือ cancel → ไม่มี "ส่งบางส่วนก่อน" workflow
- Admin ต้องทำเอง manually (split order + adjust debt + re-invoice)

**P5 — Walk-in Bypass Reveals Stock**:
- Walk-in uses `allow_negative=true` → stock ติดลบได้ + displayed ใน admin → infer normal stock via cross-reference

### 1.3 Goals

**Functional**:
1. ตัวแทนสั่งได้เสมอ (opaque accept) — error เฉพาะ qty abuse/rate limit
2. Admin review เห็น stock delta → กด Split BO ได้ใน 1 คลิก
3. Customer Flex notification รวม "ส่งทันที + BO" ใน 1 ข้อความ
4. BO resolve tracking + restock auto-notify

**Non-Functional**:
1. **Zero stock info leak** ใน error messages + customer Flex + LIFF response
2. **Constant-time responses** สำหรับ place-order (ไม่เผย qty delta ผ่าน timing)
3. **Audit trail** ทุก order attempt + cancel + split
4. **Backward compat** — Walk-in flow + existing orders ไม่กระทบ

### 1.4 Success Metrics

| Metric | Current | Target (90 days post-launch) |
|---|---|---|
| Stock info leak via error msg | high (qty cap revealed) | 0 (constant generic msg) |
| Enumeration attempts detected | 0 (no detection) | 100% logged + alerted |
| BO resolve time (median) | N/A (manual split) | ≤48h |
| Partial-fulfill orders | 0% | ≥15% of orders with insufficient stock |
| Admin split clicks per split | N/A | ≤2 clicks |
| Agent cancel rate | baseline | ±5% (expect slight drop — opaque accept reduces probing) |

---

## 2. Threat Model

### 2.1 Attack Vectors

#### Vector A — Qty Binary Search (current: OPEN)
```
Goal: Learn exact stock of SKU X
Steps:
  1. Place order qty=1000 → admin confirms → stock cap 0 → agent sees 0 shipped in ticket
  2. Cancel order → stock restored
  3. Place qty=500 → admin confirms → observe cap result
  4. Repeat binary search
  Cost: ~log2(stock) attempts × (minutes per admin response)
Leak: log2(max_stock) bits of info per session
```
**Mitigation**: Opaque accept + admin-only visibility of stock delta + constant-time error messages

#### Vector B — Rapid Cancel+Retry (current: LIMITED — 5/60s)
```
Goal: Probe inventory without committing (avoid admin suspicion)
Steps:
  1. place-order qty=X → don't wait for admin → immediate cancel-request
  2. Observe: ticket status changes based on stock presence
Leak: per-SKU availability boolean + approximate qty via timing
```
**Mitigation**: Tighter cancel rate limit (2/hr/distributor) + cancel only allowed in draft/checking_stock states + NO stock info in cancel response

#### Vector C — Multi-Order Parallel Probe
```
Goal: Enumerate across multiple orders simultaneously to evade rate limits
Steps:
  1. Create 5 orders with different qty values (10, 100, 500, 1000, 5000)
  2. Admin confirms in batch → observe cap results across tickets
Leak: 5 data points per admin batch
```
**Mitigation**: Per-distributor daily qty cap + anomaly detection (>3 large orders in 1h flagged)

#### Vector D — Cross-SKU Correlation
```
Goal: Infer total warehouse capacity
Steps:
  1. Order every SKU in catalog qty=large
  2. Observe caps → sum = warehouse capacity estimate
```
**Mitigation**: Daily total value cap per distributor tier + admin review gate

#### Vector E — Timing Side-Channel
```
Goal: Infer stock availability via response time
  - fast accept = stock available (no split needed later)
  - slow accept = stock issue detected
```
**Mitigation**: place-order ALWAYS takes same code path (no stock check) → constant latency

#### Vector F — Walk-in Negative Stock Leak
```
Goal: Use walk-in account to ship unlimited → cross-reference with normal orders
```
**Mitigation**: Walk-in orders flagged; stock display rules exclude walk-in commits from dealer-facing views

### 2.2 Rate Limit Matrix

| Action | Scope | Window | Max | Rationale |
|---|---|---|---|---|
| `place-order` | per distributor | 1 hour | 10 | Normal dealers place <3/day; attacker needs many for binary search |
| `place-order` | per distributor | 24 hours | 50 | Absolute cap |
| `place-order` (qty) | per SKU per order | single request | 500 | Hard cap; bulk real orders = 50-200 |
| `place-order` (qty) | per SKU per distributor per day | 24 hours | 2000 | Daily ceiling |
| `place-order` (total value) | per distributor per day | 24 hours | tier-based | diamond=∞, platinum=500k, gold=200k, silver=100k, standard=50k |
| `cancel-request` | per distributor | 1 hour | 2 | Prevent probe+retry |
| `cancel-request` | per distributor | 24 hours | 10 | |
| `place-order` items count | per request | single | 50 | existing |

### 2.3 Detection Rules

Cron job `b2b_enumeration_scan_cron` (hourly):
- Flag distributors with **>5 cancels in 24h** → Telegram alert
- Flag distributors with **>3 orders qty=cap_max** in 24h → Telegram alert
- Flag distributors with **order→cancel within 30min** pattern 3+ times → suspend + admin review

### 2.4 Defense in Depth

```
┌─────────────────────────────────────────────┐
│ Layer 1: Hard caps (per-request)            │
│   → qty ≤ 500, items ≤ 50                   │
├─────────────────────────────────────────────┤
│ Layer 2: Rate limits (per-window)           │
│   → 10 orders/hr, 50/day, 2 cancels/hr      │
├─────────────────────────────────────────────┤
│ Layer 3: Daily ceilings (per-SKU/value)     │
│   → 2000 qty/SKU/day, tier-based value cap  │
├─────────────────────────────────────────────┤
│ Layer 4: Opaque response (no delta leak)    │
│   → constant-time, generic errors           │
├─────────────────────────────────────────────┤
│ Layer 5: Audit + detection                  │
│   → log every attempt + cron scan anomalies │
├─────────────────────────────────────────────┤
│ Layer 6: Admin review gate                  │
│   → all stock info locked behind admin role │
└─────────────────────────────────────────────┘
```

---

## 3. User Flows

### 3.1 Happy Path — Sufficient Stock

```
Agent LIFF → สั่ง SKU X qty=10 (stock จริง=20)
  │
  ▼
POST /place-order
  ├─ session verify ✓
  ├─ rate limit check ✓
  ├─ qty ≤ 500 ✓
  ├─ daily qty ≤ 2000 ✓
  ├─ daily value ≤ tier cap ✓
  ├─ create post_type=b2b_order status=pending_stock_review
  │     + meta _b2b_stock_snapshot (server-only, never in response)
  │     + meta _b2b_opaque_accept_at
  └─ return {success: true, order_id: 12345, eta_review: "2-4 ชม."}
  │
  ▼
LIFF shows: "✅ รับคำสั่งซื้อ #12345 — รอการยืนยันจากแอดมิน"
  │
  ▼
(Admin group receives new Flex with stock delta visible)
  │
  ▼
Admin clicks "✅ ยืนยัน (สต็อกพอ)" → FSM: pending_stock_review → awaiting_confirm
  ├─ dinoco_stock_subtract(X, 10) ✓
  ├─ add debt
  ├─ enqueue print
  └─ LINE → customer: "✅ ยืนยันออเดอร์ #12345 — 10 ชิ้น"
```

### 3.2 Split Path — Partial Stock

```
Agent สั่ง qty=10 (stock จริง=8)
  │
  ▼ POST /place-order (SAME CODE PATH as happy path — no stock check)
Return: {success: true, order_id: 12345, eta_review: "2-4 ชม."}
  ▼
Admin Flex shows:
  ┌─────────────────────────────┐
  │ ⚠️ ต้องการ split           │
  │ SKU X  สั่ง 10 · สต็อก 8    │  ← admin-only, never to customer
  │ ส่งได้: 8  │  BO: 2         │
  └─────────────────────────────┘
  [✅ ยืนยันเต็ม]  [⚙️ Split 8+2]  [❌ ปฏิเสธ]
  │
  ▼ Admin clicks "Split 8+2"
POST /bo-split { order_id: 12345, splits: [{sku: X, qty_fulfill: 8, qty_bo: 2, eta_days: 5}] }
  ├─ FSM: pending_stock_review → partial_fulfilled
  ├─ update order_items repeater:
  │     item_qty_confirmed=8, item_qty_backorder=2, item_bo_status=pending, item_bo_eta=+5 days
  ├─ dinoco_stock_subtract(X, 8) — only confirmed qty
  ├─ log transaction: type=b2b_reserved qty=8, type=b2b_bo_reserve qty=2
  ├─ add debt = 8 * price (NOT 10)
  ├─ enqueue print for qty=8 only
  └─ LINE → customer: combined Flex "ส่ง 8 + BO 2 (ETA 5 วัน)"
```

### 3.3 BO Resolve Path

```
Warehouse receives restock → dinoco_stock_add(X, 50)
  │
  ▼ hook: dinoco_stock_changed → b2b_bo_restock_scan(X)
  ├─ Query orders with item_bo_status=pending AND sku=X
  ├─ Sort by oldest first
  ├─ For each: if stock >= qty_bo → mark ready_to_fulfill
  ▼
Admin Dashboard "Backorders" tab shows ready-to-fulfill list
  │
  ▼ Admin clicks "ส่ง BO"
POST /bo-fulfill { order_id: 12345, items: [{sku: X, qty: 2}] }
  ├─ dinoco_stock_subtract(X, 2)
  ├─ update item_qty_confirmed += 2, item_qty_backorder = 0
  ├─ item_bo_status = fulfilled
  ├─ if all items fulfilled: FSM partial_fulfilled → awaiting_confirm (for billing flow)
  ├─ enqueue print for BO qty
  ├─ add debt = 2 * price
  └─ LINE → customer: "📦 BO พร้อมจัดส่งแล้ว — 2 ชิ้น"
```

### 3.4 Error Paths

| Scenario | Response | FSM | Leak? |
|---|---|---|---|
| qty > 500 per item | `400 {code: 'QTY_OVER_LIMIT', message: 'จำนวนเกินที่สั่งได้ต่อครั้ง'}` | no state change | No |
| items > 50 | `400 {code: 'ITEMS_OVER_LIMIT'}` | no change | No |
| rate limit (10/hr) | `429 {code: 'RATE_LIMIT', retry_after: 3600}` | no change | No |
| daily qty/SKU exceeded | `429 {code: 'DAILY_QTY_LIMIT', retry_after_hours: N}` | no change | No (generic) |
| tier value cap exceeded | `429 {code: 'DAILY_VALUE_LIMIT'}` | no change | Leaks tier cap (acceptable — not stock-related) |
| credit_hold | `403 {code: 'CREDIT_HOLD'}` | no change | No |
| duplicate order (30s dedup) | `429 {code: 'DUPLICATE'}` | no change | No |
| admin rejects all | `pending_stock_review → cancelled` | yes | No — msg: "ออเดอร์ถูกปฏิเสธ" |
| BO ETA expired (>14d) | cron auto-notify admin + customer "BO ล่าช้า" | partial_fulfilled remains | No |
| Parent order cancelled mid-BO | auto-cancel all BO items + stock restore | partial_fulfilled → cancelled | No |

### 3.5 Edge Cases

**E1 — Agent places order, admin away for 24h**:
- Cron `b2b_pending_review_expire_cron` (hourly) → if `pending_stock_review` > 24h → auto-notify admin group + flag stale
- After 72h → auto-cancel + customer notify

**E2 — Agent cancels during pending_stock_review**:
- Allowed IF rate limit ok + order status = pending_stock_review
- FSM: pending_stock_review → cancelled (customer role permitted)
- Audit log + count toward cancel rate limit

**E3 — Race: 2 agents order same SKU**:
- Both hit `pending_stock_review` → no stock reserved yet
- Admin reviews both → sees combined demand
- Admin decides split allocation (e.g., A gets 5, B gets 5 + BO 3)

**E4 — Admin changes mind mid-review**:
- Pre-split: just don't click Split button
- Post-split (within 10min): new endpoint `POST /bo-undo-split { order_id }` → restore original + release stock + restore BO children

**E5 — BO item that never comes back (discontinued SKU)**:
- Admin Dashboard: mark BO as "permanently unavailable" → customer Flex "ขออภัย BO ยกเลิก + credit cashback"
- Debt unaffected (was 0 for BO portion)

**E6 — Partial shipment Flash integration**:
- Flash order created with confirmed items only
- BO items excluded from Flash tracking until fulfilled
- On BO fulfill → create secondary Flash order or append

**E7 — Walk-in distributor**:
- `_b2b_is_walkin=1` → skip `pending_stock_review` state (bypass opaque accept)
- Direct: place-order → awaiting_confirm (allow_negative=true)
- Walk-in ไม่มี BO concept (ร้านหน้าโกดัง ขายของที่เห็น)

**E8 — Mixed order (some SKU sufficient, some insufficient)**:
- Admin UI shows per-SKU stock delta
- Split applies per-SKU (can confirm SKU A full + SKU B partial + SKU C BO-all)

**E9 — Multi-warehouse stock**:
- `dinoco_stock_get_available($sku)` returns total across warehouses
- Admin can choose specific warehouse to fulfill from (future phase)

**E10 — LINE push quota exceeded**:
- Combined Flex (1 msg for split) minimizes quota usage
- Fallback to text if Flex fails

---

## 4. Data Model

### 4.1 Order Items Repeater (Additive to existing)

**File**: `[B2B] Snippet 0` (or wherever ACF `order_items` repeater registered)

**Existing sub-fields** (assumed from code):
```
item_sku: text
item_product_name: text
item_qty: int
item_unit_price: decimal
item_discount: decimal
item_subtotal: decimal
```

**NEW sub-fields**:
```
item_qty_confirmed: int
  Description: จำนวนที่ยืนยันส่ง (หลัง admin split); default = item_qty
  Default: equal to item_qty
  Validation: 0 <= item_qty_confirmed <= item_qty

item_qty_backorder: int
  Description: จำนวนที่เป็น BO (รอสต็อก); default = 0
  Invariant: item_qty_confirmed + item_qty_backorder = item_qty

item_bo_status: select
  Options: [none, pending, ready_to_fulfill, fulfilled, cancelled]
  Default: none
  Description:
    - none: not a BO item
    - pending: waiting for stock
    - ready_to_fulfill: stock arrived, awaiting admin action
    - fulfilled: BO shipped
    - cancelled: BO voided (discontinued SKU)

item_bo_eta: date
  Description: admin's estimated restock date
  Nullable: true

item_bo_notes: textarea
  Description: admin note for BO reason/source
  Max: 500 chars
```

### 4.2 Post Meta (on b2b_order)

```
_b2b_status_prev: string
  Description: last status before current (for undo)

_b2b_opaque_accept_at: datetime
  Description: when place-order accepted (for latency metrics + cron expire)

_b2b_stock_snapshot: JSON
  Description: admin-only view — stock levels at time of review
  Format: { "SKU_X": { available: 8, requested: 10, split: {confirmed: 8, bo: 2} } }
  Security: NEVER returned in customer-facing API (filter in REST response)

_b2b_split_at: datetime
  Description: when admin clicked split

_b2b_split_by: int
  Description: admin user ID who performed split

_b2b_split_undo_deadline: datetime
  Description: split_at + 10min → after this, undo disabled

_b2b_bo_flex_sent: JSON
  Description: { message_id, sent_at, type: 'combined'|'bo_ready' } — dedupe tracking

_b2b_enumeration_flags: int
  Description: bitfield — 1=rate_hit, 2=cancel_abuse, 4=qty_cap_hit, 8=suspicious_pattern
```

### 4.3 FSM New States + Transitions

**File**: `[B2B] Snippet 14: Order State Machine` V.1.6

**New states**:
```
pending_stock_review
  Entry: place-order (non-walkin) → draft → pending_stock_review
  Exit: admin confirms (→awaiting_confirm), splits (→partial_fulfilled), rejects (→cancelled)
  Timeout: 72h → auto-cancelled (cron)

partial_fulfilled
  Entry: admin split
  Exit: all BO resolved (→awaiting_confirm for billing), or cancelled
  Can stay here indefinitely (BO waiting restock)
```

**Full transition matrix (updated)**:
```php
'draft' => [
    'pending_stock_review' => 'customer',  // NEW: non-walkin order
    'checking_stock'       => 'customer',  // legacy path (deprecated phase 4)
    'awaiting_confirm'     => 'system',    // walkin skip
],
'pending_stock_review' => [
    'awaiting_confirm'     => 'admin',     // admin confirm full
    'partial_fulfilled'    => 'admin',     // admin split
    'cancelled'            => 'admin',     // admin reject
    'cancelled'            => 'customer',  // customer cancel (rate-limited)
    'cancelled'            => 'system',    // cron auto-cancel (>72h)
],
'partial_fulfilled' => [
    'awaiting_confirm'     => 'admin',     // all BO resolved → billing flow
    'cancelled'            => 'admin',     // manual cancel (rare)
],
// existing transitions unchanged
'checking_stock' => [ ... same as before ... ],
'awaiting_confirm' => [ ... same ... ],
```

### 4.4 New Custom Table — `wp_dinoco_order_attempt_log`

**Purpose**: audit trail for every place-order/cancel action (for enumeration detection)

```sql
CREATE TABLE wp_dinoco_order_attempt_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  distributor_id BIGINT UNSIGNED NOT NULL,
  group_id VARCHAR(64) NOT NULL,
  action ENUM('place_order','cancel','split','undo_split','bo_fulfill') NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  items_hash VARCHAR(64) NULL,        -- md5 of items payload for dedup
  total_qty INT UNSIGNED NULL,        -- sum of qty across items
  total_value DECIMAL(12,2) NULL,     -- order value
  result ENUM('accepted','rejected','rate_limit','dup','error') NOT NULL,
  rejection_code VARCHAR(32) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_dist_time (distributor_id, created_at),
  INDEX idx_action (action, created_at),
  INDEX idx_order (order_id)
) ENGINE=InnoDB;
```

**Retention**: 90 days (cron cleanup)

### 4.5 New Custom Table — `wp_dinoco_bo_queue`

**Purpose**: decoupled BO tracking for efficient restock-scan cron (avoid scanning all b2b_order posts)

```sql
CREATE TABLE wp_dinoco_bo_queue (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  item_index INT UNSIGNED NOT NULL,   -- row index in order_items repeater
  sku VARCHAR(64) NOT NULL,
  qty_bo INT UNSIGNED NOT NULL,
  eta DATE NULL,
  status ENUM('pending','ready','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  UNIQUE KEY uniq_order_item (order_id, item_index),
  INDEX idx_sku_status (sku, status),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB;
```

### 4.6 wp_options (Config)

```
b2b_bo_max_qty_per_item: 500
b2b_bo_max_items_per_order: 50  (existing)
b2b_bo_rate_place_per_hour: 10
b2b_bo_rate_place_per_day: 50
b2b_bo_rate_cancel_per_hour: 2
b2b_bo_rate_cancel_per_day: 10
b2b_bo_daily_qty_per_sku: 2000
b2b_bo_tier_value_caps: {"standard": 50000, "silver": 100000, "gold": 200000, "platinum": 500000, "diamond": 0}  -- 0 = unlimited
b2b_bo_pending_review_timeout_hours: 72
b2b_bo_split_undo_window_minutes: 10
b2b_bo_eta_default_days: 7
b2b_bo_eta_warn_days: 14
b2b_flag_bo_system: false  -- feature flag
b2b_flag_bo_beta_distributors: []  -- beta tester IDs
```

### 4.7 Transactions (dinoco_stock_transactions)

**New transaction_type values** (existing table):
```
'b2b_bo_reserve'    -- when admin splits: placeholder (qty only tracked in bo_queue, stock NOT subtracted)
'b2b_bo_fulfilled'  -- when BO ship: actual stock subtract
'b2b_bo_cancel'     -- when BO cancelled (discontinued): no stock change, audit only
```

Existing types unchanged: `b2b_reserved`, `b2b_shipped`, `b2b_cancelled`.

---

## 5. API Design

### 5.1 Modified — `POST /b2b/v1/place-order`

**File**: `[B2B] Snippet 3` line 628+ `b2b_rest_place_order()`

**Request (unchanged)**:
```json
{
  "items": [{"sku": "X", "qty": 10}, ...],
  "note": "ส่งด่วน"
}
```

**Response (success)**:
```json
{
  "success": true,
  "order_id": 12345,
  "status": "pending_stock_review",
  "message": "รับคำสั่งซื้อแล้ว — รอการยืนยันจากแอดมินภายใน 2-4 ชม.",
  "eta_review_hours": 4
}
```

**Response (errors — generic, no delta)**:
```json
{ "success": false, "code": "QTY_OVER_LIMIT", "message": "จำนวนเกินที่สั่งได้ต่อครั้ง" }
{ "success": false, "code": "RATE_LIMIT", "message": "สั่งซื้อบ่อยเกินไป กรุณารอสักครู่", "retry_after": 3600 }
{ "success": false, "code": "DAILY_QTY_LIMIT", "message": "เกินโควต้ารายวัน กรุณาติดต่อทีมงาน" }
{ "success": false, "code": "DAILY_VALUE_LIMIT", "message": "เกินวงเงินรายวัน" }
{ "success": false, "code": "CREDIT_HOLD", "message": "ร้านถูกระงับชั่วคราว" }
{ "success": false, "code": "DUPLICATE", "message": "คำสั่งซื้อนี้ถูกส่งแล้ว" }
```

**Permission**: session token (unchanged)

**Implementation changes** (pseudocode):
```php
function b2b_rest_place_order($req) {
    $session = b2b_verify_session_token($req);
    if (!$session) return b2b_unauthorized_response();

    $group_id = $session['gid'];
    $dist = b2b_get_dist_by_group($group_id);
    if (!$dist) return error_response('NOT_FOUND', 404);

    // NEW: Rate limits (before any expensive work)
    if (!b2b_rate_limit('place_'.$dist->ID, 10, 3600)) {
        b2b_log_attempt($dist->ID, 'place_order', null, null, 'rate_limit', 'RATE_LIMIT');
        return error_response('RATE_LIMIT', 429, ['retry_after' => 3600]);
    }
    if (!b2b_rate_limit('place_day_'.$dist->ID, 50, 86400)) {
        b2b_log_attempt(...);
        return error_response('RATE_LIMIT', 429);
    }

    // existing credit_hold check
    if (get_field('credit_hold', $dist->ID)) return error_response('CREDIT_HOLD', 403);

    $items = $req->get_param('items');
    if (count($items) > 50) return error_response('ITEMS_OVER_LIMIT', 400);

    // NEW: Per-item qty cap
    $max_qty = intval(get_option('b2b_bo_max_qty_per_item', 500));
    foreach ($items as $it) {
        if (intval($it['qty']) > $max_qty) {
            b2b_log_attempt($dist->ID, 'place_order', null, null, 'rejected', 'QTY_OVER_LIMIT');
            return error_response('QTY_OVER_LIMIT', 400);
        }
        if (intval($it['qty']) < 1) return error_response('QTY_INVALID', 400);
    }

    // NEW: Daily qty per SKU cap
    foreach ($items as $it) {
        $sku = strtoupper($it['sku']);
        $key = 'b2b_daily_qty_'.$dist->ID.'_'.$sku;
        $used = intval(get_transient($key) ?: 0);
        $limit = intval(get_option('b2b_bo_daily_qty_per_sku', 2000));
        if ($used + $it['qty'] > $limit) {
            b2b_log_attempt(...);
            return error_response('DAILY_QTY_LIMIT', 429);
        }
    }

    // Existing: duplicate guard, price lookup
    // ... existing code ...

    // NEW: Daily value cap (after price computed)
    $tier_caps = get_option('b2b_bo_tier_value_caps', [...]);
    $rank = get_field('rank_system', $dist->ID) ?: 'standard';
    $cap = $tier_caps[$rank] ?? 50000;
    if ($cap > 0) {
        $daily_value_key = 'b2b_daily_value_'.$dist->ID;
        $daily_used = floatval(get_transient($daily_value_key) ?: 0);
        if ($daily_used + $order_total > $cap) {
            b2b_log_attempt(...);
            return error_response('DAILY_VALUE_LIMIT', 429);
        }
    }

    // NEW: Create order in pending_stock_review (non-walkin) OR awaiting_confirm (walkin)
    $is_walkin = get_field('is_walkin', $dist->ID);
    $initial_status = $is_walkin ? 'draft' : 'draft';
    // ... create post ...
    $order_id = wp_insert_post([...]);

    if ($is_walkin) {
        // Legacy walkin path (unchanged)
        b2b_transition_order($order_id, 'awaiting_confirm', 'system');
    } else {
        // NEW: opaque accept path
        b2b_transition_order($order_id, 'pending_stock_review', 'customer');
        update_post_meta($order_id, '_b2b_opaque_accept_at', current_time('mysql'));

        // Increment daily counters
        foreach ($items as $it) {
            $sku = strtoupper($it['sku']);
            set_transient('b2b_daily_qty_'.$dist->ID.'_'.$sku, $used + $it['qty'], 86400);
        }
        set_transient($daily_value_key, $daily_used + $order_total, 86400);

        // Push Flex to admin group (new variant with stock delta)
        b2b_notify_admin_stock_review($order_id);
    }

    b2b_log_attempt($dist->ID, 'place_order', $order_id, md5(json_encode($items)), 'accepted', null);

    return [
        'success' => true,
        'order_id' => $order_id,
        'status' => $is_walkin ? 'awaiting_confirm' : 'pending_stock_review',
        'message' => $is_walkin ? 'ยืนยันออเดอร์แล้ว' : 'รับคำสั่งซื้อแล้ว — รอการยืนยันจากแอดมินภายใน 2-4 ชม.',
        'eta_review_hours' => $is_walkin ? 0 : 4,
    ];
}
```

### 5.2 New — `POST /b2b/v1/bo-split`

**Permission**: `manage_options` OR admin LINE user (session admin)

**Request**:
```json
{
  "order_id": 12345,
  "splits": [
    { "sku": "X", "qty_fulfill": 8, "qty_bo": 2, "eta_days": 5, "notes": "รอล็อตใหม่" },
    { "sku": "Y", "qty_fulfill": 5, "qty_bo": 0 }  // no BO for this SKU
  ]
}
```

**Response**:
```json
{
  "success": true,
  "order_id": 12345,
  "status": "partial_fulfilled",
  "fulfilled_total": 13,
  "bo_total": 2,
  "bo_queue_ids": [901],
  "undo_deadline": "2026-04-16 15:20:00"
}
```

**Validation**:
- per split: `qty_fulfill + qty_bo === original_item_qty` (invariant)
- `qty_fulfill >= 0`, `qty_bo >= 0`
- order status must be `pending_stock_review`
- admin must have `manage_options` OR be admin LINE user

**Side effects**:
1. Update `order_items` repeater: set `item_qty_confirmed`, `item_qty_backorder`, `item_bo_status='pending'`, `item_bo_eta`
2. `dinoco_stock_subtract(sku, qty_fulfill)` — only confirmed qty
3. Insert into `wp_dinoco_bo_queue` for each BO line
4. Log transaction: `b2b_reserved` (qty_fulfill) + `b2b_bo_reserve` (qty_bo)
5. Update debt = `sum(qty_fulfill * price)` via `b2b_debt_add()`
6. FSM transition: `pending_stock_review → partial_fulfilled`
7. Enqueue print job for confirmed qty
8. Set `_b2b_split_at`, `_b2b_split_by`, `_b2b_split_undo_deadline`
9. Send combined Flex to customer group
10. Log `b2b_log_attempt('split', ...)`

### 5.3 New — `POST /b2b/v1/bo-confirm-full`

**Purpose**: Admin confirms all qty available (no split needed)

**Request**: `{ order_id: 12345 }`

**Side effects**:
- FSM: `pending_stock_review → awaiting_confirm` (triggers existing stock subtract hook)
- Equivalent to current "admin confirms stock" flow

### 5.4 New — `POST /b2b/v1/bo-reject`

**Purpose**: Admin rejects order entirely

**Request**: `{ order_id: 12345, reason: "string" }`

**Side effects**:
- FSM: `pending_stock_review → cancelled`
- LINE to customer: "ออเดอร์ถูกปฏิเสธ" + reason
- Release daily qty/value counters (revert transient increments)

### 5.5 New — `POST /b2b/v1/bo-undo-split`

**Purpose**: Within 10min of split, admin can undo

**Request**: `{ order_id: 12345 }`

**Validation**:
- `now() < _b2b_split_undo_deadline`
- status = `partial_fulfilled`
- no BO item has been fulfilled yet

**Side effects**:
- `dinoco_stock_add(sku, qty_fulfill)` — restore stock
- Delete bo_queue entries for this order
- Reset item_qty_confirmed = item_qty, item_qty_backorder = 0
- FSM: `partial_fulfilled → pending_stock_review`
- Reverse debt: `b2b_debt_subtract()`
- Cancel print job if not yet printed

### 5.6 New — `POST /b2b/v1/bo-fulfill`

**Purpose**: Admin ships BO items that have restocked

**Request**:
```json
{
  "order_id": 12345,
  "items": [{ "sku": "X", "qty": 2, "bo_queue_id": 901 }]
}
```

**Side effects**:
- `dinoco_stock_subtract(sku, qty)` — actual subtract now
- Update bo_queue.status = `fulfilled`
- Update `item_qty_confirmed += qty`, `item_qty_backorder -= qty`, `item_bo_status='fulfilled'` if zero remaining
- Log transaction `b2b_bo_fulfilled`
- `b2b_debt_add(qty * price)` — add to parent order debt
- Enqueue secondary print job (or append to existing)
- If all BO resolved → FSM: `partial_fulfilled → awaiting_confirm` (for billing)
- LINE customer: "📦 BO พร้อมจัดส่งแล้ว — N ชิ้น"

### 5.7 New — `POST /b2b/v1/bo-cancel-item`

**Purpose**: Cancel BO line (discontinued SKU)

**Request**: `{ order_id: 12345, bo_queue_id: 901, reason: "discontinued" }`

**Side effects**:
- bo_queue.status = `cancelled`
- item_bo_status = `cancelled`, item_qty_backorder stays (historical record)
- If remaining items all cancelled/fulfilled → FSM: `partial_fulfilled → awaiting_confirm`
- LINE customer: "ขออภัย รายการ BO X ถูกยกเลิก"
- Credit cashback handled separately (manual admin op)

### 5.8 New — `GET /b2b/v1/bo-queue`

**Permission**: `manage_options`

**Query params**:
- `status`: pending | ready | all
- `sku`: filter by SKU
- `age_gt_hours`: filter by age
- `order_id`: lookup by parent order

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 901,
      "order_id": 12345,
      "ticket_no": "B-2025-001",
      "distributor_name": "ร้าน A",
      "sku": "X",
      "qty_bo": 2,
      "eta": "2026-04-21",
      "status": "pending",
      "age_hours": 18,
      "stock_available": 0,
      "age_bucket": "fresh"  // fresh | amber (>72h) | red (>7d)
    }
  ],
  "summary": {
    "total_pending": 12,
    "total_ready": 3,
    "oldest_age_hours": 120,
    "needs_attention": 2
  }
}
```

### 5.9 New — `POST /b2b/v1/bo-restock-scan`

**Purpose**: Manually trigger restock scan (also called by cron)

**Permission**: `manage_options`

**Request**: `{ sku?: "X" }` (optional, null = scan all)

**Side effects**:
- Query bo_queue where status=pending AND sku matches
- Sort oldest first
- For each: if `dinoco_get_stock_available(sku) >= qty_bo` → update status=ready + notify admin

### 5.10 Modified — `POST /b2b/v1/cancel-request`

**File**: `[B2B] Snippet 3` (existing endpoint at line 70)

**Changes**:
- Tighten rate limit: `b2b_rate_limit('cancel_'.$gid, 2, 3600)` (was 5/60s)
- Add daily cancel cap: `b2b_rate_limit('cancel_day_'.$gid, 10, 86400)`
- Only allow cancel if status in [`draft`, `pending_stock_review`, `checking_stock`]
- Log every attempt to `order_attempt_log` regardless of outcome
- Generic error (no stock info) if rejected

### 5.11 Cron Jobs

**New crons** (added to `[B2B] Snippet 7: Cron Jobs`):

```
b2b_bo_restock_scan_cron (every 15 min)
  → Scan bo_queue pending items against current stock
  → Mark ready + notify admin Telegram

b2b_bo_eta_warn_cron (daily 09:00)
  → Query bo_queue where eta < now + 3 days
  → Notify admin for imminent restock needed

b2b_pending_review_expire_cron (hourly)
  → Query posts where status=pending_stock_review AND _b2b_opaque_accept_at < now - 72h
  → Auto-cancel + notify

b2b_enumeration_scan_cron (hourly)
  → Query order_attempt_log for suspicious patterns
  → Set _b2b_enumeration_flags on distributor + Telegram alert

b2b_daily_counter_reset (daily 00:00)
  → Clear transient keys (they expire naturally but cleanup stale)

b2b_order_attempt_log_cleanup (daily 03:00)
  → DELETE FROM wp_dinoco_order_attempt_log WHERE created_at < NOW() - INTERVAL 90 DAY
```

---

## 6. UI Wireframes

### 6.1 Agent LIFF — Place Order Modal

**Before submit**:
```
┌─────────────────────────────────────┐
│ ← ตะกร้าสินค้า                     │
├─────────────────────────────────────┤
│ SKU X  — ชุดกันล้ม ADV160           │
│   ฿1,700 × [  10  ]  = 17,000     │  ← no stock indicator
│                                     │
│ SKU Y  — Top Rack CB500X           │
│   ฿1,620 × [   5  ]  =  8,100     │
├─────────────────────────────────────┤
│ ยอดรวม               ฿25,100       │
│                                     │
│ หมายเหตุ:                           │
│ ┌─────────────────────────────────┐│
│ │ (ว่าง)                          ││
│ └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  [ ส่งคำสั่งซื้อ ]                   │
│  ℹ️ แอดมินจะตรวจสอบและยืนยันภายใน   │
│     2-4 ชั่วโมง                     │
└─────────────────────────────────────┘
```

**After submit — success**:
```
┌─────────────────────────────────────┐
│             ✅                       │
│                                     │
│     รับคำสั่งซื้อเรียบร้อย          │
│     ออเดอร์ #12345                  │
│                                     │
│  สถานะ: ⏳ รอตรวจสอบจากแอดมิน      │
│  คาดการณ์: 2-4 ชั่วโมง              │
│                                     │
│  [ดูออเดอร์ของฉัน]  [กลับหน้าแรก]  │
└─────────────────────────────────────┘
```

**After submit — rate limit**:
```
┌─────────────────────────────────────┐
│             ⚠️                       │
│                                     │
│   สั่งซื้อบ่อยเกินไป                 │
│   กรุณารอประมาณ 1 ชั่วโมง            │
│                                     │
│   หากต้องการสั่งด่วน กรุณาติดต่อ     │
│   ทีมงาน                             │
│                                     │
│         [เข้าใจแล้ว]                 │
└─────────────────────────────────────┘
```

**Orders list tab** (new column):
```
┌─────────────────────────────────────────────────┐
│ ออเดอร์ของฉัน                                    │
├─────────────────────────────────────────────────┤
│ #12345  25/04  ⏳ รอตรวจสอบ        ฿25,100     │
│ #12344  24/04  ✅ จัดส่งแล้ว          ฿8,200    │
│ #12343  23/04  📦 บางส่วน + BO      ฿15,400    │
│                    ├─ ส่งแล้ว 8      │           │
│                    └─ รอสต็อก 2 (ETA 29/04) │
└─────────────────────────────────────────────────┘
```

### 6.2 Admin LINE Flex — Stock Review Alert

```
┌──────────────────────────────────────┐
│  🔔 ตรวจสอบสต็อก #12345              │ ← header navy
│  ร้าน: ABC Motorsport                │
├──────────────────────────────────────┤
│  📦 รายการสินค้า                      │
│                                      │
│  SKU X                               │
│   สั่ง 10 · สต็อก 8 · ⚠️ ต้อง split  │ ← red text (admin only)
│                                      │
│  SKU Y                               │
│   สั่ง 5 · สต็อก 20 · ✓ พอ           │ ← green
│                                      │
│  ─────────────────────                │
│  ยอดรวม: ฿25,100                     │
│  สต็อกไม่พอ: 1 รายการ                 │
├──────────────────────────────────────┤
│  [ ✅ ยืนยันเต็ม ]                    │ ← disabled (insufficient)
│  [ ⚙️ Split BO ]                      │ ← primary action
│  [ ❌ ปฏิเสธ ]                        │
└──────────────────────────────────────┘
```

**If all SKUs sufficient**:
```
SKU X  สั่ง 10 · สต็อก 50 · ✓ พอ
SKU Y  สั่ง 5  · สต็อก 20 · ✓ พอ

[ ✅ ยืนยันเต็ม ]  ← primary
[ ❌ ปฏิเสธ ]
```

### 6.3 Admin Dashboard — Split Review UI

Opens when admin clicks "⚙️ Split BO" from Flex.

```
┌────────────────────────────────────────────────────────┐
│  ⚙️ Split Backorder — ออเดอร์ #12345                    │
│  ร้าน: ABC Motorsport · ยอดรวมเดิม ฿25,100              │
├────────────────────────────────────────────────────────┤
│                                                        │
│  SKU X  — ชุดกันล้ม ADV160                             │
│  สต็อกปัจจุบัน: 8 · สั่ง: 10                            │
│                                                        │
│  ส่งทันที:  [  8  ]    BO (รอ):  [  2  ]               │
│                         ETA: [__/__/____]              │
│                         หมายเหตุ: [__________________] │
│  ─────────────                                         │
│  SKU Y  — Top Rack CB500X                              │
│  สต็อกปัจจุบัน: 20 · สั่ง: 5                            │
│                                                        │
│  ส่งทันที:  [  5  ]    BO (รอ):  [  0  ]               │
│  ─────────────                                         │
│                                                        │
│  สรุป:                                                 │
│    ส่งทันที: 13 ชิ้น · ฿23,300                          │
│    BO:       2 ชิ้น · ฿3,400 (ยังไม่เก็บเงิน)           │
│                                                        │
│  ⚠️ Split ย้อนกลับได้ภายใน 10 นาทีหลังยืนยัน             │
│                                                        │
│  [ ยกเลิก ]              [ ยืนยัน Split ]              │
└────────────────────────────────────────────────────────┘
```

**Per-item controls**:
- `qty_fulfill` input: max = min(requested, available), validation onChange
- `qty_bo` input: auto-calc = requested - qty_fulfill (or manual override)
- ETA date picker: default = today + 7 days
- Auto-suggest: "ใช้สต็อกที่มีทั้งหมด" button → fills qty_fulfill = min(available, requested)

### 6.4 Admin Dashboard — Backorders Tab

```
┌──────────────────────────────────────────────────────────────────┐
│ 📋 Backorders                     [Restock Scan] [Export CSV]    │
├──────────────────────────────────────────────────────────────────┤
│ สรุป: 12 pending · 3 ready · 2 ต้องดำเนินการ                      │
│ ฟิลเตอร์: [สถานะ▾] [SKU▾] [อายุ▾]         [🔍 ค้นหา         ]   │
├──────────────────────────────────────────────────────────────────┤
│ Age │ Ticket  │ Dist          │ SKU  │ BO Qty │ ETA    │ Status  │
├─────┼─────────┼───────────────┼──────┼────────┼────────┼─────────┤
│ 3d  │ #B-001  │ ABC Motors    │ X    │  2     │ 21/04  │ ⏳ pend │
│ 1d  │ #B-005  │ XYZ Racing    │ Y    │  5     │ 19/04  │ 🟢 ready│ [ส่ง BO]
│ 7d  │ #B-002  │ ABC Motors    │ X    │  1     │ 17/04  │ 🟠 late │
│ 14d │ #B-003  │ DEF Parts     │ Z    │  3     │ (none) │ 🔴 old  │
└─────┴─────────┴───────────────┴──────┴────────┴────────┴─────────┘

[Pagination: ‹ 1 2 3 ›]
```

**Age buckets**:
- fresh (0-3d): gray
- warn (3-7d): amber 🟠
- old (>7d): red 🔴
- ready: green 🟢

**Row actions** (expandable):
- [ส่ง BO] — POST /bo-fulfill
- [ยกเลิก BO] — POST /bo-cancel-item (with confirmation)
- [ดูออเดอร์เต็ม] — link to parent ticket

### 6.5 Customer LINE Flex — Combined Split Notification

Sent immediately after admin confirms split.

```
┌──────────────────────────────────────┐
│  📦 ออเดอร์ #12345                     │ ← navy header
│  ยืนยันแล้ว — จัดส่งบางส่วน            │
├──────────────────────────────────────┤
│                                      │
│  ✅ จัดส่งทันที (13 ชิ้น)              │
│                                      │
│    • ชุดกันล้ม ADV160  × 8            │
│      @ ฿1,700   รวม ฿13,600          │
│                                      │
│    • Top Rack CB500X  × 5            │
│      @ ฿1,620   รวม ฿8,100           │
│                                      │
│    ยอดจัดส่ง: ฿21,700                 │
│                                      │
│  ──────────────                       │
│                                      │
│  ⏳ รอสต็อก (2 ชิ้น)                   │
│                                      │
│    • ชุดกันล้ม ADV160  × 2            │
│      ETA: 21 เม.ย. (5 วัน)           │
│                                      │
│    (เรียกเก็บเมื่อของพร้อมจัดส่ง)      │
│                                      │
├──────────────────────────────────────┤
│  ยอดชำระครั้งแรก:  ฿21,700           │
│  BO รอชำระภายหลัง:  ฿3,400           │
├──────────────────────────────────────┤
│  [ยืนยันบิล]  [ดูสถานะ BO]            │
└──────────────────────────────────────┘
```

**Key rules** (never violate):
- ไม่ระบุ "สต็อกเหลือ X" หรือ "ไม่พอ Y ชิ้น"
- ใช้คำว่า "รอสต็อก" แทน "หมด"
- BO ไม่เรียกเก็บจนกว่า ship

### 6.6 Customer LINE Flex — BO Ready Notification

```
┌──────────────────────────────────────┐
│  📦 BO พร้อมจัดส่งแล้ว                │
│  ออเดอร์ #12345                        │
├──────────────────────────────────────┤
│  • ชุดกันล้ม ADV160 × 2 ชิ้น           │
│    ฿3,400                             │
├──────────────────────────────────────┤
│  ยอดชำระเพิ่ม: ฿3,400                 │
│  รวมทั้งบิล:    ฿25,100               │
├──────────────────────────────────────┤
│  [ยืนยันบิล BO]  [ดูออเดอร์]          │
└──────────────────────────────────────┘
```

### 6.7 LIFF Orders Detail — Split View

```
┌─────────────────────────────────┐
│ ← ออเดอร์ #12345                 │
├─────────────────────────────────┤
│ 📦 บางส่วน + BO                  │
│ สถานะ: partial_fulfilled         │
├─────────────────────────────────┤
│                                 │
│ ✅ จัดส่งแล้ว (13)               │
│                                 │
│ ┌─ SKU X × 8         ─┐         │
│ │ ฿1,700 · ฿13,600    │         │
│ └─────────────────────┘         │
│                                 │
│ ┌─ SKU Y × 5         ─┐         │
│ │ ฿1,620 · ฿8,100     │         │
│ └─────────────────────┘         │
│                                 │
│ ⏳ รอสต็อก (2)                   │
│                                 │
│ ┌─ SKU X × 2 (BO)    ─┐         │
│ │ ETA: 21 เม.ย.        │         │
│ │ (รอสต็อก 5 วัน)      │         │
│ └─────────────────────┘         │
│                                 │
│ ─────────────────                │
│ ชำระแล้ว: ฿21,700               │
│ รอชำระ (BO): ฿3,400              │
└─────────────────────────────────┘
```

---

## 7. FSM State Diagram

```
                        ┌──────────┐
                        │  draft   │
                        └────┬─────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       (walkin)        (non-walkin)      (deprecated)
              │              │              │
              ▼              ▼              ▼
      ┌────────────┐   ┌──────────────┐   ┌─────────────┐
      │ awaiting_  │   │  pending_    │   │  checking_  │
      │  confirm   │   │stock_review  │   │   stock     │
      └─────┬──────┘   └──────┬───────┘   └──────┬──────┘
            │                 │                   │
            │     ┌───────────┼────────────┐     │
            │     │           │            │     │
            │   full       split         reject  │
            │     │           │            │     │
            │     ▼           ▼            │     │
            │  (confirm)  ┌────────────┐   │     │
            │  merge───▶  │  partial_  │   │     │
            │             │ fulfilled  │   │     │
            │             └────┬───────┘   │     │
            │                  │           │     │
            │            all BO resolved   │     │
            │                  │           │     │
            │                  ▼           │     │
            │         ┌────────────────┐   │     │
            └────────▶│ awaiting_      │◄──┘     │
                      │  confirm       │         │
                      └────────┬───────┘         │
                               │                 │
                               ▼                 │
                         (existing flow)         │
                               │                 │
                     ┌─────────┴────────┐        │
                     │                  │        │
                     ▼                  ▼        │
                delivering           cancelled◄──┘
                     │                  ▲
                     ▼                  │
                 delivered              │
                     │                  │
                     ▼                  │
                   paid                 │
                     │                  │
                     ▼                  │
                completed ──────────────┘
                                (walk-in only)
```

**New transitions summary**:
| From | To | Actor | Trigger |
|---|---|---|---|
| draft | pending_stock_review | customer | place-order (non-walkin) |
| pending_stock_review | awaiting_confirm | admin | bo-confirm-full |
| pending_stock_review | partial_fulfilled | admin | bo-split |
| pending_stock_review | cancelled | admin | bo-reject |
| pending_stock_review | cancelled | customer | cancel-request (rate-limited) |
| pending_stock_review | cancelled | system | cron (>72h) |
| partial_fulfilled | pending_stock_review | admin | bo-undo-split (<10min) |
| partial_fulfilled | awaiting_confirm | admin/system | bo-fulfill (all BO resolved) |
| partial_fulfilled | cancelled | admin | manual escalation |

---

## 8. Security Analysis

### 8.1 Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation | Owner |
|---|---|---|---|---|---|
| Stock enumeration via qty probe | High | Critical | P0 | Hard cap 500 + opaque accept + admin gate | fullstack-dev |
| Cancel-retry probe | Medium | High | P1 | 2/hr cancel + generic errors | fullstack-dev |
| Multi-order parallel probe | Medium | High | P1 | Daily qty cap + detection cron | fullstack-dev |
| Timing side-channel | Low | Medium | P2 | Constant code path in place-order | fullstack-dev |
| Race condition oversell | Medium | High | P1 | Existing FOR UPDATE lock + split atomicity | database-expert |
| Split undo abuse (infinite loops) | Low | Medium | P2 | 10min window + undo count limit (1) | fullstack-dev |
| Walk-in + normal cross-ref | Low | Medium | P3 | Isolate walk-in stock views from dealers | security-pentester |
| BO SQL injection (custom table) | Low | High | P1 | Prepared statements via $wpdb->prepare | database-expert |
| CSRF on bo-split | Low | High | P1 | Admin nonce verification | fullstack-dev |
| Debt drift during split | Medium | Critical | P0 | Atomic via b2b_debt_add/subtract (Snippet 13) | database-expert |
| Flex message leak (stock info in customer Flex) | Medium | Critical | P0 | Review all templates + lint check | security-pentester |
| Admin-only meta leaked in REST | Medium | High | P1 | Filter `_b2b_stock_snapshot` from customer responses | fullstack-dev |
| Post-meta exposed via WP REST | Medium | High | P1 | Register meta with `show_in_rest: false` | database-expert |
| Enumeration detection false positive | Medium | Low | P3 | Tunable thresholds + manual review before suspend | product |
| Cron job race (duplicate BO fulfill) | Low | High | P1 | Unique idempotency key per bo_queue.id | database-expert |

### 8.2 Info Leak Audit Checklist

Each code path must pass:

- [ ] `/place-order` response contains NO stock numbers
- [ ] `/place-order` response contains NO per-item error
- [ ] `/place-order` rejection code is one of enum set (no free-form msg)
- [ ] `/place-order` timing is constant (no early return if SKU has low stock)
- [ ] `/cancel-request` response contains NO stock numbers
- [ ] `/order-detail` (customer) filters out `_b2b_stock_snapshot`
- [ ] `/order-detail` (customer) filters out `_b2b_enumeration_flags`
- [ ] Customer-facing Flex templates reviewed — no "เหลือ N", "ไม่พอ N", "หมด"
- [ ] Customer Flex uses "รอสต็อก" / "จัดส่งภายหลัง" only
- [ ] Admin Flex templates allowed to show delta (they're admin-only)
- [ ] WP REST API for `b2b_order` CPT has `show_in_rest: false` for sensitive meta
- [ ] LIFF orders tab doesn't display stock counts
- [ ] Error codes are documented in one place + grep'd for custom throws

### 8.3 Audit Logging

Every action logged to `wp_dinoco_order_attempt_log`:
- IP (from `$_SERVER['REMOTE_ADDR']` with proxy detection)
- User Agent
- Distributor ID + group_id
- Action type
- Result (accepted / rejected / rate_limit / dup / error)
- Rejection code (enum)
- Items hash (for dedup tracking)
- Total qty + value

Admin UI: "Security Log" tab — filter by distributor, action, result. CSV export.

### 8.4 Penetration Test Scenarios

Required tests by security-pentester before Phase 2 launch:

1. **Binary search**: automated script places 20 orders with varying qty → verify all get same generic response + no timing difference >10ms
2. **Cancel+retry loop**: 100 cancels in 1h → verify rate limit trips at 2 + lockout
3. **Parallel probe**: 10 orders in 5min → verify daily qty cap trips correctly
4. **Timing analysis**: measure response time at qty=1, 100, 500 → verify σ <10ms
5. **Flex message scrape**: parse all customer Flex messages → verify no stock numbers
6. **SQL injection**: bo-split payload with malicious strings → verify $wpdb->prepare catches all
7. **CSRF**: try bo-split without admin nonce → 403
8. **Cross-distributor**: distributor A tries to fetch distributor B's order → 403
9. **Admin meta leak**: customer queries order-detail for their own partial order → verify no stock snapshot returned
10. **Walk-in inference**: walk-in order + regular order on same SKU → verify no cross-correlation leak

---

## 9. Dependencies & Impact Analysis

### 9.1 Files Affected

```
MUST EDIT:
├── [B2B] Snippet 0 (or ACF registration snippet)
│     → Add order_items sub-fields (item_qty_confirmed, item_qty_backorder,
│       item_bo_status, item_bo_eta, item_bo_notes)
│     → Version bump
│
├── [B2B] Snippet 1: Core Utilities & LINE Flex Builders (V.XX+1)
│     → New flex: b2b_build_flex_stock_review_admin($order_id)
│     → New flex: b2b_build_flex_partial_fulfill_customer($order_id)
│     → New flex: b2b_build_flex_bo_ready_customer($order_id, $bo_items)
│     → New flex: b2b_build_flex_bo_cancelled_customer($order_id, $item)
│     → New helper: b2b_log_attempt($dist_id, $action, $order_id, $hash, $result, $code)
│     → New helper: b2b_compute_bo_summary($order_id) — for UI
│
├── [B2B] Snippet 2: LINE Webhook Gateway & Order Creator (V.XX+1)
│     → New postback handler: b2b_action_bo_split_init (admin "Split BO" button)
│     → New postback handler: b2b_action_bo_confirm_full
│     → New postback handler: b2b_action_bo_reject
│     → Modify b2b_notify_admin_stock_review — use new Flex with delta
│     → Keep existing stock subtract hook (priority 5) for awaiting_confirm
│
├── [B2B] Snippet 3: LIFF E-Catalog REST API (V.XX+1)
│     → Modify b2b_rest_place_order — add rate limits + caps + attempt log
│     → New endpoint POST /bo-split → b2b_rest_bo_split
│     → New endpoint POST /bo-confirm-full → b2b_rest_bo_confirm_full
│     → New endpoint POST /bo-reject → b2b_rest_bo_reject
│     → New endpoint POST /bo-undo-split → b2b_rest_bo_undo_split
│     → New endpoint POST /bo-fulfill → b2b_rest_bo_fulfill
│     → New endpoint POST /bo-cancel-item → b2b_rest_bo_cancel_item
│     → New endpoint GET /bo-queue → b2b_rest_bo_queue
│     → New endpoint POST /bo-restock-scan → b2b_rest_bo_restock_scan
│     → Modify /cancel-request — tighter rate limit + state gating
│     → Modify /order-detail — filter admin-only meta from customer responses
│
├── [B2B] Snippet 5: Admin Dashboard (V.XX+1)
│     → New tab "Backorders" — full UI from §6.4
│     → New tab "Security Log" — attempt log viewer (phase 2)
│     → New tab (or modal) "Split Review" UI from §6.3
│
├── [B2B] Snippet 7: Cron Jobs (V.XX+1)
│     → Register 6 new cron jobs from §5.11
│     → Handlers for: restock_scan, eta_warn, pending_review_expire,
│       enumeration_scan, counter_reset, attempt_log_cleanup
│
├── [B2B] Snippet 13: Debt Transaction Manager
│     → Review: ensure b2b_debt_add/subtract handles split correctly
│     → No code change expected (atomic already) but verify
│
├── [B2B] Snippet 14: Order State Machine (V.1.6)
│     → Add states: pending_stock_review, partial_fulfilled
│     → Add transitions per §7
│     → Mark checking_stock → awaiting_confirm as legacy (still works for phase 1-3)
│
└── [B2B] Snippet 15: Custom Tables & JWT Session (V.XX+1)
      → Add table wp_dinoco_order_attempt_log (§4.4)
      → Add table wp_dinoco_bo_queue (§4.5)
      → Migration via `dbDelta()` on version bump

MAY EDIT (for consistency):
├── [B2B] Snippet 4: LIFF E-Catalog Frontend
│     → Remove any stock indicator from UI (if exists)
│     → Add "pending_stock_review" status badge
│     → Add BO split view in orders detail
│
├── [B2B] Snippet 8: Distributor Ticket View
│     → Show BO items separately in ticket view
│
├── [B2B] Snippet 10: Invoice Image Generator
│     → Invoice = confirmed qty only (not BO)
│     → Secondary invoice when BO fulfills
│
├── [B2B] Snippet 11: Customer LIFF Pages
│     → "My Orders" tab: show split status badge
│
└── [B2B] Snippet 12: Admin Dashboard LIFF
      → Embed Backorders tab (mobile admin view)

NO CHANGE:
- [B2B] Snippet 6: Admin Discount Mapping
- [B2B] Snippet 9: Admin Control Panel (unless Security Log tab added here)
- [B2B] Snippet 10: Invoice Image Generator (minor — BO separate invoice)
- Inventory snippets (dinoco_stock_subtract works as-is)
```

### 9.2 Integration Points

**Debt System** (Snippet 13):
- Parent split: `b2b_debt_add(dist_id, qty_fulfilled * price)` — only confirmed
- BO fulfill: `b2b_debt_add(dist_id, qty_bo * price)` at fulfill time
- Cancel: `b2b_debt_subtract()` if was added
- Atomic via FOR UPDATE lock (existing)

**Invoice** (Snippet 10):
- Initial invoice: confirmed qty only
- BO invoice: separate document when BO fulfills
- OR: consolidated invoice updated (depends on accounting preference — needs decision)

**Flash Shipping** (Snippet 3 + 5):
- Parent: create Flash order with confirmed items
- BO: either (a) secondary Flash order on fulfill, or (b) append to existing (depends on Flash API)
- Decision: secondary Flash order (cleaner tracking)

**Print Queue** (Snippet 3 + 9):
- Parent print: confirmed qty label
- BO fulfill: second print job (new label)
- Existing `_print_queued` meta repurposed or new `_print_queued_bo`

**Stock System** (Snippet 15):
- `dinoco_stock_subtract()` at split (confirmed only)
- `dinoco_stock_subtract()` at bo-fulfill (BO qty)
- `dinoco_stock_add()` at undo-split (restore confirmed)
- `dinoco_stock_add()` at cancel (restore all or confirmed only)
- Hook `dinoco_stock_changed` triggers `b2b_bo_restock_scan`

**LINE Messaging**:
- Admin Flex: `b2b_build_flex_stock_review_admin` (with delta)
- Customer Flex (split): `b2b_build_flex_partial_fulfill_customer`
- Customer Flex (BO ready): `b2b_build_flex_bo_ready_customer`
- Customer Flex (BO cancel): `b2b_build_flex_bo_cancelled_customer`
- Throttle: max 3 messages per order per day

### 9.3 Prerequisites

Before implementation:
- [ ] Security review of threat model (§2) by security-pentester
- [ ] Database schema review by database-expert
- [ ] Feature flag infrastructure (`b2b_flag_bo_system` option + check helper)
- [ ] Telegram alert integration for enumeration detection
- [ ] Test distributor account for beta (Phase 2 rollout)
- [ ] Accounting team sign-off on invoice strategy (consolidated vs separate)

### 9.4 Side Effects

**Expected**:
- Order processing time slightly longer (admin review gate)
- Admin workload +30min/day (initial, drops after UX polish)
- LINE message volume ~+15% (combined Flex vs separate messages)
- DB growth: attempt_log ~500MB/year at 10k orders/day (auto-cleanup 90d)

**Unexpected risks**:
- CSS conflict (new Backorders tab — scope with `.b2b-bo-*` prefix)
- setTimeout gotcha (use `window._dncAutoRefresh.origSetTimeout` for dashboard toasts — per CLAUDE.md)
- LINE push quota if too many notifications — implement dedup + throttle

---

## 10. Implementation Roadmap

### Phase A — Foundation (Admin UI + FSM) — 3 days

```
Day 1 — Data layer
├── Task A.1 (2h): Add ACF sub-fields to order_items repeater
│     File: [B2B] Snippet 0 or ACF registration
│     Deliverable: V.XX+1 with new fields registered
├── Task A.2 (2h): Create custom tables wp_dinoco_order_attempt_log + bo_queue
│     File: [B2B] Snippet 15 V.XX+1
│     Deliverable: dbDelta migration tested
├── Task A.3 (2h): FSM state + transition updates
│     File: [B2B] Snippet 14 V.1.6
│     Deliverable: new states + transitions + unit test
└── Task A.4 (1h): Helper functions b2b_log_attempt + b2b_compute_bo_summary
      File: [B2B] Snippet 1

Day 2 — Admin UI (static)
├── Task A.5 (3h): Admin Dashboard "Backorders" tab skeleton
│     File: [B2B] Snippet 5
├── Task A.6 (3h): Split Review modal UI
│     File: [B2B] Snippet 5
└── Task A.7 (2h): Filter + search + export CSV

Day 3 — Admin API
├── Task A.8 (2h): POST /bo-split endpoint (backend)
├── Task A.9 (2h): POST /bo-confirm-full + /bo-reject
├── Task A.10 (2h): POST /bo-undo-split
├── Task A.11 (2h): GET /bo-queue + POST /bo-restock-scan
└── Unit tests (implicit)
```

**Deploy gate A**: feature flag OFF, admin can manually call endpoints via dashboard but no agent-facing changes.

### Phase B — Agent place-order Refactor — 2 days

```
Day 4 — Rate limits + caps
├── Task B.1 (1h): Add wp_options defaults
├── Task B.2 (3h): Modify b2b_rest_place_order with caps + rate limits
│     File: [B2B] Snippet 3
├── Task B.3 (2h): Modify /cancel-request rate limits + state gating
├── Task B.4 (1h): Daily counter increment/reset logic
└── Task B.5 (1h): Attempt logging everywhere

Day 5 — Opaque accept flow
├── Task B.6 (2h): Modify place-order to create in pending_stock_review
├── Task B.7 (2h): Admin notification hook (send new Flex)
├── Task B.8 (2h): Filter admin-only meta from customer REST responses
└── Task B.9 (2h): LIFF UI update — new status badge + message
```

**Deploy gate B**: feature flag FLIPPED ON for 1 beta distributor. Monitor for 48h.

### Phase C — Notifications + Customer UI — 1 day

```
Day 6 — Flex templates + customer UI
├── Task C.1 (2h): b2b_build_flex_stock_review_admin (with delta)
├── Task C.2 (2h): b2b_build_flex_partial_fulfill_customer (combined)
├── Task C.3 (1h): b2b_build_flex_bo_ready_customer
├── Task C.4 (1h): b2b_build_flex_bo_cancelled_customer
├── Task C.5 (2h): LIFF orders detail — split view
```

### Phase D — Cron Jobs + Detection — 1 day

```
Day 7 — Automation
├── Task D.1 (1h): b2b_bo_restock_scan_cron (every 15min)
├── Task D.2 (1h): b2b_bo_eta_warn_cron (daily)
├── Task D.3 (1h): b2b_pending_review_expire_cron (hourly)
├── Task D.4 (2h): b2b_enumeration_scan_cron + Telegram alert
├── Task D.5 (1h): b2b_order_attempt_log_cleanup (daily)
└── Task D.6 (2h): Security Log tab in admin (phase 2 polish)
```

### Phase E — Rollout — 1 week

```
Week 2, Day 1-2: Beta test with 1 distributor
  ├── Monitor: order success rate, split click rate, complaint volume
  ├── Adjust: qty caps if too tight/loose
  └── Fix: any UX issues reported

Week 2, Day 3-4: Expand to silver tier distributors (~10 dealers)
  ├── Monitor: admin workload, BO resolve time
  └── Tune: ETA defaults, Flex copy

Week 2, Day 5-7: Expand to gold tier (~30 dealers)
  └── Prepare for full rollout announcement

Week 3: Platinum tier (~50 dealers)
Week 4: Full rollout (all tiers)
  ├── Deprecation notice: checking_stock state marked legacy
  └── Documentation update: distributor guide
```

### Gantt-Style Timeline

```
Week 1 (7 days):
Day 1 [████████░░] Data layer
Day 2 [████████░░] Admin UI static
Day 3 [████████░░] Admin API
Day 4 [████████░░] Place-order refactor 1/2
Day 5 [████████░░] Place-order refactor 2/2
Day 6 [████████░░] Notifications
Day 7 [████████░░] Cron + detection

Week 2 (Rollout):
Day 8-9   [██░░░░░░░░] Beta 1 distributor
Day 10-11 [████░░░░░░] Silver tier
Day 12-14 [██████░░░░] Gold tier

Week 3:
Day 15-21 [████████░░] Platinum tier

Week 4:
Day 22-28 [██████████] Full rollout
```

**Total effort**: 7 days dev + 21 days gradual rollout

---

## 11. Migration Plan

### 11.1 Pre-Migration Checklist

- [ ] Backup DB (full)
- [ ] Feature flag `b2b_flag_bo_system` defined, default FALSE
- [ ] Beta tester list `b2b_flag_bo_beta_distributors` empty
- [ ] Custom tables created successfully (dbDelta)
- [ ] ACF sub-fields registered
- [ ] FSM states added (B2B_Order_FSM::$transitions)
- [ ] All new endpoints registered and smoke-tested with `manage_options`
- [ ] Telegram alert channel configured

### 11.2 Phase Gates

**Gate 1 → Phase A complete**:
- All data + FSM + admin UI code deployed
- Flag OFF → no behavior change for agents
- Admin can browse Backorders tab (empty) + view endpoints respond

**Gate 2 → Phase B deployed + beta flip**:
- Place-order refactor live
- Flag still OFF for 99% distributors
- Flip ON for 1 beta distributor via `b2b_flag_bo_beta_distributors`
- Helper check:
  ```php
  function b2b_bo_enabled_for($dist_id) {
      if (!get_option('b2b_flag_bo_system')) {
          $betas = get_option('b2b_flag_bo_beta_distributors', []);
          return in_array($dist_id, $betas);
      }
      return true;
  }
  ```
- Monitor 48h: error rate, complaint volume, admin workload
- Rollback trigger: error rate >2% OR complaints >3

**Gate 3 → Tier-by-tier rollout**:
- Silver: add all silver IDs to beta list
- Gold: add gold IDs
- Platinum: add platinum IDs

**Gate 4 → Full rollout**:
- Flip `b2b_flag_bo_system` = true globally
- Remove beta list (or keep as opt-out for legacy distributors)
- Deprecation notice for `checking_stock` flow

**Gate 5 → Legacy removal** (3 months post full rollout):
- Remove `checking_stock → awaiting_confirm (admin)` FSM transition
- Remove legacy place-order path
- Code cleanup

### 11.3 Rollback Plan

**Emergency rollback (Phase B-D)**:
```sql
-- Disable feature
UPDATE wp_options SET option_value = '' WHERE option_name = 'b2b_flag_bo_system';
DELETE FROM wp_options WHERE option_name = 'b2b_flag_bo_beta_distributors';

-- Resolve in-flight orders (manual admin action per order):
-- 1. Query pending_stock_review orders
SELECT p.ID FROM wp_posts p
WHERE post_type = 'b2b_order' AND post_status = 'pending_stock_review';

-- 2. For each: move to checking_stock via FSM (admin panel button)
-- 3. Resolve partial_fulfilled by either completing BO or cancelling
```

**Data cleanup** (if feature permanently rejected):
- `wp_dinoco_order_attempt_log` → keep for audit
- `wp_dinoco_bo_queue` → keep (historical record)
- ACF sub-fields → leave (null values don't break old code)
- Post meta `_b2b_bo_*` → leave (ignored)

### 11.4 Communication Plan

**T-7 days**:
- Email all distributors: "ระบบยืนยันออเดอร์ใหม่เริ่ม DD/MM"
- Update FAQ page

**T-1 day**:
- LINE broadcast beta distributor: "พรุ่งนี้ระบบใหม่เริ่มทำงาน"

**T+0**:
- Deploy Gate 2
- Monitor dashboard in realtime

**T+7 days** (per tier):
- Tier expansion announcement

**T+28 days**:
- Full rollout announcement
- New feature highlight in monthly newsletter

---

## 12. Testing Checklist

### 12.1 Unit Tests

- [ ] `b2b_rate_limit` enforces correctly at boundary
- [ ] `b2b_log_attempt` writes to custom table
- [ ] FSM rejects invalid transitions
- [ ] FSM allows all new transitions
- [ ] `b2b_compute_bo_summary` returns correct totals
- [ ] Daily counter transient increments atomically
- [ ] Tier value cap enforces correctly

### 12.2 Integration Tests

- [ ] Place order → pending_stock_review → admin confirm full → awaiting_confirm → stock subtract
- [ ] Place order → pending_stock_review → admin split → partial_fulfilled → stock subtract (confirmed only) + bo_queue entry
- [ ] Place order → admin reject → cancelled → counters reverted
- [ ] Partial → BO fulfill → awaiting_confirm (when all BO resolved)
- [ ] Partial → cancel parent → BO auto-cancel + stock restore
- [ ] Split undo within 10min → restore stock + bo_queue cleared
- [ ] Split undo after 10min → rejected
- [ ] Concurrent A + B on same SKU (FOR UPDATE) → no oversell
- [ ] Restock → dinoco_stock_add → bo_queue updated to ready → admin notified

### 12.3 Security Tests (pentester)

- [ ] Binary search attack (20 attempts) → 0 info leak
- [ ] Timing analysis → σ <10ms across qty ranges
- [ ] Cancel-retry loop → rate limit trips
- [ ] Parallel probe (10 concurrent) → daily cap trips
- [ ] CSRF on bo-split → rejected
- [ ] Cross-distributor access → rejected
- [ ] Admin meta in customer response → filtered
- [ ] SQL injection on all new endpoints → blocked
- [ ] XSS in note field → sanitized
- [ ] Flex template scrape → no stock numbers

### 12.4 UX Tests

- [ ] Agent LIFF: place order success flow
- [ ] Agent LIFF: rate limit error is clear but vague
- [ ] Agent LIFF: order list shows "pending review" status
- [ ] Agent LIFF: split order shows confirmed + BO breakdown
- [ ] Admin LIFF: Backorders tab loads <2s with 100 items
- [ ] Admin LIFF: Split modal inputs validate correctly
- [ ] Admin LIFF: Undo button appears for 10min post-split
- [ ] Customer Flex: combined notification is readable
- [ ] Customer Flex: BO ready notification is clear
- [ ] Mobile: all Flex cards render correctly on iOS + Android

### 12.5 Edge Case Tests

- [ ] Walk-in distributor: skip opaque accept (direct to awaiting_confirm)
- [ ] Mixed order: some SKU full + some partial → correct per-SKU split
- [ ] Order with 50 items all need split → UI performs + split succeeds
- [ ] Admin changes mind during review (no action) → order stays pending 72h → auto-cancel
- [ ] BO ETA passes without restock → admin notified
- [ ] Discontinued SKU → cancel BO + customer notified
- [ ] Split → undo → split again → valid
- [ ] Split → undo after 10min → rejected, admin gets error
- [ ] Parent cancel during partial_fulfilled → BO cascaded cancel + stock restore
- [ ] Two admins review same order simultaneously → advisory lock prevents double-split

### 12.6 Rollback Tests

- [ ] Flip flag OFF mid-flow → new orders use legacy path
- [ ] In-flight pending_stock_review orders → admin can manually resolve
- [ ] Custom tables survive flag toggle
- [ ] FSM states coexist (both old and new work)

---

## 13. Open Questions for Stakeholders

1. **Invoice strategy**: separate invoice per BO fulfillment, or consolidated updated invoice?
   - Preferred: separate (cleaner accounting)
   - Decision owner: finance team

2. **Tier value caps — exact numbers**:
   - standard: 50k? silver: 100k? gold: 200k? platinum: 500k?
   - Decision owner: product + finance

3. **ETA default**: 7 days reasonable? some SKUs may take 30d
   - Option: per-SKU default ETA in Product Catalog
   - Decision owner: product

4. **Flash shipping BO**: secondary Flash order vs append to existing?
   - Preferred: secondary (cleaner tracking)
   - Decision owner: ops

5. **Consolidated vs split debt invoice**:
   - Current: consolidated (all qty × price)
   - Proposed: parent = confirmed only, BO increments on fulfill
   - Decision owner: finance

6. **Enumeration detection threshold**:
   - >5 cancels/24h → alert? or >10?
   - Decision owner: security

7. **Admin split workflow permission**:
   - manage_options OR any b2b_admin_group member?
   - Decision owner: product

8. **Discontinued SKU handling**:
   - Manual cancel per BO item, or admin bulk action?
   - Decision owner: ops

---

## 14. Appendix

### 14.1 Glossary

- **BO (Backorder)**: Order line item waiting for stock
- **Opaque Accept**: Accept order without revealing stock status
- **Split**: Divide order into confirmed + BO portions
- **Stock Delta**: `requested - available` — admin-only visibility
- **Partial Fulfilled**: Order state where some items shipped, some BO
- **FSM**: Finite State Machine (order status transitions)

### 14.2 Code References

- `[B2B] Snippet 3: LIFF E-Catalog REST API` line 628 — `b2b_rest_place_order`
- `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` line 3628-3691 — stock cut hook
- `[B2B] Snippet 14: Order State Machine` line 25-85 — FSM transitions
- `[B2B] Snippet 1` line 146-165 — `b2b_rate_limit()`
- `[B2B] Snippet 1` line 155 — rate limit pattern example
- `[B2B] Snippet 3` line 644-648 — duplicate guard pattern
- `[B2B] Snippet 13: Debt Transaction Manager` — atomic debt ops
- `[B2B] Snippet 15: Custom Tables & JWT Session` — custom table pattern
- `dinoco_stock_subtract` in `[Admin System] DINOCO Global Inventory Database` — atomic stock ops
- Related: `FEATURE-SPEC-B2F-HIERARCHY-B2B-BO-2026-04-16.md` (Issue #2 high-level)

### 14.3 Constants to Define

```php
// wp-config.php or config snippet
// (all optional — wp_options used as fallback)
// No new define() required — all config in wp_options
```

### 14.4 Related Wiki Topics

- [[B2B Backorder]]
- [[Stock Enumeration Attack]]
- [[B2B Order FSM]]
- [[B2B Debt System]]
- [[Walk-in Distributor]]
- [[Inventory System]]
- [[Rate Limiting]]
- [[Feature Flag Rollout]]
- [[Opaque Accept Pattern]]

---

## Pre-Handoff Checklist

- [x] All user flows have error handling (§3.4)
- [x] All API endpoints have permission checks (§5)
- [x] All UI states defined (pending, split, BO ready, BO cancel, rate limit)
- [x] All text is Thai (Flex templates, UI copy)
- [x] Mobile-first design (LINE in-app browser)
- [x] No conflict with existing features (compat plan §11)
- [x] Performance impact assessed (DB growth, cron load)
- [x] Security review ready (§2, §8)
- [x] Rollback plan documented (§11.3)
- [x] Migration plan phased (§11.2)
- [x] Threat model complete (§2)
- [x] Data model specified (§4)
- [x] FSM diagram included (§7)
- [ ] Security review signoff (security-pentester)
- [ ] Database review signoff (database-expert)
- [ ] Stakeholder Q&A resolved (§13)

---

**End of Spec v1.0**

**Next step**: Dispatch to `security-pentester` for threat model review (§2), then `database-expert` for schema review (§4), then `fullstack-developer` for Phase A implementation.
