# Phase 5 Applied — Module Registry as PRIMARY Source of Truth

**Date**: 2026-04-28
**Phase context**: Phase 4e (`docs/audit/phase-4e-applied.md`) registered all 18 admin tabs via `dinoco_register_admin_module()` in their owning snippets. Phase 5 promotes the registry to the **primary** wiring source in `[Admin System] DINOCO Admin Dashboard`, while preserving the V.33.5 zero-risk rollback property through emergency fallback helpers.

## Summary

| Metric | Value |
|---|---|
| Files touched | 1 (`[Admin System] DINOCO Admin Dashboard`) |
| Old → new version | V.33.6 → **V.34.0** |
| Wiring points refactored | 4 (`$module_map`, `$cacheable_modules`, `$modules[]`, `TAB_LABELS`) |
| Hardcoded literals removed from inline code | ~80 lines |
| Emergency fallback helpers added | 4 (`_dnc_emergency_module_map`, `_cache_ttl_map`, `_modules_list`, `_tab_labels`) |
| PHP lint | ✅ pass |
| Net LOC delta | +131 / -98 (helpers add small overhead, inline literals shrink) |

## Pattern — Registry primary, hardcoded as backstop

### Before (V.33.6 — both arrays merged)

```php
$module_map = [ /* 19 hardcoded entries */ ];
if ( function_exists( 'dinoco_get_registered_modules' ) ) {
    foreach ( ... ) { $module_map[$key] = $shortcode; } // registry wins on conflict
}
```

Both arrays existed at runtime. Registry merge layered ON TOP — but the hardcoded literal was always evaluated. Registry was effectively decoration; the hardcoded list was the real source.

### After (V.34.0 — registry primary, fallback only when empty)

```php
$module_map = array();
if ( function_exists( 'dinoco_get_registered_modules' ) ) {
    foreach ( dinoco_get_registered_modules() as $key => $reg ) {
        if ( ! empty( $reg['shortcode_with_brackets'] ) ) {
            $module_map[$key] = $reg['shortcode_with_brackets'];
        }
    }
}
if ( empty( $module_map ) ) {
    if ( function_exists( 'b2b_log' ) ) {
        b2b_log( '[AdminDashboard] WARN: Module Registry empty — using hardcoded fallback. Check [Admin System] DINOCO Module Registry snippet is active.' );
    }
    $module_map = _dnc_emergency_module_map();
}
```

Registry is now the source of truth. The hardcoded list lives in a `_dnc_emergency_module_map()` function called only when the registry returns empty (snippet disabled / load-order race).

## 4 Wiring Points Refactored

| # | Location | Was | Now |
|---|----------|-----|-----|
| 1 | line ~810 `$module_map` | inline 19-entry array + registry overlay | registry only; emergency `_dnc_emergency_module_map()` if empty |
| 2 | line ~825 `$cacheable_modules` | inline 19-entry TTL array + registry overlay | registry only; emergency `_dnc_emergency_cache_ttl_map()` if empty |
| 3 | line ~4028 `$modules[]` | inline 19-entry array + registry append | registry only; emergency `_dnc_emergency_modules_list()` if empty |
| 4 | line ~4093 JS `TAB_LABELS` | inline 19-entry JS literal + PHP `Object.assign` overlay | bare `{dashboard:'Dashboard'}` + PHP `Object.assign` from registry; emergency `_dnc_emergency_tab_labels()` if empty |

## Backward Compatibility

| Action | Result |
|---|---|
| Disable `[Admin System] DINOCO Module Registry` | All 4 fallback paths fire → admin notice "Module Registry empty" + b2b_log warning + emergency helpers restore Phase 4e baseline → 19 tabs working byte-identical to V.33.6 |
| Disable a single source snippet (e.g. AI Control) | Module Registry's `admin_init` validator emits notice + that single tab points to a missing shortcode → `do_shortcode()` returns literal string (orphan H12 detection still works) |
| Re-enable Module Registry | All registrations re-fire on next `init` → 18 modules back in registry → no fallback needed → no warning logged |

## Emergency Helpers (Reference)

```php
_dnc_emergency_module_map()       // 19 keys → 19 [shortcode] entries
_dnc_emergency_cache_ttl_map()    // 18 keys → TTL seconds (b2b_dnc kept uncached)
_dnc_emergency_modules_list()     // array_keys of module_map (placeholder div generation)
_dnc_emergency_tab_labels()       // 19 keys → JS-side breadcrumb labels
```

All wrapped in `function_exists()` guards (idempotent across snippet reloads).

## Test Plan (Post-Deploy QA)

1. **Normal path** — Reload Admin Dashboard with Module Registry enabled → no `b2b_log` warning → 19 tabs functional → `X-DNC-Cache: HIT` on second module load (verify TTLs preserved from registry).
2. **Emergency fallback drill** — Disable `[Admin System] DINOCO Module Registry` → reload Admin Dashboard → expect (a) `b2b_log` line `[AdminDashboard] WARN: Module Registry empty...`, (b) 19 tabs still load, (c) cache TTLs match Phase 4e baseline.
3. **Single-snippet disable** — Disable AI Control source snippet (Module Registry still enabled) → expect admin notice `Module 'ai_control' shortcode '[dinoco_admin_ai_control]' not registered` from registry validator. Tab visible but body shows literal `[dinoco_admin_ai_control]`.
4. **Re-enable** — Re-enable Module Registry → reload → no warning, no fallback path triggered.
5. **PHP lint** — `(echo '<?php'; cat $f) | php -l` ✅.

## Rollback

Single-commit revert:

```bash
git revert <phase-5-hash>
git push origin main
```

Or set the page back to V.33.6 by restoring the previous file from git history. No data migration involved (registry is in-memory; emergency helpers are pure functions).

## Files Modified

```
MOD  [Admin System] DINOCO Admin Dashboard  (V.33.6 → V.34.0)
NEW  docs/audit/phase-5-applied.md          (this file)
```
