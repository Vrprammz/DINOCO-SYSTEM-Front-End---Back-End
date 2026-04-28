# Phase 4c — Selective `get_option` → `dinoco_config()` Migration

**Date**: 2026-04-24
**Author**: Full Stack Developer (Phase 4c implementation)
**Phase 3 baseline**: `2a5a466` (Config Layer V.1.0 + Health Monitor V.1.0)
**Phase 4c parent**: `docs/BACKEND-ARCHITECTURE-REFACTOR-PLAN.md` Pillar 4

## Goals

Migrate the highest-value subset of scattered `get_option('b2b_flag_*' / 'dinoco_*' / 'b2f_flag_*')` flag-read sites to the typed Config Layer registered in Phase 3. Per the spec, "selective ~30-40 sites" — not the full 132 — focus on:

1. Feature flags (admin-toggleable on/off)
2. Operational thresholds (rate limits, TTLs, batch sizes)
3. Migration phase flags (B2F, BO, slip features)

**Non-goals** (deferred):

- Internal state options (`_dinoco_cron_*_last_run`, etc — not user config)
- Transient-like options
- One-time install markers
- **Write sites** (`update_option`) — Config Layer's `legacy_option` mapping makes raw writes still work; migrating writes is out of scope per Phase 4c rules
- FSM files (Phase 4d parallel work)
- Admin Dashboard hardcoded module arrays (Phase 5 scope)
- Walk-in bank `B2B_WALKIN_BANK_*` (PHP constants, not wp_options)

## Deliverables

| Component | File | Status |
|-----------|------|--------|
| New config registrations (~20 keys) | `[Admin System] DINOCO Config Layer` V.1.1 → **V.1.2** | ✅ |
| Read-site migration (≈25 sites across 11 files) | various snippets (table below) | ✅ |
| PHP `php -l` syntax pass per file | all touched files | ✅ |
| Implementation report | `docs/audit/phase-4c-applied.md` | ✅ this file |

## Configs Registered in V.1.2

All registrations use `legacy_option` mapping → backward compat 100%. Raw `get_option('legacy_key')` callers continue to read the same wp_option row.

### Slip system (2 new)

| Dotted key | Type | Default | Legacy option |
|---|---|---|---|
| `slip.replay_pool_enabled` | bool | true | `b2b_slip_replay_pool_enabled` |
| `slip.prefilter_enabled` | bool | true | `b2b_slip_prefilter_enabled` |

### BO system (15 new — covers `b2b_bo_get_config()` central wrapper)

| Dotted key | Type | Default | Legacy option |
|---|---|---|---|
| `bo.beta_distributors` | array | [] | `b2b_flag_bo_beta_distributors` |
| `bo.max_qty_per_item` | int | 500 | `b2b_bo_max_qty_per_item` |
| `bo.max_items_per_order` | int | 50 | `b2b_bo_max_items_per_order` |
| `bo.rate_place_per_hour` | int | 10 | `b2b_bo_rate_place_per_hour` |
| `bo.rate_place_per_day` | int | 50 | `b2b_bo_rate_place_per_day` |
| `bo.rate_cancel_per_hour` | int | 2 | `b2b_bo_rate_cancel_per_hour` |
| `bo.rate_cancel_per_day` | int | 10 | `b2b_bo_rate_cancel_per_day` |
| `bo.daily_unique_sku_cap` | int | 20 | `b2b_bo_daily_unique_sku_cap` |
| `bo.pending_review_timeout_hours` | int | 72 | `b2b_bo_pending_review_timeout_hours` |
| `bo.split_undo_window_minutes` | int | 10 | `b2b_bo_split_undo_window_minutes` |
| `bo.eta_default_days` | int | 7 | `b2b_bo_eta_default_days` |
| `bo.eta_warn_days` | int | 14 | `b2b_bo_eta_warn_days` |
| `bo.cancel_grace_minutes` | int | 5 | `b2b_bo_cancel_grace_minutes` |
| `bo.anomaly_cancel_24h` | int | 5 | `b2b_bo_anomaly_cancel_24h` |
| `bo.anomaly_qty_cap_24h` | int | 3 | `b2b_bo_anomaly_qty_cap_24h` |
| `bo.tier_value_caps` | array | (5 tiers) | `b2b_bo_tier_value_caps` |

### B2F system (3 new)

| Dotted key | Type | Default | Legacy option |
|---|---|---|---|
| `b2f.flag_v11_explicit_mode` | bool | false | `b2f_flag_v11_explicit_mode` |
| `b2f.flag_order_intent` | bool | false | `b2f_flag_order_intent` |
| `b2f.flag_auto_sync_sets` | bool | false | `b2f_flag_auto_sync_sets` |

### Observability (1 new)

| Dotted key | Type | Default | Legacy option |
|---|---|---|---|
| `observability.structured_log` | bool | false | `dinoco_obs_structured_log` |

**Phase 3 already registered** (re-used by V.1.2 migration sites): `slip.lock_ttl_seconds`, `slip.ai_classifier_enabled`, `slip.ai_classifier_min_confidence`, `bo.flag_enabled`, `bo.daily_qty_per_sku`, `inventory.oos_gate_hierarchy_compute`, `inventory.auto_unlock_enabled`, `inventory.shipping_meta_enabled`, `b2f.flag_shadow_write`, `b2f.flag_read_from_junction`, `b2f.flag_coverage_autosync`, `observability.sentry_enabled`, `observability.correlation_enabled`, `gdpr.enabled`, `system.timezone`.

**Total registered configs**: 13 (V.1.0) + 2 (V.1.1) + 21 (V.1.2) = **36 keys**.

## Read-Site Migrations

Pattern used everywhere:

```php
$val = function_exists( 'dinoco_config' )
    ? (bool|int|array) dinoco_config( 'namespace.key', $default )
    : (bool|int|array) get_option( 'legacy_key', $default );
```

| File | Old version | New version | Sites migrated | Notes |
|------|---|---|---|---|
| `[Admin System] DINOCO Config Layer` | V.1.1 | **V.1.2** | — (registry update) | +21 config registrations |
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | V.34.18 | **V.34.19** | 6 | OOS gate hierarchy compute (×1) + shipping_meta_enabled (×5: cron #1, auto-rollback cron, snapshot hook, dispatcher, secondary BO) |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | V.34.16 | **V.34.17** | 3 | slip.replay_pool_enabled, slip.prefilter_enabled, slip.ai_classifier_enabled |
| `[B2B] Snippet 3: LIFF E-Catalog REST API` | V.42.5 | **V.42.6** | 1 | manual-ship D-12 articleCategory gate |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | V.8.13 | **V.8.14** | 2 | inventory.auto_unlock_enabled (cascade) + shipping_meta_enabled snapshot record. Init-time default seed (line 3771) kept raw — runs at `init` priority 7 before Config Layer schema (priority 25) is loaded. |
| `[B2B] Snippet 16: Backorder System` | V.2.5 | **V.2.6** | 5 + central wrapper | `b2b_bo_flag_enabled()` (master + beta list), admin shortcode flag check, hotfix oos check, beta_distributors display. **`b2b_bo_get_config()` wrapper now delegates to `dinoco_config` for 16 BO keys** when registered → all `b2b_bo_get_config()` callsites get Config Layer benefits transitively. |
| `[Admin System] DINOCO Slip Monitor` | V.1.10 | **V.1.11** | 1 | AI classifier check in `/ai-classifier-stats`. Toggle endpoint write site (line 1417) kept raw for atomicity with update_option. |
| `[Admin System] B2F Migration Audit` | V.3.17 | **V.3.18** | 3 | flag toggle dependency chain validators (shadow_write check, v11 → order_intent gate, order_intent → v11 OFF gate) |
| `[B2F] Snippet 8: Admin LIFF E-Catalog` | V.7.8 | **V.7.9** | 1 | shortcode boot V.7.0 feature gate (`$b2f_order_intent` JS flag) |
| `[B2F] Snippet 0.5: Maker Product Dual-Write` | V.1.8 | **V.1.9** | 1 | coverage auto-sync flag — 3-layer fallback (b2f_is_flag_enabled → dinoco_config → raw) |
| `[Admin System] DINOCO Global Inventory Database` | V.44.7 | **V.44.8** | 2 | shipping coverage REST + GET /shipping-defaults `flag_enabled` field. POST /shipping-defaults flag toggle (line 3800) kept raw (write site). |
| `[Admin System] Flash Shipping V.42 Go-Live Tool` | V.1.7 | **V.1.8** | 2 | preflight check #8 + monitor endpoint. POST /flip-flag handler (line 806) kept raw (write site). |
| `[System] DINOCO GDPR Data Requests` | V.1.2 | **V.1.3** | 1 | `dinoco_gdpr_is_enabled()` — single helper used by all 3 endpoints |

**Total read sites migrated**: ~28 across 12 files.

## Read Sites Deferred (with rationale)

| Site | File:line | Rationale |
|------|-----------|-----------|
| Schema init seed | `[B2B] Snippet 15:3771` | One-shot install detect at `init` priority 7 — runs **before** Config Layer schema (priority 25) is loaded, so `dinoco_config()` may not yet recognize the key. Raw `get_option('dinoco_shipping_meta_enabled', null)` is the correct sentinel. |
| Slip Monitor toggle endpoint | `[Admin System] DINOCO Slip Monitor:1417` | Read-then-write atomicity — within same `update_option` block. Migrating only the read half changes nothing functionally and risks subtle bugs if Config Layer caches stale value. |
| Inventory POST /shipping-defaults | `[Admin System] DINOCO Global Inventory Database:3800` | Same as above — read for diff calc before write. |
| Flash Go-Live POST /flip-flag | `[Admin System] Flash Shipping V.42 Go-Live Tool:806` | Same — read-then-write. |
| Snippet 16 beta list write | `[B2B] Snippet 16:4090` | Same — read for log diff before update_option. |
| Snippet 1 `dinoco_set_shipping_flag()` | `[B2B] Snippet 1:7625` | Write helper that reads old value to detect no-change → return early. Atomic with subsequent `update_option`. |
| Observability self-reads | `[Admin System] DINOCO Observability:54-58` | Snippet's own `dinoco_obs_is_enabled()` helper — concept-of-operations gates the snippet itself; no external callsite reads these directly. Self-contained. |

**Phase 4c specific intentional skips** (already-good patterns):

- B2F Snippet 0.5 prefers existing `b2f_is_flag_enabled()` helper before falling back to Config Layer — this is the correct order (B2F-specific helpers do whitelist enforcement + audit logging that raw `dinoco_config` doesn't replicate).
- Snippet 16 `b2b_bo_get_config()` wrapper migration is more valuable than per-callsite migration — every `b2b_bo_get_config('b2b_bo_max_qty_per_item')` call now flows through Config Layer transparently when registered.

## Behavior Verification

1. **Type coercion**: `dinoco_config('bo.flag_enabled')` returns native `bool true/false`; legacy raw `get_option('b2b_flag_bo_system')` returns string `'1'/'0'` or false. Migration callsites cast `(bool)` defensively → identical truthy/falsy outcomes.
2. **Default fidelity**: All 21 new registrations chosen to match the existing in-code default exactly:
   - BO config: matches `$defaults` array in `b2b_bo_get_config()` line 192-217
   - Slip: matches `1` (true) defaults at Snippet 2 V.34.16 read sites
   - B2F V.7.0: matches `false` defaults documented in CLAUDE.md "all flags OFF default"
3. **Cache layer**: `dinoco_config()` per-request cache → first read populates `$GLOBALS['_dinoco_config_cache']`, subsequent reads in same request hit cache. For request-scoped flag reads (e.g. snapshot hook fires once per order status change) → ≈1ms saved per repeat. For boot-time reads (Snippet 8 shortcode) → no observable difference.
4. **Audit trail**: When admin toggles flag via Config Viewer UI (`[dinoco_admin_config_viewer]`), `dinoco_config_set()` writes to `wp_dinoco_audit_log` with `event_type='config_change'`, `target_id=<dotted_key>`, before/after values. Direct `update_option()` writes (admin Inventory toggle, Flash Go-Live flip, etc) do NOT auto-audit unless those handlers explicitly insert audit rows (most already do).

## Test Plan (manual)

1. **Read parity**: `dinoco_config('bo.flag_enabled')` returns same value as `get_option('b2b_flag_bo_system')` — verify in both ON and OFF states.
2. **Toggle from Config Viewer**: Open `[dinoco_admin_config_viewer]` → flip `slip.replay_pool_enabled` to OFF → next slip image upload skips replay pool dedup logic AND raw `get_option('b2b_slip_replay_pool_enabled')` reads `'0'` (single source of truth via legacy_option).
3. **Toggle from existing UI**: Toggle `dinoco_shipping_meta_enabled` via Flash Go-Live POST /flip-flag → reload Config Viewer → `inventory.shipping_meta_enabled` row reflects new value (proves `legacy_option` round-trip).
4. **Disable Config Layer snippet**: Disable via WP Code Snippets UI → all migrated callsites fall back to raw `get_option()` → no fatals, no behavior change.
5. **BO wrapper transitively migrated**: `b2b_bo_get_config('b2b_bo_max_qty_per_item')` returns same value whether reached through Config Layer or raw `get_option` (single underlying option key).
6. **Audit log row appears**: After Config Viewer save, `SELECT * FROM wp_dinoco_audit_log WHERE event_type='config_change' ORDER BY id DESC LIMIT 1;` shows the change.

## Backward Compatibility

| Risk | Mitigation |
|------|-----------|
| Config Layer snippet disabled at runtime | All 28 callsites use `function_exists('dinoco_config')` guard → fall back to raw `get_option('legacy_key')`. Behavior identical. |
| Schema not yet registered (init priority race) | `dinoco_config()` for unregistered key → raw passthrough. Defaults still come from migration callsite's `$default` arg. |
| Type mismatch (legacy stores `'0'`/`'1'` strings, schema declares bool) | `dinoco_config_coerce()` handles `'0'/'1'/'true'/'false'/0/1/true/false` uniformly → bool out. |
| Read-then-write atomicity | Write sites intentionally NOT migrated → read of own value before update_option remains race-free. |

**Rollback**: Disable `[Admin System] DINOCO Config Layer` snippet in WP Code Snippets UI. Zero side effects on existing data; legacy options unaffected. All callers fall through to raw `get_option`.

## Files Touched

| File | Type |
|------|------|
| `[Admin System] DINOCO Config Layer` | EDIT (V.1.1 → V.1.2 + 21 new registrations) |
| `[B2B] Snippet 1: Core Utilities & LINE Flex Builders` | EDIT (V.34.18 → V.34.19, 6 read sites) |
| `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator` | EDIT (V.34.16 → V.34.17, 3 read sites) |
| `[B2B] Snippet 3: LIFF E-Catalog REST API` | EDIT (V.42.5 → V.42.6, 1 read site) |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | EDIT (V.8.13 → V.8.14, 2 read sites) |
| `[B2B] Snippet 16: Backorder System` | EDIT (V.2.5 → V.2.6, 5 read sites + `b2b_bo_get_config` wrapper delegation) |
| `[Admin System] DINOCO Slip Monitor` | EDIT (V.1.10 → V.1.11, 1 read site) |
| `[Admin System] B2F Migration Audit` | EDIT (V.3.17 → V.3.18, 3 read sites) |
| `[B2F] Snippet 8: Admin LIFF E-Catalog` | EDIT (V.7.8 → V.7.9, 1 read site) |
| `[B2F] Snippet 0.5: Maker Product Dual-Write` | EDIT (V.1.8 → V.1.9, 1 read site) |
| `[Admin System] DINOCO Global Inventory Database` | EDIT (V.44.7 → V.44.8, 2 read sites) |
| `[Admin System] Flash Shipping V.42 Go-Live Tool` | EDIT (V.1.7 → V.1.8, 2 read sites) |
| `[System] DINOCO GDPR Data Requests` | EDIT (V.1.2 → V.1.3, 1 read site) |
| `docs/audit/phase-4c-applied.md` | NEW (this file) |

**13 PHP files edited + 1 doc**, all PHP lint pass via `php -l` after virtual `<?php` prefix.

## Phase 4 Follow-ups (out of scope)

1. **Phase 4d**: FSM file migration (Snippet 14, B2F Snippet 6) — separate parallel work, no `get_option` flag overlap with 4c.
2. **Phase 5**: Admin Dashboard hardcoded module-array migration to Module Registry pattern.
3. **Future**: Migrate write sites where atomic read-then-write isn't required (e.g. flag-only toggles where audit trail is desired). Would expose Config Viewer's audit log integration.
4. **Future**: Add `validate` callbacks for BO rate/threshold configs (e.g. clamp `bo.rate_place_per_hour` ≤ `bo.rate_place_per_day`).
5. **Future**: Bulk register remaining ~95 raw `get_option` flag-like reads (mostly in Manual Invoice / Service Center / Brand Voice / RPi config — out of scope for 4c high-value subset).
