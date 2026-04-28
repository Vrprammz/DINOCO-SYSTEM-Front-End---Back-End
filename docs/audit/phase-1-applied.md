# Phase 1 — Module Registry + Audit Log (Applied)

**Date**: 2026-04-24
**Author**: Full Stack Developer (Phase 1 implementation)
**Spec**: `docs/BACKEND-ARCHITECTURE-REFACTOR-PLAN.md` Pillars 1 + 3
**Round 2 baseline**: f24c89f (29/37 findings applied)

## Goals

Close the cascade-bug class (V.33.0 → V.33.3 cost 4 commits in 2 days) by:
1. **Pillar 1 — Module Registry** — single `dinoco_register_admin_module([...])` call replaces 5-place wiring
2. **Pillar 3 — Unified Audit Log** — single `dinoco_audit_log()` call writes to `wp_dinoco_audit_log` for cross-system forensic chain (current pain: 6 audit sources, 30-min forensic queries)

## Deliverables

| Component | File | Status |
|-----------|------|--------|
| Module Registry helper API | NEW `[Admin System] DINOCO Module Registry` V.1.0 | ✅ Created |
| Audit Log helper API | NEW `[Admin System] DINOCO Audit Log` V.1.0 | ✅ Created |
| `wp_dinoco_audit_log` table | `[B2B] Snippet 15` V.8.8 → V.8.9 | ✅ Schema added |
| Admin Dashboard registry consumer | `[Admin System] DINOCO Admin Dashboard` V.33.4 → V.33.5 | ✅ Merge wired |
| Implementation report | `docs/audit/phase-1-applied.md` | ✅ This file |

All 4 PHP files pass `php -l` syntax check.

## Code Structure Decisions

### Decision 1 — Two new snippets vs. inline into Snippet 1

Chose **two separate snippets** (Module Registry + Audit Log).

Rationale:
- Snippet 1 already 8,012 LOC with 13+ version annotations — appending 600 LOC erodes readability
- Mirrors existing pattern: Modal Helpers + Observability + GDPR are standalone snippets
- Concern isolation — Module Registry is admin-only, Audit Log writes touch every mutation path. Separate snippets simplify selective rollback (disable one without the other).
- DB_ID assignment is per-snippet — easier to track in GitHub Webhook Sync engine

### Decision 2 — In-memory registry vs. wp_options persistence

Chose **in-memory** (`$GLOBALS['_dinoco_admin_modules']`).

Rationale:
- WP Code Snippets evaluates every request — registration is cheap (microseconds)
- Persistence in `wp_options` would lose `registered_by` snippet provenance when a snippet is disabled (we want orphans to disappear from sidebar, not stay as ghosts)
- Single source of truth = the snippet's `add_action('init', register...)` call. Disabling a snippet → no registration → no module
- Validator (`admin_init`) catches typos + missing shortcodes via `shortcode_exists()` check

### Decision 3 — Backward compat: registry MERGE, not REPLACE

Admin Dashboard V.33.5 keeps the existing 19 hardcoded entries in `$module_map` / `$cacheable_modules` / `$modules[]` / `TAB_LABELS`. Registry-sourced entries are appended/merged. Registry **wins** on key conflict — allows Phase 4 migration to override one-by-one without big-bang rewrite.

### Decision 4 — Audit Log is INDEX overlay, not replacement

`wp_dinoco_audit_log` exists alongside `wp_dinoco_slip_log`, `wp_dinoco_stock_transactions`, `wp_dinoco_flash_audit`, `_debt_audit_log` postmeta. No legacy audit removed.

Rationale:
- Existing audit queries (Admin Slip Monitor, Stock Transaction list) keep working
- Phase 1.5 adds dual-write at mutation points (`b2b_debt_subtract`, `dinoco_stock_*`, etc.)
- Phase 4 (~2-4 weeks observation) decides which legacy sources can be retired
- Forensic gain is immediate via `dinoco_audit_chain($target_type, $target_id)` once Phase 1.5 wires call sites

## Wiring Points (Module Registry)

The 5 cascade-prone wiring points in Admin Dashboard:

| # | Wiring point | V.33.5 status |
|---|---|---|
| 1 | nav-item HTML in sidebar | **DEFERRED** to Phase 4 (requires nav HTML refactor) |
| 2 | `$module_map` shortcode mapping | ✅ Merged via `dinoco_get_registered_modules()` |
| 3 | `$cacheable_modules` TTL | ✅ Merged (registry `cache_ttl` field) |
| 4 | `$modules[]` placeholder div array | ✅ Appended (skips already-hardcoded keys + `hidden` flag) |
| 5 | `TAB_LABELS` JS object | ✅ `Object.assign(TAB_LABELS, {...})` injection after literal |

#1 (nav-item HTML) is the only point still requiring manual sidebar markup. Documented as known limitation. Phase 4 will refactor sidebar to render from registry directly.

## Public API Surface

### Module Registry (`dinoco_register_admin_module`)

```php
dinoco_register_admin_module( array(
    'key'         => 'slip_monitor',          // required, ^[a-z0-9_]+$
    'shortcode'   => 'dinoco_slip_monitor',   // required, no brackets
    'label'       => 'Slip Monitor',          // required
    'section'     => 'b2b',                   // required: b2b|b2f|inventory|finance|ai|system|dashboard
    'icon'        => 'fa-receipt',            // optional
    'color'       => '#06b6d4',               // optional
    'cache_ttl'   => 30,                      // optional (default 0 = no cache)
    'subtabs'     => array(),                 // optional
    'hidden'      => false,                   // optional (still URL-routable but not in $modules placeholder loop)
    'capability'  => 'manage_options',        // optional
    'order'       => 50,                      // optional within section
    'source'      => '[Admin System] DINOCO Slip Monitor V.1.6',  // optional, for debug provenance
) );
```

Returns `true` or `WP_Error`. Validation rules:
- Required field missing → admin notice red banner + error_log
- Invalid key/shortcode pattern → reject
- Invalid section → reject
- Duplicate key → first-wins + admin notice (prevent silent override)

### Audit Log (`dinoco_audit_log`)

```php
dinoco_audit_log( array(
    'event_type'     => 'debt_subtract',           // required
    'actor_type'     => 'admin',                   // optional (auto-detect)
    'actor_id'       => '5',                       // optional (auto-fill from get_current_user_id)
    'target_type'    => 'distributor',
    'target_id'      => '1234',
    'amount'         => 2280.00,
    'delta_before'   => '5000',
    'delta_after'    => '2720',
    'related_log_id' => 5234,                      // FK to slip_log/stock_txn
    'context'        => array( 'reason' => 'manual_admin_slip', 'trans_ref' => 'CNX-A24-...' ),
    'request_id'     => 'auto-fill',               // auto via dinoco_obs_get_request_id()
) );
```

Returns insert ID or `false`. **Non-throwing** — always best-effort; callers should not branch on result.

PII auto-redaction via `dinoco_obs_redact_context()` (Observability snippet) or built-in fallback (phone/email/line_uid/token/secret/key/password/authorization → `[REDACTED]`).

### Forensic Queries

```php
// All events for a target
dinoco_audit_chain( 'order', '6266' );  // returns array<row>

// All events sharing a request_id (cross-service trace)
dinoco_audit_chain_by_request( 'a3f2b9c8d1e4f5a6' );
```

REST endpoints (admin only):
- `GET /wp-json/dinoco/v1/admin-modules` — registry inspector
- `GET /wp-json/dinoco/v1/audit/chain?target_type=order&target_id=6266`
- `GET /wp-json/dinoco/v1/audit/request?request_id=...`

## Database Schema

`wp_dinoco_audit_log` (Snippet 15 V.8.9):

```sql
CREATE TABLE wp_dinoco_audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_type VARCHAR(64) NOT NULL DEFAULT '',
    actor_type VARCHAR(32) NOT NULL DEFAULT '',
    actor_id VARCHAR(64) NOT NULL DEFAULT '',
    target_type VARCHAR(32) NOT NULL DEFAULT '',
    target_id VARCHAR(64) NOT NULL DEFAULT '',
    amount DECIMAL(14,2) DEFAULT NULL,
    delta_before VARCHAR(255) DEFAULT NULL,
    delta_after VARCHAR(255) DEFAULT NULL,
    related_log_id BIGINT UNSIGNED DEFAULT NULL,
    context_json TEXT DEFAULT NULL,
    error_msg VARCHAR(500) DEFAULT NULL,
    success TINYINT(1) NOT NULL DEFAULT 1,
    request_id VARCHAR(64) NOT NULL DEFAULT '',
    ip VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_event_created (event_type, created_at),
    KEY idx_target (target_type, target_id, created_at),
    KEY idx_actor (actor_type, actor_id, created_at),
    KEY idx_related (related_log_id),
    KEY idx_request (request_id),
    KEY idx_created (created_at)
);
```

DB version bumped 8.6 → 8.9. Idempotent (dbDelta + INFORMATION_SCHEMA index probe). Re-run safe.

## Migration Path for Existing 19 Modules (Phase 4)

Phase 1 leaves all 19 hardcoded modules in place. Migration template per module:

```php
// Add to the source snippet of the module (e.g. [Admin System] DINOCO Slip Monitor):
add_action( 'init', function() {
    if ( ! function_exists( 'dinoco_register_admin_module' ) ) return;
    dinoco_register_admin_module( array(
        'key'        => 'slip_monitor',
        'shortcode'  => 'dinoco_slip_monitor',
        'label'      => 'Slip Monitor',
        'section'    => 'b2b',
        'icon'       => 'fa-receipt',
        'cache_ttl'  => 30,
        'order'      => 50,
        'source'     => '[Admin System] DINOCO Slip Monitor V.1.x',
    ) );
}, 20 );

// Then remove from Admin Dashboard $module_map / $cacheable_modules / $modules[] / TAB_LABELS.
// Registry-merge step will pick up the registered values automatically.
```

Migration order recommended (low risk first):
1. `slip_monitor` (newest, smallest blast radius)
2. `ai_control` (orphan H12 — already validates registry coverage)
3. `bo_security_log`, `bo_flags`, `backorders`
4. B2F tabs (`b2f_orders`, `b2f_makers`, `b2f_credit`)
5. Inventory/Claims/Users/Finance/Invoice
6. Last: `b2b_dnc`, `b2b_admin`, `dashboard`

After all migrated, Admin Dashboard V.34.x can drop the hardcoded arrays entirely.

## Test Scenarios

### T1 — Existing 19 modules unchanged
1. Reload Admin Dashboard with no registry calls active
2. Click each of 19 sidebar tabs
3. **Expect**: all tabs load identically to pre-V.33.5

### T2 — Register a fake module
```php
add_action('init', function() {
    dinoco_register_admin_module(array(
        'key' => 'phase1_test',
        'shortcode' => 'dinoco_phase1_test',
        'label' => 'Phase 1 Test',
        'section' => 'system',
        'order' => 999,
    ));
}, 20);
```
- **Expect** `<div id="tab-wrapper-phase1_test">` rendered + appears in `TAB_LABELS` JS object + `admin_notice` warning "shortcode `[dinoco_phase1_test]` not registered" (orphan detection)

### T3 — Validation reject
```php
dinoco_register_admin_module(array('key' => 'bad-key', 'shortcode' => '...'));
```
- **Expect**: returns WP_Error + admin notice "missing_required_field:label, missing_required_field:section, invalid_key_format"

### T4 — Audit log basic write
```php
$id = dinoco_audit_log(array(
    'event_type' => 'phase1_test',
    'target_type' => 'distributor',
    'target_id' => '1',
    'amount' => 100,
    'context' => array('test' => true, 'phone' => '0812345678'),
));
```
- **Expect**: positive int returned + row in `wp_dinoco_audit_log` + `context_json` shows `phone: [REDACTED]` (PII mask)

### T5 — Audit chain query
```php
dinoco_audit_log(['event_type' => 'a', 'target_type' => 'x', 'target_id' => '1']);
dinoco_audit_log(['event_type' => 'b', 'target_type' => 'x', 'target_id' => '1']);
$rows = dinoco_audit_chain('x', '1');
```
- **Expect**: `count($rows) === 2` ordered by `id ASC`

### T6 — Request correlation
- Make 2 audit_log calls within same HTTP request
- **Expect**: both rows share same `request_id` (auto-filled from `dinoco_obs_get_request_id()`)

### T7 — Rollback
- Disable `[Admin System] DINOCO Module Registry` snippet
- **Expect**: Admin Dashboard still loads + 19 hardcoded modules still work + new modules disappear (graceful degrade)

## Rollback Procedure

### Soft rollback (Module Registry only)
1. WP Admin → Snippets → disable `[Admin System] DINOCO Module Registry`
2. `dinoco_get_registered_modules()` returns empty → Admin Dashboard merge step is no-op
3. Hardcoded 19 modules continue working

### Soft rollback (Audit Log only)
1. Disable `[Admin System] DINOCO Audit Log` snippet
2. Future `dinoco_audit_log()` calls fail `function_exists` guard → silent skip
3. Existing audit sources (slip_log, debt postmeta etc.) unaffected
4. Table retained — no data loss

### Hard rollback (full Phase 1)
1. Disable both snippets
2. Revert Admin Dashboard to V.33.4 (revert commit)
3. Revert Snippet 15 to V.8.8 (table CREATE is idempotent — keeping table is harmless; DROP requires manual SQL)

### Worst-case (database)
- `wp_dinoco_audit_log` table lives even after snippets disabled — can be safely DROPPED via:
  ```sql
  DROP TABLE wp_dinoco_audit_log;
  DELETE FROM wp_options WHERE option_name = '_dinoco_catalog_table_version';
  -- Snippet 15 will recreate baseline tables on next init
  ```
- `wp_options` left untouched — no orphan options created

## Constraints Honored

- ✅ Round 2 audit fixes preserved (commits 780e9c0, c791930, e9cf0ab, f24c89f)
- ✅ Atomic boundary fixes intact (no edits to debt/credit/stock helpers)
- ✅ Slip pipeline untouched (recently refactored)
- ✅ Existing 19 admin modules byte-identical wiring
- ✅ No `<?php` tag in snippet files
- ✅ All helpers wrapped in `function_exists()` guard
- ✅ Backward compat 100% — disabling either snippet leaves system fully functional

## Known Limitations / Phase 4 Work

1. **nav-item HTML still hardcoded** — registry doesn't auto-render sidebar links yet. Phase 4 must refactor sidebar to loop over `dinoco_get_registered_modules()` and emit `<a class="nav-item" data-tab="...">` markup.
2. **No automatic dual-write yet** — Phase 1 ships table + helper only. Phase 1.5 (next sprint) adds `dinoco_audit_log()` calls inside `b2b_debt_add/subtract`, `dinoco_stock_add/subtract`, `b2f_payable_add/subtract`, FSM transitions, slip apply, manual process tool.
3. **No 365-day TTL cleanup cron yet** — table will grow unbounded until Phase 3 cron registry ships. At ~10K writes/day × ~200 bytes = ~2MB/day = ~700MB/year. Acceptable for Phase 1 observation.
4. **No admin browser UI yet** — REST endpoints exist (`/dinoco/v1/audit/chain`) but no shortcode for visual log browser. Phase 5 adds `[dinoco_admin_audit_log]`.

## Files Modified

```
NEW  [Admin System] DINOCO Module Registry          (V.1.0, 360 LOC)
NEW  [Admin System] DINOCO Audit Log                (V.1.0, 380 LOC)
MOD  [B2B] Snippet 15: Custom Tables & JWT Session  (V.8.8 → V.8.9, +60 LOC)
MOD  [Admin System] DINOCO Admin Dashboard          (V.33.4 → V.33.5, +50 LOC)
NEW  docs/audit/phase-1-applied.md                  (this file)
```

Total: 2 new files, 2 modified, ~850 LOC added (mostly comments + validation).

## Verification

```bash
# Lint all 4 PHP files
for f in \
  "[Admin System] DINOCO Module Registry" \
  "[Admin System] DINOCO Audit Log" \
  "[B2B] Snippet 15: Custom Tables & JWT Session" \
  "[Admin System] DINOCO Admin Dashboard"; do
  (echo '<?php'; cat "$f") | php -l
done
# All: "No syntax errors detected"
```

Per Phase 1 architect spec: estimated 10-15 hours, MVP delivered ~2.5 hours.
