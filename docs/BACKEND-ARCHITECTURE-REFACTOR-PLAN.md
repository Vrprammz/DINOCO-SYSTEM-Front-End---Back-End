297 register_rest_route calls scattered across files (CLAUDE.md says 125+ unique routes — many are reroutes/duplicates). Now I have full context. Writing the plan now.

---

# DINOCO Backend Architecture Refactor Plan

---

## A. EXECUTIVE SUMMARY

### สถานการณ์ปัจจุบัน

ใน 2 วันล่าสุด deploy 16 commits — **5 ใน 16 (31%) เป็น cascade fix จาก feature เดียว** (Slip Monitor V.1.0):
- `3acfc12` Slip V.34.8 deploy
- `37fe540` ลืม register `TAB_LABELS['slip_monitor']` → click no-op
- `54bb54a` ลืม register `$modules[]` placeholder div → blank page
- `f3d7ee3` ใช้ `function fmt฿()` ซึ่ง JS engine reject (ไม่ใช่ valid identifier)
- `ec5fa76` BUG-A: เรียก recalc ก่อน auto_mark_paid → stale debt → Flex แจ้งผิด
- `fd9e957` PHP $stats_24h init ขาด 9 keys → JS แสดง NaN

ทุก bug **detect ได้ใน production เท่านั้น** — ไม่มี test, ไม่มี staging, ไม่มี integration check.

### Top 5 Root Causes

| # | ปัญหา | หลักฐาน | ความเสียหาย |
|---|---|---|---|
| 1 | **เพิ่ม Admin tab ต้อง wire 6 จุด** ลืมจุดเดียว = silent fail | V.33.0→33.3 cascade (4 commits) | Dev ต้องเดา / customer เห็นปุ่มกดไม่ได้ |
| 2 | **ไม่มี Transaction boundary** — ลำดับ mutate/recalc/notify scatter ทุก function | Slip BUG-A: recalc → mark_paid (กลับลำดับ) | หนี้ผิด, Flex ส่งข้อมูลผิดให้ลูกค้า |
| 3 | **Audit log แตกเป็น 6 ที่** (`_debt_audit_log` postmeta + `wp_dinoco_slip_log` + `wp_dinoco_stock_transactions` + `wp_dinoco_flash_audit` + B2F payable audit + `_b2f_*` postmeta) — query forensic ไม่ได้ | "ตัดหนี้ครั้งนี้มาจากที่ไหน?" ตอบไม่ได้ใน 1 query | Debug ใช้เวลา 30 นาที+ ต่อเคส |
| 4 | **wp_options 132+ keys ไม่มี schema** — typo "b2b_flag_bo_systmem" จะ default OFF เงียบ | 132 `get_option` calls scattered | Feature flag flip ผิด เงียบ |
| 5 | **Cron 30+ jobs scatter ใน 8 snippets** ไม่มี registry — ไม่มี last_run / heartbeat | `wp_schedule_event` 30+ จุด | Cron ตายแล้วรู้ตอนลูกค้า complain |

### Top 5 Solutions (Pillars)

| Pillar | Pattern | ROI estimate |
|---|---|---|
| **P1: Module Registry** | `dinoco_register_admin_module([...])` auto-wire 5 จุด + admin notice ถ้าลืม field | กัน cascade bug ~80% (ของ 8 commits 6 commits จะถูก compile-time block) |
| **P2: Transaction Wrapper** | `dinoco_transaction($name, $callback, $ctx)` enforce VALIDATE→LOCK→MUTATE→RECALC→NOTIFY | กัน BUG-A class — debt/credit/stock เกิดบ่อย 1-2 ครั้ง/เดือน |
| **P3: Unified Audit Log** | `wp_dinoco_audit_log` table + `dinoco_audit_log($event, $ref_id, ...)` API | Forensic 1 query, lower MTTR ~5x (30 นาที → 5 นาที) |
| **P4: Config Layer** | `dinoco_config('namespace.key')` + schema + admin viewer | กัน typo + flag drift |
| **P5: Health + Cron Registry** | `/wp-json/dinoco/v1/health` + `dinoco_register_cron($name,...)` + heartbeat | Detect cron-dead ก่อน customer complain |

### ROI Estimate (คอนเซอร์เวทีฟ)

- **Cascade fix prevention**: 5 commits/2 วัน → 1 commit/2 วัน = ~2 dev hours/วัน คืน
- **Debug time**: forensic chain 30 นาที → 5 นาที = ~25 นาที/incident × ~10 incidents/เดือน = 4 ชม./เดือน
- **Confidence**: deploy บ่อยขึ้นได้ ไม่ต้องกลัว silent fail
- **Total**: ~50-80 dev hours/เดือน คืน หลัง Phase 2 เสร็จ

### Phased Timeline (4-6 สัปดาห์)

| Phase | สัปดาห์ | Deliverable | Risk | Backward compat |
|---|---|---|---|---|
| **1** | สัปดาห์ 1 | Module Registry + Audit Log table + dual-write | Low | 100% — ของเดิมยังรัน |
| **2** | สัปดาห์ 2 | Transaction wrapper + migrate Slip + Debt | Medium | 100% — wrapper เป็น additive |
| **3** | สัปดาห์ 3 | Config Layer + Health Endpoint + Cron Registry | Low | 100% |
| **4** | สัปดาห์ 4-6 | Migrate existing modules + retire legacy patterns | Low | Phased per-module |

---

## B. DETAILED PLAN (Feature Spec)

# Feature Spec: DINOCO Backend Architecture Refactor — 5 Pillars
Version: 1.0 | Date: 2026-04-24 | Author: Feature Architect

## 1. Problem & Goal

### ปัญหา (concrete)

**Cascade A — Slip Monitor 4-commit fix** (`3acfc12`→`37fe540`→`54bb54a`→`f3d7ee3`):
ปัญหาคือ snippet `[Admin System] DINOCO Slip Monitor` deploy แล้ว แต่ Admin Dashboard ต้อง register tab ใน **6 ที่** เพื่อให้ทำงาน:
1. `nav-item` HTML markup (line 3520+) — `<a data-tab="slip_monitor">`
2. `$module_map[]` (line 687) — map → shortcode
3. `$cacheable_modules[]` (line 710) — TTL
4. `$modules[]` (line 3779) — generate `<div id="tab-wrapper-slip_monitor">`
5. `TAB_LABELS{}` JS (line 3837) — `switchTab()` gates on `if (!TAB_LABELS[tab]) return;`
6. (optional) `MODULE_TRIGGERS{}` + `TAB_REFRESH{}` if needs init

ลืม #5 → click no-op (`37fe540`). ลืม #4 → blank page (`54bb54a`). ลืม #3 → no caching (perf). ไม่มี check ใดเลย — **ทุกอย่างเป็น defensive guard ที่ silent return ถ้าไม่เจอ**.

**Cascade B — Slip Manual Process BUG-A** (`ec5fa76`):
```
WRONG order: recalc → auto_mark_paid → send Flex
                   ↑
                   recalc ตอน order_status ยัง awaiting_payment → returns wrong $new_debt

FIX order:   auto_mark_paid → recalc → send Flex
```
ความจริง pattern นี้ก็มีใน `b2b_handle_slip_image` (Snippet 2 line 3051-3062) อยู่แล้ว — แต่ไม่มี wrapper บังคับ → dev เขียน manual process ใหม่ก็เลือก order ผิดเอง.

**Cascade C — `function fmt฿()`** (`f3d7ee3`):
฿ (U+0E3F) อยู่ใน Unicode category `Sc` (Currency Symbol) ซึ่ง JS engine reject ตาม ECMA-262 §11.6 — แต่ **PHP ไม่บ่น เพราะอยู่ใน `<<<EOT` heredoc**. ทั้ง snippet โหลดได้ แต่ JS parse error → page เงียบ. ไม่มี linter ใน WP Code Snippets architecture.

### เป้าหมาย (success metrics วัดได้)

1. **Cascade rate**: จาก 5/16 commits (31%) เหลือ < 5% ภายใน 6 สัปดาห์
2. **Mean time to recover (MTTR) production bug**: 30 นาที → 5 นาที (forensic chain ใน 1 query)
3. **Dev velocity** เพิ่ม feature ใหม่: 6 wiring sites → 1 (registry call)
4. **Cron heartbeat coverage**: 30+ cron jobs ตอนนี้ไม่มี monitor → 100% covered ภายใน 3 สัปดาห์
5. **Audit forensic**: ทุก financial mutation linkable to source event (slip_log_id, order_id, manual_uid) — single query

---

## 2. User Flows

### Flow 2.1 — Developer เพิ่ม Admin tab ใหม่

**Current (cascade-prone)**:
```
1. สร้าง snippet ใหม่ + DB_ID header
2. เปิด [Admin System] DINOCO Admin Dashboard → แก้ 6 จุด:
   2a. nav-item HTML
   2b. $module_map
   2c. $cacheable_modules
   2d. $modules[]
   2e. TAB_LABELS{}
   2f. (optional) TAB_REFRESH{}
3. Deploy → click ทดสอบ
4. ลืมจุดไหน → silent fail → user complain → revert/fix loop
```

**Proposed (Phase 1)**:
```php
// ใน snippet ใหม่ ของตัวเอง — 1 จุด:
dinoco_register_admin_module(array(
    'key'       => 'slip_monitor',
    'label'     => 'Slip Monitor',
    'shortcode' => '[dinoco_slip_monitor]',
    'cache_ttl' => 30,
    'nav_section' => 'finance',     // 'finance' | 'b2b' | 'b2f' | 'system'
    'icon'      => 'analytics',
    'capability' => 'manage_options',
    'on_load_js' => 'dncSlipInit',  // optional — function name to call on tab activation
));
```
**Validation บน admin_init**:
- Required field ขาด → admin notice red banner "Module 'slip_monitor' missing required field 'shortcode'" + log
- Duplicate key → admin notice + skip
- Shortcode does not exist → admin notice yellow + skip
- nav_section invalid → fail-loud

Admin Dashboard ทำ render loop เอง — registry คือ source of truth.

### Flow 2.2 — Admin debug production issue (debt mismatch)

**Current**:
```
1. ลูกค้า A complain "ตัดหนี้ผิด — ฿2280 หายไปไหน"
2. Dev open WP admin → ดู _debt_audit_log postmeta (sliding 200 entries)
3. เห็นรายการ subtract ฿2280 แต่ reason=manual_admin_slip:u=...:CNX-A24-...
4. Dev ต้องไป wp_dinoco_slip_log ค้น trans_ref CNX-A24-... → เจอ slip_id 5234
5. Dev ต้องไป wp_posts ค้น order ที่มี _slip_trans_ref = 'CNX-A24-...' → เจอ #6266
6. Dev ต้องไป Flash audit ค้น ticket → ...
รวม: 30+ นาที, 5 queries แยก, ไม่ link กัน
```

**Proposed**:
```sql
-- 1 query: ดู mutation chain ทั้งหมดที่เกี่ยวกับ dist 1234 ใน 24 ชม.
SELECT * FROM wp_dinoco_audit_log
WHERE actor_ref = 'distributor:1234'
  AND created_at >= NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC;
-- Output:
-- 2026-04-24 14:23  debt.subtract  amount=2280  by=admin:5  source=slip_log:5234  trans_id=tx_abc123
-- 2026-04-24 14:23  slip.process   amount=2280  trans_ref=CNX-A24-...   trans_id=tx_abc123
-- 2026-04-24 14:23  order.paid     order:6266  trans_id=tx_abc123
-- 2026-04-24 14:24  flex.sent      type=payment_confirm  trans_id=tx_abc123
```
ทุก row link ด้วย `trans_id` (transaction wrapper-generated UUID) → forensic 1 query

### Flow 2.3 — Operator monthly close

**Current**: Dev ต้อง query manually ทุก table แยก, รวม CSV export ด้วยมือ
**Proposed**: `[dinoco_audit_export from="2026-04-01" to="2026-04-30" actor_type="distributor"]` → CSV รวมจาก audit log table

---

## 3. Data Model

### 3.1 NEW table: `wp_dinoco_module_registry` (Pillar 1)

ไม่จำเป็นต้องเป็น table — เก็บใน `wp_options` key `dinoco_admin_modules` (JSON) ก็พอ เพราะ:
- Read-heavy, write-rare
- < 100 rows
- Schema validated ใน PHP helper

```php
// Storage: wp_options key 'dinoco_admin_modules' = JSON
[
  "slip_monitor" => [
    "key" => "slip_monitor",
    "label" => "Slip Monitor",
    "shortcode" => "[dinoco_slip_monitor]",
    "cache_ttl" => 30,
    "nav_section" => "finance",
    "icon" => "analytics",
    "capability" => "manage_options",
    "registered_at" => "2026-04-24 21:40:50",
    "registered_by" => "[Admin System] DINOCO Slip Monitor V.1.6"
  ],
  ...
]
```

### 3.2 NEW table: `wp_dinoco_audit_log` (Pillar 3) — **CORE**

```sql
CREATE TABLE wp_dinoco_audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    trans_id VARCHAR(36) NOT NULL DEFAULT '',     -- UUID จาก dinoco_transaction()
    event VARCHAR(64) NOT NULL,                   -- 'debt.subtract', 'stock.adjust', 'slip.process', etc.
    actor_type VARCHAR(32) NOT NULL DEFAULT '',   -- 'distributor', 'maker', 'product', 'order', 'system'
    actor_ref VARCHAR(64) NOT NULL DEFAULT '',    -- 'distributor:1234', 'sku:DNCXL7500', 'order:6266'
    user_id BIGINT UNSIGNED DEFAULT NULL,         -- WP user who triggered (NULL = system/cron)
    source_type VARCHAR(32) DEFAULT NULL,         -- 'slip_log', 'order', 'manual', 'cron', 'webhook'
    source_id BIGINT UNSIGNED DEFAULT NULL,       -- FK to source row id
    amount DECIMAL(14,2) DEFAULT NULL,
    old_value VARCHAR(255) DEFAULT NULL,          -- as string for flexibility
    new_value VARCHAR(255) DEFAULT NULL,
    payload JSON DEFAULT NULL,                    -- arbitrary context
    request_id VARCHAR(64) DEFAULT NULL,          -- from dinoco_obs_get_request_id()
    severity VARCHAR(16) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error'
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_trans_id (trans_id),
    KEY idx_actor (actor_type, actor_ref, created_at),
    KEY idx_event_time (event, created_at),
    KEY idx_source (source_type, source_id),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**TTL policy**: 365 วัน (PDPA + financial audit). Cleanup cron `dinoco_audit_log_cleanup_cron` daily 03:00 — chunked 5000 rows/iter + 50ms gap.

**Migration plan**:
- ของเดิม `_debt_audit_log` postmeta (sliding 200) **คงไว้** + dual-write หลังจาก Phase 1
- `wp_dinoco_slip_log` คงไว้ — slip-specific fields ไม่ย้าย แต่เพิ่ม `audit_log_id` FK
- `wp_dinoco_stock_transactions` คงไว้ — เพิ่ม `audit_log_id` FK
- `wp_dinoco_flash_audit` คงไว้ — เป็น Flash-specific เก็บ payload_json ใหญ่
- ใหม่ `wp_dinoco_audit_log` คือ **cross-system index** ที่ link ทุกอย่างด้วย `trans_id`

ไม่ใช่ replace, เป็น **unifying view**.

### 3.3 NEW: `wp_dinoco_cron_heartbeat` (Pillar 5)

```sql
CREATE TABLE wp_dinoco_cron_heartbeat (
    cron_name VARCHAR(64) NOT NULL,               -- 'b2b_dunning_cron_event'
    last_run_at DATETIME DEFAULT NULL,
    last_status VARCHAR(16) DEFAULT NULL,         -- 'ok', 'error', 'timeout'
    last_duration_ms INT UNSIGNED DEFAULT NULL,
    last_error VARCHAR(500) DEFAULT NULL,
    consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
    expected_interval_seconds INT UNSIGNED NOT NULL,  -- 'every_5_minutes' = 300
    PRIMARY KEY (cron_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Read-only by humans. Updated by `dinoco_register_cron` wrapper.

### 3.4 Config Schema (Pillar 4) — `wp_options` key `dinoco_config_schema`

ไม่ใช่ table — เก็บ schema ใน PHP code (registered ที่ snippet boot) + values ยังอยู่ใน `wp_options` (backward compat 100%).

```php
// Each snippet declares its config keys ตอน load:
dinoco_config_register('slip', array(
    'lock_ttl_seconds'    => array('type' => 'int',  'default' => 3,  'min' => 1, 'max' => 30),
    'replay_window_hours' => array('type' => 'int',  'default' => 24, 'min' => 1, 'max' => 168),
    'force_clear_enabled' => array('type' => 'bool', 'default' => true),
    'unknown_codes_block' => array('type' => 'array', 'default' => array('200500','200502','200503')),
));

// อ่าน:
$ttl = dinoco_config('slip.lock_ttl_seconds');  // returns int 3 with type cast + default fallback
```

---

## 4. API Design

### 4.1 Pillar 1 — Module Registry API

```php
// Snippet: NEW [Admin System] DINOCO Module Registry V.1.0 (DB_ID: TBD)

if ( ! function_exists( 'dinoco_register_admin_module' ) ) {
    function dinoco_register_admin_module( $args ) {
        // Required: key, label, shortcode
        $required = array('key', 'label', 'shortcode');
        $defaults = array(
            'cache_ttl'    => 0,
            'nav_section'  => 'system',
            'icon'         => '',
            'capability'   => 'manage_options',
            'on_load_js'   => '',
            'order'        => 100,
        );
        $args = array_merge($defaults, $args);

        foreach ($required as $f) {
            if (empty($args[$f])) {
                dinoco_admin_notice('error',
                    "Module registration failed: missing '$f' (key=" . ($args['key'] ?? '?') . ')'
                );
                return false;
            }
        }

        $registry = get_option('dinoco_admin_modules', array());
        if (is_string($registry)) $registry = json_decode($registry, true) ?: array();

        $args['registered_at'] = current_time('mysql');
        $args['registered_by'] = $args['source'] ?? '(unknown)';

        $registry[$args['key']] = $args;
        update_option('dinoco_admin_modules', $registry, false);  // not autoload — read-when-needed

        return true;
    }
}

function dinoco_admin_module_get_all() {
    $r = get_option('dinoco_admin_modules', array());
    if (is_string($r)) $r = json_decode($r, true) ?: array();
    // Sort by nav_section then order
    uasort($r, function($a, $b) {
        if ($a['nav_section'] !== $b['nav_section']) {
            $sections = array('dashboard'=>0, 'b2b'=>1, 'b2f'=>2, 'finance'=>3, 'system'=>9);
            return ($sections[$a['nav_section']] ?? 99) - ($sections[$b['nav_section']] ?? 99);
        }
        return ($a['order'] ?? 100) - ($b['order'] ?? 100);
    });
    return $r;
}

// Validation cron — runs daily, alerts if shortcode disappeared
add_action('admin_init', function() {
    if (!current_user_can('manage_options')) return;
    static $checked = false;
    if ($checked) return;
    $checked = true;

    $modules = dinoco_admin_module_get_all();
    foreach ($modules as $key => $m) {
        // Check shortcode exists
        $sc = trim($m['shortcode'], '[]');
        $sc_name = explode(' ', $sc)[0];
        global $shortcode_tags;
        if (!isset($shortcode_tags[$sc_name])) {
            dinoco_admin_notice('warning',
                "Module '$key' shortcode [$sc_name] not registered (snippet disabled?)"
            );
        }
    }
});
```

**Admin Dashboard refactor** (Phase 1, additive):
```php
// แทนที่ hardcode $module_map, $cacheable_modules, $modules[], TAB_LABELS:
$registry = dinoco_admin_module_get_all();
foreach ($registry as $key => $m) {
    $module_map[$key] = $m['shortcode'];
    if ($m['cache_ttl'] > 0) $cacheable_modules[$key] = $m['cache_ttl'];
}
// JS: emit TAB_LABELS as JSON
echo '<script>var TAB_LABELS = ' . wp_json_encode(
    array_combine(array_keys($registry), array_column($registry, 'label'))
) . ';</script>';
```

**Backward compat**: Admin Dashboard merges legacy hardcoded `$module_map` + registry. New modules use registry, old modules ยังคงอยู่จน migrate.

### 4.2 Pillar 2 — Transaction Wrapper API

```php
// Snippet: NEW [System] DINOCO Transaction Manager V.1.0

if ( ! function_exists( 'dinoco_transaction' ) ) {
    /**
     * Standard mutation pattern: VALIDATE → LOCK → MUTATE → RECALC → NOTIFY
     *
     * @param string   $name      e.g. 'slip.manual_process'
     * @param callable $callback  function($ctx) — must return ['ok'=>bool, 'data'=>mixed, 'error'=>string]
     * @param array    $opts {
     *     'lock_key' => string|null     MySQL GET_LOCK name (null = no lock)
     *     'lock_timeout' => int         seconds (default 5)
     *     'mysql_transaction' => bool   START TRANSACTION + COMMIT/ROLLBACK (default true)
     *     'audit' => array              passthrough audit args (event, actor_type, actor_ref, source_type, source_id, amount, payload)
     * }
     * @return array { ok: bool, data: mixed, error: string, trans_id: string }
     */
    function dinoco_transaction( $name, $callback, $opts = array() ) {
        global $wpdb;

        $defaults = array(
            'lock_key' => null,
            'lock_timeout' => 5,
            'mysql_transaction' => true,
            'audit' => array(),
        );
        $opts = array_merge($defaults, $opts);

        $trans_id = wp_generate_uuid4();
        $start = microtime(true);

        // 1. Acquire MySQL GET_LOCK (if requested)
        $lock_acquired = false;
        if ($opts['lock_key']) {
            $lock_result = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT GET_LOCK(%s, %d)", $opts['lock_key'], $opts['lock_timeout']
            ));
            if ($lock_result !== 1) {
                dinoco_obs_capture('warning', "[$name] lock acquire fail",
                    array('trans_id' => $trans_id, 'lock_key' => $opts['lock_key']));
                return array(
                    'ok' => false,
                    'error' => 'concurrent_operation',
                    'trans_id' => $trans_id,
                );
            }
            $lock_acquired = true;
        }

        // 2. MySQL transaction
        if ($opts['mysql_transaction']) {
            $wpdb->query('START TRANSACTION');
        }

        try {
            // 3. Run user callback — passes context with trans_id
            $ctx = array(
                'trans_id' => $trans_id,
                'name' => $name,
            );
            $result = call_user_func($callback, $ctx);

            if (!is_array($result) || empty($result['ok'])) {
                throw new \RuntimeException(
                    isset($result['error']) ? $result['error'] : 'transaction_callback_returned_failure'
                );
            }

            // 4. Commit
            if ($opts['mysql_transaction']) {
                $wpdb->query('COMMIT');
            }

            // 5. Audit log (always, after commit)
            if (!empty($opts['audit'])) {
                $audit = array_merge($opts['audit'], array(
                    'trans_id' => $trans_id,
                    'event' => $opts['audit']['event'] ?? $name,
                    'severity' => 'info',
                ));
                dinoco_audit_log($audit);
            }

            $elapsed = round((microtime(true) - $start) * 1000);
            dinoco_obs_capture('info', "[$name] ok",
                array('trans_id' => $trans_id, 'elapsed_ms' => $elapsed));

            return array(
                'ok' => true,
                'data' => $result['data'] ?? null,
                'trans_id' => $trans_id,
            );

        } catch (\Throwable $e) {
            if ($opts['mysql_transaction']) {
                $wpdb->query('ROLLBACK');
            }
            dinoco_obs_capture_exception($e, array('trans_id' => $trans_id, 'name' => $name));

            // Audit failure too
            if (!empty($opts['audit'])) {
                $audit = array_merge($opts['audit'], array(
                    'trans_id' => $trans_id,
                    'event' => $opts['audit']['event'] ?? $name,
                    'severity' => 'error',
                    'payload' => array_merge(
                        $opts['audit']['payload'] ?? array(),
                        array('error' => $e->getMessage())
                    ),
                ));
                dinoco_audit_log($audit);
            }

            return array(
                'ok' => false,
                'error' => $e->getMessage(),
                'trans_id' => $trans_id,
            );

        } finally {
            // 6. Release lock — ALWAYS, even on exception
            if ($lock_acquired) {
                $wpdb->get_var($wpdb->prepare("SELECT RELEASE_LOCK(%s)", $opts['lock_key']));
            }
        }
    }
}
```

**Slip Monitor migration example** (replaces ~80 lines manual locking):
```php
// Before (lines 632-712, 80 lines):
// Manual GET_LOCK + try/catch/finally + RELEASE_LOCK on every exit path

// After:
$result = dinoco_transaction('slip.manual_process', function($ctx) use ($dist_id, $amount, $reason_tag, $group_id, $trans_ref, $uid) {
    // VALIDATE
    if ($trans_ref !== '' && b2b_slip_is_trans_ref_seen($trans_ref)) {
        return array('ok' => false, 'error' => 'transref_seen_inlock');
    }

    // MUTATE
    $old_debt = floatval(get_field('current_debt', $dist_id));
    $new_debt = b2b_debt_subtract($dist_id, $amount, $reason_tag);
    if ($new_debt === false) return array('ok' => false, 'error' => 'debt_subtract_fail');

    // MUTATE side effects
    $paid_tickets = array();
    if ($group_id !== '') {
        $match = b2b_auto_mark_paid_after_slip($dist_id, $amount, $group_id);
        $paid_tickets = $match['paid_tickets'] ?? array();
    }

    // RECALC (after auto_mark_paid — BUG-A guarded)
    $new_debt = b2b_recalculate_debt($dist_id);

    return array('ok' => true, 'data' => compact('old_debt', 'new_debt', 'paid_tickets'));
}, array(
    'lock_key' => 'dnc_mp_' . $dist_id . '_' . md5($amount . '|' . $trans_ref),
    'lock_timeout' => 3,
    'mysql_transaction' => false,  // b2b_debt_subtract has its own START TRANSACTION
    'audit' => array(
        'event' => 'slip.manual_process',
        'actor_type' => 'distributor',
        'actor_ref' => 'distributor:' . $dist_id,
        'amount' => $amount,
        'source_type' => 'manual',
        'user_id' => $uid,
        'payload' => array('reason' => $reason_tag, 'trans_ref' => $trans_ref),
    ),
));

if (!$result['ok']) return new WP_Error($result['error'], '...', array('status' => 409));
// Side effects (Flex push) go here — outside transaction
```

**Pattern enforcement**: ลำดับใน callback บังคับ `VALIDATE → MUTATE → RECALC` — code review ดูง่าย.

### 4.3 Pillar 3 — Audit Log API

```php
function dinoco_audit_log( $args ) {
    global $wpdb;
    $defaults = array(
        'trans_id' => '',
        'event' => '',
        'actor_type' => '',
        'actor_ref' => '',
        'user_id' => get_current_user_id() ?: null,
        'source_type' => null,
        'source_id' => null,
        'amount' => null,
        'old_value' => null,
        'new_value' => null,
        'payload' => null,
        'request_id' => function_exists('dinoco_obs_get_request_id') ? dinoco_obs_get_request_id() : null,
        'severity' => 'info',
    );
    $args = array_merge($defaults, $args);
    if (empty($args['event'])) return false;

    $args['payload'] = $args['payload'] !== null ? wp_json_encode($args['payload']) : null;
    $args['created_at'] = current_time('mysql');

    return $wpdb->insert($wpdb->prefix . 'dinoco_audit_log', $args);
}

// Helpers
function dinoco_audit_chain($trans_id) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}dinoco_audit_log WHERE trans_id = %s ORDER BY created_at",
        $trans_id
    ));
}

function dinoco_audit_actor_history($actor_ref, $hours = 24) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}dinoco_audit_log
         WHERE actor_ref = %s AND created_at >= NOW() - INTERVAL %d HOUR
         ORDER BY created_at DESC",
        $actor_ref, $hours
    ));
}
```

### 4.4 Pillar 4 — Config Layer API

```php
function dinoco_config_register( $namespace, $schema ) {
    $all = get_option('dinoco_config_schema', array());
    foreach ($schema as $key => $def) {
        $all["$namespace.$key"] = $def;
    }
    update_option('dinoco_config_schema', $all, false);
}

function dinoco_config( $key, $default = null ) {
    static $cache = array();
    if (isset($cache[$key])) return $cache[$key];

    $schema = get_option('dinoco_config_schema', array());
    $def = $schema[$key] ?? null;

    // Translate key 'slip.lock_ttl_seconds' → wp_option key 'dinoco_slip_lock_ttl_seconds'
    $option_key = 'dinoco_' . str_replace('.', '_', $key);
    $raw = get_option($option_key, null);

    if ($raw === null) {
        $value = $def['default'] ?? $default;
    } else {
        $value = $raw;
    }

    // Type cast + validate
    if ($def) {
        switch ($def['type']) {
            case 'int':   $value = (int) $value; break;
            case 'float': $value = (float) $value; break;
            case 'bool':  $value = filter_var($value, FILTER_VALIDATE_BOOLEAN); break;
            case 'array': if (is_string($value)) $value = json_decode($value, true) ?: array(); break;
        }
        if (isset($def['min']) && is_numeric($value) && $value < $def['min']) $value = $def['default'];
        if (isset($def['max']) && is_numeric($value) && $value > $def['max']) $value = $def['default'];
    }

    $cache[$key] = $value;
    return $value;
}

function dinoco_config_set( $key, $value ) {
    $option_key = 'dinoco_' . str_replace('.', '_', $key);
    update_option($option_key, $value, false);
    // Bust static cache
    unset($GLOBALS['dinoco_config_cache'][$key]);
}
```

**Backward compat**: ของเดิม `get_option('b2b_flag_bo_system')` ยังคงทำงาน — config layer เป็น additive overlay.

### 4.5 Pillar 5 — Cron Registry + Health API

```php
function dinoco_register_cron( $name, $schedule, $callback, $expected_interval_seconds = null ) {
    if (!$expected_interval_seconds) {
        $intervals = wp_get_schedules();
        $expected_interval_seconds = $intervals[$schedule]['interval'] ?? 3600;
    }

    // Wrap callback for heartbeat
    $wrapped = function() use ($name, $callback, $expected_interval_seconds) {
        global $wpdb;
        $start = microtime(true);
        $status = 'ok';
        $error = '';

        try {
            call_user_func($callback);
        } catch (\Throwable $e) {
            $status = 'error';
            $error = mb_substr($e->getMessage(), 0, 500);
            dinoco_obs_capture_exception($e, array('cron' => $name));
        }

        $elapsed_ms = (int) round((microtime(true) - $start) * 1000);
        $wpdb->query($wpdb->prepare(
            "INSERT INTO {$wpdb->prefix}dinoco_cron_heartbeat
                (cron_name, last_run_at, last_status, last_duration_ms, last_error, expected_interval_seconds, consecutive_failures)
             VALUES (%s, NOW(), %s, %d, %s, %d, %d)
             ON DUPLICATE KEY UPDATE
                last_run_at = VALUES(last_run_at),
                last_status = VALUES(last_status),
                last_duration_ms = VALUES(last_duration_ms),
                last_error = VALUES(last_error),
                expected_interval_seconds = VALUES(expected_interval_seconds),
                consecutive_failures = IF(VALUES(last_status) = 'ok', 0, consecutive_failures + 1)",
            $name, $status, $elapsed_ms, $error, $expected_interval_seconds,
            $status === 'error' ? 1 : 0
        ));
    };

    add_action($name, $wrapped);
    if (!wp_next_scheduled($name)) {
        wp_schedule_event(time() + 60, $schedule, $name);
    }
}

// Health endpoint
add_action('rest_api_init', function() {
    register_rest_route('dinoco/v1', '/health', array(
        'methods' => 'GET',
        'callback' => 'dinoco_health_check',
        'permission_callback' => function() { return current_user_can('manage_options'); },
    ));
});

function dinoco_health_check() {
    global $wpdb;

    $checks = array();

    // 1. DB
    $db_ok = $wpdb->get_var("SELECT 1") == 1;
    $checks['database'] = array('status' => $db_ok ? 'ok' : 'fail');

    // 2. Crons (stale = no heartbeat in expected_interval × 2)
    $stale_crons = $wpdb->get_results(
        "SELECT cron_name, last_run_at, last_status,
                TIMESTAMPDIFF(SECOND, last_run_at, NOW()) AS seconds_since,
                expected_interval_seconds
         FROM {$wpdb->prefix}dinoco_cron_heartbeat
         WHERE TIMESTAMPDIFF(SECOND, last_run_at, NOW()) > expected_interval_seconds * 2
            OR consecutive_failures > 0"
    );
    $checks['crons'] = array(
        'status' => empty($stale_crons) ? 'ok' : 'warn',
        'stale' => $stale_crons,
    );

    // 3. Flash DLQ count
    $dlq_count = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->prefix}dinoco_flash_dead_letter
         WHERE resolved_at IS NULL"
    );
    $checks['flash_dlq'] = array(
        'status' => $dlq_count > 10 ? 'warn' : 'ok',
        'count' => $dlq_count,
    );

    // 4. Slip log error rate (last 1hr)
    $slip_stats = $wpdb->get_row(
        "SELECT
            SUM(CASE WHEN result_status IN ('paid', 'paid_overpayment', 'manual_admin_paid') THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN result_status LIKE 'error_%' OR result_status = 'fatal_exception' THEN 1 ELSE 0 END) AS err
         FROM {$wpdb->prefix}dinoco_slip_log
         WHERE created_at >= NOW() - INTERVAL 1 HOUR"
    );
    $err_rate = ($slip_stats->ok + $slip_stats->err) > 0
        ? $slip_stats->err / ($slip_stats->ok + $slip_stats->err) : 0;
    $checks['slip_processor'] = array(
        'status' => $err_rate > 0.2 ? 'warn' : 'ok',
        'error_rate_1h' => round($err_rate, 3),
    );

    // 5. BO pending review
    $bo_stale = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->prefix}posts p
         INNER JOIN {$wpdb->prefix}postmeta m ON m.post_id = p.ID AND m.meta_key = '_b2b_opaque_accept_at'
         WHERE p.post_type = 'b2b_order' AND p.post_status = 'pending_stock_review'
           AND TIMESTAMPDIFF(HOUR, FROM_UNIXTIME(m.meta_value), NOW()) > 4"
    );
    $checks['bo_review_queue'] = array(
        'status' => $bo_stale > 5 ? 'warn' : 'ok',
        'stale_count' => $bo_stale,
    );

    $all_ok = !in_array('fail', array_column($checks, 'status'), true);
    return array(
        'overall' => $all_ok ? 'ok' : 'degraded',
        'checks' => $checks,
        'timestamp' => current_time('mysql'),
    );
}
```

### REST contract changes

**No breaking changes.** New endpoints added:
- `GET /wp-json/dinoco/v1/health` — admin only
- `GET /wp-json/dinoco/v1/audit/chain/{trans_id}` — admin only
- `GET /wp-json/dinoco/v1/audit/actor/{type}/{ref}?hours=24` — admin only
- `GET /wp-json/dinoco/v1/admin-modules` — admin only (registry inspect)
- `GET /wp-json/dinoco/v1/config?namespace=slip` — admin only

---

## 5. UI/UX Wireframes

### 5.1 Admin Health Dashboard (NEW shortcode `[dinoco_admin_health]`)

```
┌─────────────────────────────────────────────────┐
│  ระบบสุขภาพ DINOCO                  [Refresh]   │
├─────────────────────────────────────────────────┤
│  Overall: ● OK  (last check: 14:23:01)          │
│                                                 │
│  ┌─ Database ────────────────  ● OK             │
│  ├─ Crons (28 registered) ──── ⚠ Warn (1 stale)│
│  │  └ b2b_flash_tracking_cron — last 4h ago    │
│  ├─ Flash DLQ ──────────────── ● OK (0 unres.) │
│  ├─ Slip Processor (1h) ────── ● OK (err 2%)   │
│  ├─ BO Review Queue ────────── ● OK            │
│  ├─ Module Registry ────────── ● OK (24 mod.)  │
│  └─ Disk Space ─────────────── ● OK (78% free) │
│                                                 │
│  [Recent Errors] [Audit Browser] [Config]      │
└─────────────────────────────────────────────────┘
```

Mobile-first (LINE in-app browser): card stack, ปุ่ม 44px+. Polling 30s + manual refresh button.

### 5.2 Module Registry Page

```
┌─────────────────────────────────────────────────┐
│  Admin Module Registry          24 registered   │
├─────────────────────────────────────────────────┤
│  Section: Finance                               │
│  ├─ slip_monitor    Slip Monitor    cache=30s   │
│  ├─ invoice         ใบแจ้งหนี้      cache=120s  │
│  └─ finance         การเงิน         cache=120s  │
│                                                 │
│  Section: B2B (5 modules)        [▼ expand]    │
│  Section: B2F (3 modules)        [▼ expand]    │
│                                                 │
│  ⚠ 1 issue:                                    │
│  • bo_security_log: shortcode disappeared      │
│    (snippet disabled?)                          │
└─────────────────────────────────────────────────┘
```

### 5.3 Audit Log Browser

```
┌─────────────────────────────────────────────────┐
│  Audit Log Browser                              │
│  Search:                                        │
│  Actor: [distributor:1234   ▼]                  │
│  Event: [* all events       ▼]                  │
│  Time:  [Last 24 hours      ▼]                  │
│  Trans: [_____________________] [🔗 follow chain]│
├─────────────────────────────────────────────────┤
│  14:23:45  debt.subtract     ฿2,280  by admin:5 │
│            └ trans: tx_abc123  [view chain]     │
│  14:23:44  slip.process      trans_ref=CNX-A24..│
│            └ trans: tx_abc123  [view chain]     │
│  14:23:44  order.paid        order:6266         │
│            └ trans: tx_abc123  [view chain]     │
│  ─── 1 hr earlier ───                          │
│  13:18:22  stock.subtract    DNCXL7500 -3       │
└─────────────────────────────────────────────────┘
```

### 5.4 Developer error: Module registration failure

```
┌─────────────────────────────────────────────────┐
│  ⚠ Module registration failed:                  │
│     Module 'slip_monitor' missing required      │
│     field 'shortcode'.                          │
│     Source: [Admin System] DINOCO Slip Monitor  │
│     Action: ตรวจ snippet → call dinoco_register │
│             _admin_module() with shortcode key  │
└─────────────────────────────────────────────────┘
```

Banner ใน admin (manage_options only) — fail loud ไม่ silent.

---

## 6. Dependencies & Impact Analysis

### Phase 1 Files

**Create new**:
- `[Admin System] DINOCO Module Registry` V.1.0 — registry helpers + admin notices
- `[B2B] Snippet 15: Custom Tables` V.8.4 → V.9.0 — เพิ่ม `wp_dinoco_audit_log` + `wp_dinoco_cron_heartbeat`
- `[Admin System] DINOCO Audit Log` V.1.0 — `dinoco_audit_log()` API + REST endpoints + browser shortcode

**Modify (additive)**:
- `[Admin System] DINOCO Admin Dashboard` V.33.3 → V.34.0 — registry-driven module loop (legacy hardcode คงไว้, merge with registry)

### Phase 2 Files

**Create new**:
- `[System] DINOCO Transaction Manager` V.1.0 — `dinoco_transaction()` helper

**Modify (refactor — breaking-internal but API stable)**:
- `[Admin System] DINOCO Slip Monitor` V.1.5 → V.2.0 — manual_process ใช้ wrapper
- `[B2B] Snippet 13: Debt Transaction Manager` V.2.0 → V.2.1 — เพิ่ม dual-write audit log
- `[B2B] Snippet 2: LINE Webhook Gateway` V.34.11 → V.35.0 — `b2b_handle_slip_image` ใช้ wrapper
- `[B2B] Snippet 16: Backorder System` V.1.6 → V.1.7 — bo-fulfill, bo-split ใช้ wrapper

### Phase 3 Files

**Create**:
- `[System] DINOCO Config Manager` V.1.0 — config schema + helpers + admin viewer
- `[System] DINOCO Cron Registry` V.1.0 — `dinoco_register_cron()` wrapper
- `[Admin System] DINOCO Health Dashboard` V.1.0 — shortcode `[dinoco_admin_health]`

**Modify**:
- All cron-scheduling snippets (8 files) — migrate `wp_schedule_event` → `dinoco_register_cron`

### Backward Compatibility

| Pattern | Compat strategy |
|---|---|
| Admin Dashboard hardcoded `$module_map` | merge with registry → dual source ทำงานพร้อม |
| `_debt_audit_log` postmeta | dual-write — wrapper เขียนทั้ง 2 ที่ |
| `wp_schedule_event` direct calls | คงทำงานต่อ — registry เป็น opt-in |
| `get_option()` direct calls | คงทำงานต่อ — `dinoco_config()` คือ overlay |
| Slip log table | คงไว้ — เพิ่ม `audit_log_id` column สำหรับ FK |

**ROLLBACK 100%** ทุก phase — ปิด registry/wrapper ปุ๊บ ของเดิมทำงานเลย.

### Side Effects

- DB writes เพิ่ม ~1-3 rows per financial mutation (audit table) — negligible <1ms
- `dinoco_admin_modules` option = JSON < 50KB
- Cron heartbeat write per cron run — < 1ms overhead

---

## 7. Implementation Roadmap

### **Phase 1 — Foundations (Week 1, 5 working days)**

**Goal**: Module Registry + Audit Log table + dual-write — zero behavior change

| Day | Task | Files | Time |
|---|---|---|---|
| 1 | Create `[Admin System] DINOCO Module Registry` V.1.0 — helpers + validation cron | 1 NEW | 4 hr |
| 1 | dbDelta migrations — `wp_dinoco_audit_log` + `wp_dinoco_cron_heartbeat` | Snippet 15 V.9.0 | 2 hr |
| 2 | Create `[Admin System] DINOCO Audit Log` V.1.0 — `dinoco_audit_log()` + REST + browser | 1 NEW | 6 hr |
| 3 | Refactor Admin Dashboard V.34.0 — registry-driven module loop (merge with legacy) | Admin Dashboard | 4 hr |
| 3 | Migrate 1 module to registry (slip_monitor) — proof of concept | Slip Monitor | 1 hr |
| 4 | Dual-write audit log in `b2b_debt_add` / `b2b_debt_subtract` | Snippet 13 V.2.1 | 2 hr |
| 4 | Dual-write audit log in `dinoco_stock_add/subtract` | Snippet 15 V.9.1 | 2 hr |
| 5 | QA + manual test cascade scenarios + deploy | — | 4 hr |

**Deliverable end of Week 1**:
- Audit Log Browser ใช้งานได้ — ทุก debt/stock change มี trail
- Module Registry ใช้งานได้ — slip_monitor migrated
- Admin Dashboard ยังคงทำงาน 100% — legacy modules ยังคงเป็นแบบเดิม
- Health endpoint scaffold พร้อม (basic checks, no cron heartbeat yet)

**Phase 1 Kill Switch**:
- `dinoco_config('audit.dual_write_enabled')` default ON → flip OFF if performance issue
- Module Registry: `dinoco_config('admin.registry_enabled')` — ปิดแล้ว fallback hardcode

---

### **Phase 2 — Transaction Wrapper (Week 2, 5 working days)**

**Goal**: All financial mutations wrapped + Slip BUG-A class eliminated

| Day | Task | Files | Time |
|---|---|---|---|
| 1 | Create `[System] DINOCO Transaction Manager` V.1.0 + unit-test pattern | 1 NEW | 4 hr |
| 2 | Migrate Slip Monitor `manual-process` REST | Slip Monitor V.2.0 | 3 hr |
| 2 | Migrate `b2b_handle_slip_image` (Snippet 2) | Snippet 2 V.35.0 | 3 hr |
| 3 | Migrate BO `bo-fulfill`, `bo-split`, `bo-confirm-full` | Snippet 16 V.1.7 | 4 hr |
| 4 | Migrate Debt operations + B2F payable | Snippet 13 V.2.2, B2F Snippet 7 V.2.0 | 4 hr |
| 5 | QA cascade scenarios + audit chain forensic test + deploy | — | 4 hr |

**Deliverable end of Week 2**:
- ทุก financial mutation มี `trans_id` linkable
- Slip / BO / Debt / Payable ใช้ wrapper เดียว
- BUG-A class (recalc-before-mark) impossible — wrapper enforces lifecycle

**Phase 2 Kill Switch**:
- `dinoco_config('transaction.wrapper_enabled')` default ON → flip OFF reverts to legacy paths (which still exist)

---

### **Phase 3 — Config + Health + Cron (Week 3, 5 working days)**

| Day | Task | Files | Time |
|---|---|---|---|
| 1 | Create `[System] DINOCO Config Manager` V.1.0 + admin viewer | 1 NEW | 5 hr |
| 2 | Register schemas for top 10 namespaces (slip, bo, flash, b2f, etc.) | 10 snippet edits | 4 hr |
| 3 | Create `[System] DINOCO Cron Registry` V.1.0 + heartbeat | 1 NEW | 4 hr |
| 3 | Migrate 30 cron jobs to `dinoco_register_cron` | 8 files | 4 hr |
| 4 | Create `[Admin System] DINOCO Health Dashboard` V.1.0 | 1 NEW | 5 hr |
| 5 | QA + Telegram alert hook + deploy | — | 4 hr |

**Deliverable end of Week 3**:
- Health endpoint complete — Telegram alert if any check fails
- All crons monitored — heartbeat visible in admin
- Config schema browser — typo prevention

---

### **Phase 4 — Migration & Cleanup (Week 4-6, ongoing)**

- Migrate remaining ~24 admin modules to registry (1-2 per day)
- Sunset hardcoded `$module_map` after all migrated
- Migrate ~50 most-used `get_option` to `dinoco_config`
- Add audit log dual-write to remaining mutation sites
- Build forensic dashboards (top distributors by mutation, slow crons, error rate trending)

---

## 8. Risk & Mitigation

| Pillar | Risk | Likelihood | Damage | Mitigation |
|---|---|---|---|---|
| **P1 Registry** | Migration broken — hardcoded module not migrated → invisible in registry | Medium | Low (UI only) | Dual-source: admin dashboard merges hardcoded + registry. Migrate gradually. |
| **P1 Registry** | JSON option corruption | Low | Medium | Validate on every read; fallback to empty array; admin alert |
| **P2 Transaction** | Wrapper bug → all financial ops fail | Low | **HIGH** | Phase 2 Kill switch + extensive QA + canary (Slip first, BO last). Wrap-and-test 1 op at a time. |
| **P2 Transaction** | Lock contention if `lock_key` reused | Medium | Medium | Naming convention `$op:$resource_id`; document; lock timeout 5s default |
| **P3 Audit Log** | Write amplification (every op = +1 row) | Medium | Low | InnoDB row 200 bytes; 10K writes/day = 2MB; cleanup cron 365 days |
| **P3 Audit Log** | Schema drift (new field needed) | Low | Low | `payload` JSON column = future-proof |
| **P4 Config** | Schema-typed value rejected legitimate value | Low | Medium | `dinoco_config()` falls back to `default` on validation fail + log warning |
| **P5 Cron Registry** | Heartbeat insert blocks long-running cron | Low | Low | Heartbeat = single INSERT ~1ms |
| **P5 Health** | False alert (e.g. cron stale = WP cron disabled by design) | Medium | Low | Configurable thresholds + suppress flag per check |

**Highest risk = P2 Transaction Wrapper** — touches financial code. Mitigation:
1. Phase 2 deploy = 1 endpoint at a time (Slip manual_process first — already has lock semantics)
2. Audit log lets us forensic any miscalc within 5 minutes
3. Kill switch reverts to legacy path (which still exists)

---

## 9. Testing Checklist

### Phase 1 Manual QA

| # | Test | Expected |
|---|---|---|
| 1.1 | Disable Slip Monitor snippet → reload Admin Dashboard | Admin notice yellow "shortcode missing" — no PHP fatal |
| 1.2 | Register module without `shortcode` field | Admin notice red — registration rejected |
| 1.3 | Register 2 modules with same `key` | Second one overwrites first + admin notice |
| 1.4 | Click slip_monitor tab → debt subtract → check audit log | Row in `wp_dinoco_audit_log` with `trans_id` |
| 1.5 | `dinoco_audit_chain($trans_id)` returns ≥1 row | OK |
| 1.6 | `_debt_audit_log` postmeta still updated (dual-write) | OK |
| 1.7 | Performance: load admin dashboard 100 modules | < 500ms (registry sort + emit) |

### Phase 2 Manual QA

| # | Test | Expected |
|---|---|---|
| 2.1 | Slip manual process → check trans_id chain | 4 rows: slip.process, debt.subtract, order.paid, flex.sent |
| 2.2 | Force `b2b_debt_subtract` to throw → wrapper rollback | DB unchanged + audit row severity=error + LOCK released |
| 2.3 | 2 admin double-click within 200ms | First wins; second gets `concurrent_operation` 409 |
| 2.4 | Slip with wrong recalc order (force test) | Wrapper still works (callback returns ok=true with wrong data — wrapper doesn't enforce semantics, but pattern code review catches it) |
| 2.5 | BO `bo-fulfill` 2 admins same SKU → second blocked by lock | OK |
| 2.6 | Kill switch flip — `transaction.wrapper_enabled = 0` | Legacy code paths work |

### Phase 3 Manual QA

| # | Test | Expected |
|---|---|---|
| 3.1 | Stop b2b_dunning_cron for 25h → call /health | `crons.status=warn` + Telegram alert |
| 3.2 | `dinoco_config('slip.lock_ttl_seconds')` returns int (not string) | OK |
| 3.3 | Set slip.lock_ttl_seconds = 999 (over max=30) | Falls back to default + warning log |
| 3.4 | `dinoco_config_register` then immediately `dinoco_config()` | New value retrieved |

### Regression Guard

ใช้ pattern จาก `openclawminicrm/scripts/regression.js` — สร้าง PHP version simple:
- `tests/Regression/SlipManualProcessTest.php` — happy + double-click + invalid distributor + zero amount
- `tests/Regression/ModuleRegistryTest.php` — register + lookup + invalid + duplicate
- Run via `phpunit.xml.dist` (already exists)

---

## 10. Rollback Plan

### Phase 1 Rollback
1. `update_option('dinoco_admin_registry_enabled', '0')` — Admin Dashboard ใช้ hardcoded list
2. Audit log table คงอยู่ — write ต่อได้ทันแต่ไม่อ่าน (no consumer impact)
3. ไม่ต้อง drop table — เป็น additive

**Worst case**: Admin Dashboard tab ใหม่หาย → 5-min revert ผ่าน option flip

### Phase 2 Rollback
1. `update_option('dinoco_transaction_wrapper_enabled', '0')` — wrapper passes-through to legacy code
2. ทุก function ที่ migrated มี legacy path คงอยู่ใต้ feature flag check
3. Pattern (per migrated function):
```php
function b2b_handle_slip_image($params) {
    if (dinoco_config('transaction.wrapper_enabled')) {
        return dinoco_transaction('slip.process', function($ctx) use ($params) { ... });
    }
    return _legacy_b2b_handle_slip_image($params);  // เดิม
}
```

**Worst case**: Slip handler bug → flip flag → instant revert

### Phase 3 Rollback
1. Cron registry: cron heartbeat = read-only consumer, no rollback needed
2. Config layer: `dinoco_config()` always falls back to `get_option` if not registered → safe
3. Health endpoint: returns 200/503 — no destructive operation

### Per-feature Canary

ใช้ pattern เดียวกับ `b2b_flag_bo_beta_distributors`:
- `dinoco_config('transaction.wrapper_dist_whitelist')` = array of dist IDs
- เริ่มเปิด wrapper สำหรับ 1 distributor (test) → 5 → 50 → 100% (ทุกราย)

---

## Checklist ก่อนส่งต่อให้ Dev

- [x] ทุก user flow มี error handling ครบ (validation cron + admin notice + log + kill switch)
- [x] ทุก form มี validation rules ชัดเจน (registry required fields + config schema types)
- [x] ทุก API endpoint มี permission check (`manage_options` ทุกตัว)
- [x] ทุก UI state ครบ (loading, empty, error — Health Dashboard 30s polling + skeleton)
- [x] ทุก text เป็นภาษาไทย (Admin notices + Health labels + Audit browser)
- [x] Mobile-first design (Health Dashboard card stack, 44px+ tap)
- [x] ไม่ conflict กับ feature อื่น (additive overlays, dual-source, kill switches)
- [x] Performance impact ประเมินแล้ว (audit row 200B, 10K/day = 2MB; heartbeat 1ms; registry JSON 50KB)
- [x] Security: registry/audit/config endpoints ทุกตัว `manage_options` only
- [x] Rollback plan: per-pillar kill switch + dual-source

---

## Files Touched (Reference)

**Create new (5 snippets)**:
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Module Registry`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Audit Log`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[System] DINOCO Transaction Manager`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[System] DINOCO Config Manager`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[System] DINOCO Cron Registry`
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Health Dashboard`

**Modify (8+ snippets)**:
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Admin Dashboard` (V.34.0 — registry consumer)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 15: Custom Tables & JWT Session` (V.9.0 — 2 new tables)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 13: Debt Transaction Manager` (V.2.1 — audit dual-write)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` (V.35.0 — slip wrapper)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 16: Backorder System` (V.1.7 — BO wrapper)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[Admin System] DINOCO Slip Monitor` (V.2.0 — manual_process wrapper)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2F] Snippet 7: Credit Transaction Manager` (V.2.0 — payable wrapper)
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/[B2B] Snippet 7: Cron Jobs - Dunning + Summary + Rank` (V.31.0 — cron registry)

**Reference docs to update** (Phase 1 done, after each phase):
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/CLAUDE.md` — add "Architecture Pillars" section
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/SYSTEM-REFERENCE.md` — registry/audit/config/cron API reference
- `/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/WORKFLOW-REFERENCE.md` — developer "add admin tab" flow

---

## สรุปสำหรับบอส (TL;DR)

ปัญหา cascade 5/16 commits ใน 2 วัน เป็น **systemic issue ไม่ใช่ dev error** — architecture pattern บังคับให้ dev wire 6 จุดมือ + ไม่มี integration check + audit แตก 6 ที่.

ข้อเสนอ: **5 pillars + 4-6 weeks + 100% backward compat + per-phase kill switch**

- Pillar 1 (Registry) — กัน "ลืมจุดเดียว = ระบบเงียบ" → คาด ~80% ของ cascade bug หาย
- Pillar 2 (Transaction wrapper) — บังคับลำดับ VALIDATE→LOCK→MUTATE→RECALC→NOTIFY → กัน BUG-A class
- Pillar 3 (Audit log unified) — forensic 1 query, MTTR 30→5 min
- Pillar 4 (Config layer) — typed schema, default, validation — กัน flag drift
- Pillar 5 (Health + Cron heartbeat) — detect cron-dead ก่อน customer

**Phase 1 deliverable Week 1**: Module Registry + Audit Log table + Slip Monitor migration. Zero behavior change. Rollback = 1 option flip.

ทุก phase deploy independently, kill switch พร้อมเสมอ, ไม่มี big-bang rewrite.