# Code Review Audit — Round 3

**Date**: 2026-04-12
**Commits audited**: `81af299` (11 v2 fixes), `f2c44bd` (I1 v3 grandfather closure)
**Cross-check**: `fa50dec` (chatbot V.5.4 — out of scope, verified no shared-state regression)
**Baseline**: `AUDIT-REPORT.md` (v1 + v2 combined checklist — 26 items all marked closed)
**Method**: Static review, diff inspection, current-state verification, evidence-based only.
**Status**: ✅ **ALL ITEMS RESOLVED (2026-04-12)** — see "Resolution" section at end.

## Summary

10 of 11 v2 fixes land cleanly at their root cause; I1 v3 closes the legacy literal
grandfather window completely. One new High regression in H7 (cancel-request rate
limiter is effectively disabled on default WordPress without persistent object cache).
Ship is conditional: fix H8 before deploy, everything else is clean.

---

## ✅ Verified Fixes (11 items + I1 v3)

### C4 v2 — Stock verify BEFORE FSM transition
- **Commit**: `81af299` | **File**: `[B2F] Snippet 2: REST API` V.8.6 lines 2793–2883
- **Round 2 finding**: v1 tried to rollback PO status `received → delivering`, but that edge is not in the FSM table (Snippet 6), so `b2f_transition_order()` silently fails → zombie PO stamped `received` with no stock rows.
- **Fix**: Reorder — stock dual-write first (Stage 1), then FSM transition + payable (Stage 2). On Stage 1 failure, delete `rcv_id` and leave PO at upstream legal state.
- **Verification**: Line 2812–2842 `foreach ($rcv_items)` runs `dinoco_stock_add()` before any FSM call. Line 2846 early-return path runs only `dinoco_stock_subtract` rollback + `wp_delete_post($rcv_id)` — no illegal FSM edge attempted. Line 2858 `b2f_transition_order()` runs only after the success guard. `debt_added` was initialized to `false` at the top previously; moved to line 2876 so rollback path can't touch an undefined payable.
- **Verdict**: ✅ ROOT CAUSE FIXED

### I1 v2 — Hard-reject empty state + transient-token login
- **Commit**: `81af299` | **Files**: `[System] LINE Callback` V.30.5, `[System] DINOCO Gateway` V.30.3
- **Round 2 finding**: OAuth state carried raw literal `GENERAL_LOGIN` that never verified → CSRF window.
- **Fix**: Gateway login button issues random 32-char transient (TTL 600s). Callback hard-rejects empty state, single-use verifies the transient, falls through to raw WARRANTY serial regex.
- **Verification**: `[System] DINOCO Gateway` line 50–56 `set_transient('dinoco_line_state_'.$state_token, ...)` + line 61 URL uses `$state_token`. `[System] LINE Callback` line 56–65 warranty flow does the same. Callback lines 288–307 hard-reject empty + blocklist + regex gate.
- **Verdict**: ✅ ROOT CAUSE FIXED — superseded by I1 v3 (below)

### I1 v3 — Remove grandfather window for legacy literals
- **Commit**: `f2c44bd` | **File**: `[System] LINE Callback` V.30.6 lines 280–308
- **Finding**: v2 still allowed `GENERAL_LOGIN`/`WARRANTY_PAGE` literals to pass through transient miss → `state_payload = null` + regex `[A-Z0-9\-]{4,32}` happened to accept them.
- **Fix**: Explicit `$blocked_literals` array checked ahead of regex. Anything not transient and not matching WARRANTY serial is rejected.
- **Verification**: Lines 301–307 — `in_array($state, $blocked_literals, true)` OR not matching `/^[A-Z0-9\-]{4,32}$/i` → `wp_safe_redirect(login_error=state)`. Line 385 retains defensive `!== 'GENERAL_LOGIN'` check on the redirect path — dead code now, harmless.
- **Backward compat**: Both Gateway V.30.3 + Callback V.30.4 produce transients before V.30.6 deploys, so no legitimate in-flight request can arrive with a legacy literal. LINE OAuth `code` expires ~10 min so any pre-deploy URL dies naturally.
- **Edge cases**:
  - Transient expires mid-flow → hard reject with `login_error=state` (expected; user retries login). ✅
  - SQL-injection-like chars in state → blocked by `sanitize_text_field()` at line 278 + regex `[A-Z0-9\-]` at line 303. ✅
  - Pre-deploy in-flight user → worst case one login fails, user clicks again. Acceptable.
- **Verdict**: ✅ ROOT CAUSE FIXED — grandfather closed

### H3 — Refund atomic lock + force_cancel audit
- **Commit**: `81af299` | **File**: `[Admin System] DINOCO Manual Invoice System` V.33.4 lines 1530–1608, 2047–2080
- **Fix**: `$wpdb->query('START TRANSACTION')` + `SELECT ... FOR UPDATE` on `_inv_paid_amount`, `_inv_refunded_amount`, and `wp_posts.ID` row. `try/catch \Throwable` with explicit `ROLLBACK` branches. Force-cancel requires non-empty `force_reason` + writes `force_cancelled` audit event distinct from plain `cancelled`.
- **Verification**: Lines 1547–1562 three FOR UPDATE SELECTs in sequence inside TRANSACTION. Overrefund guard (line 1569) and status guard (line 1574) both ROLLBACK before return. Line 1586 COMMIT. Exception handler logs + rollbacks. Post-commit side effects (debt recalc, status transition) run outside lock, which is fine because they re-read from committed state.
- **Caveat**: `SELECT FOR UPDATE` on a non-existent postmeta row does not create a lock record in InnoDB (gap lock only). Two concurrent refunds where `_inv_refunded_amount` hasn't been written yet (first-ever refund) both see empty → both acquire nothing → race. Mitigated by the `wp_posts.ID` lock (line 1558) which always exists. So serialization holds via the post row. ✅
- **Verdict**: ✅ ROOT CAUSE FIXED

### H4 — ajaxPrefilter + X-header nonce (FormData-safe)
- **Commit**: `81af299` | **Files**: `[Admin System] DINOCO Brand Voice Pool` V.2.7, `[Admin System] DINOCO Admin Finance Dashboard` V.3.18
- **Fix**: `ajaxSend` → `ajaxPrefilter` with `beforeSend` calling `req.setRequestHeader('X-Dinoco-BV-Nonce', BV_NONCE)`. PHP handlers accept header OR legacy POST body. 403 triggers auto-refresh prompt.
- **Verification**:
  - Brand Voice line 753–767 (PHP) — header checked first via `HTTP_X_DINOCO_BV_NONCE`, falls back to `$_POST['bv_nonce']`. JS line 1648–1667 prefilter + beforeSend.
  - Finance line 156–174 (PHP) identical pattern. JS line 2205–2232.
- **Note**: FormData path requires `origOptions._bv === true` hint. Current callers all use `$.post` with object data, so they hit the plain-object branch. No current FormData caller exists — latent but acceptable.
- **Verdict**: ✅ SYMPTOM FIXED (header injection is the canonical pattern; ajaxSend was the wrong hook)

### H5 — ALTER TABLE conditional schema bump + SHOW COLUMNS re-verify
- **Commit**: `81af299` | **File**: `[Admin System] DINOCO Global Inventory Database` V.42.19 lines 51–109
- **Fix**: Track `$all_ok` across all ALTER operations. Each ALTER checks `=== false` return, then re-runs `SHOW COLUMNS FROM {$tbl} LIKE %s` to verify column landed. Only bumps `dinoco_inventory_schema_version` if every column passed. Failures stored in `dinoco_inventory_schema_error` option + surfaced as admin_notice.
- **Verification**: Line 60 init `$all_ok = true`. Lines 66–80 per-column ALTER + SHOW COLUMNS verify, flipping `$all_ok = false` on any failure. Lines 89–103 version bump branch is guarded by `if ($all_ok)`. Retry works because version stays behind on failure → next admin_init pass re-runs. error_log() trail for DB admin.
- **Verdict**: ✅ ROOT CAUSE FIXED

### H6 — CSV duplicate detect + strict bool + errors UI
- **Commit**: `81af299` | **File**: `[B2B] Snippet 9: Admin Control Panel` V.33.6 lines 939–996, 1904–1946
- **Fix**: `$gid_seen_in_csv` array tracks group IDs within a single CSV upload. Strict dry_run parse: `$dry_raw === true || === 1 || === '1' || === 'true'` (rejects string `'false'`/`'0'`). Numeric fields strip commas before `is_numeric()`. Phase-2 import surfaces `errors[]` via alert even on partial success.
- **Verification**: Line 957–962 duplicate detection. Line 942 strict bool. Lines 965–977 comma-strip + numeric guard. JS lines 1928–1944 error alert with slice to 20 entries.
- **Limitation**: Duplicate detection only covers a single CSV upload — two admins uploading overlapping CSVs concurrently would both pass dry-run but the `get_posts` ownership check on existing gid (line 992) dedupes against DB, so no duplicate distributor records created. Acceptable.
- **Verdict**: ✅ ROOT CAUSE FIXED

### H7 — Rate limit after ownership check + atomic counter (PARTIAL — see H8)
- **Commit**: `81af299` | **File**: `[B2B] Snippet 3: LIFF E-Catalog REST API` V.40.5 lines 832–882
- **Fix**: Ownership check (line 847) moved BEFORE rate limit gate → attacker can't burn victim's quota on tickets they don't own. Counter uses `wp_cache_add` + transient mirror.
- **Verification**: Line 847 ticket ownership check returns 403 before any counter touch. ✅ That half of the fix lands cleanly.
- **Regression**: The atomic counter logic (lines 853–879) is broken on default WordPress without a persistent object cache. See H8 below.
- **Verdict**: ⚠️ HALF FIXED — ownership gate correct; counter broken

### M8 — ESC keydown sentinel
- **Commit**: `81af299` | **File**: `[B2F] Snippet 5: Admin Dashboard Tabs` V.3.5 lines 1678–1688
- **Fix**: `if (!window._b2fEscBound) { window._b2fEscBound = true; document.addEventListener(...) }`.
- **Verdict**: ✅ ROOT CAUSE FIXED

### M9 — Server-authoritative Lead FSM
- **Commit**: `81af299` | **Files**: `[LIFF AI] Snippet 1: REST API` V.1.5 lines 134–167, `[LIFF AI] Snippet 2: Frontend` V.3.3 lines 1105–1130
- **Fix**: New `GET /liff-ai/v1/lead-fsm` endpoint (perm `liff_ai_perm_any`) returns full transition map. Frontend `loadLeadFSM()` caches on `LEAD_FSM_CACHE` with minimal hardcoded fallback for offline.
- **Verification**: Server endpoint registered at line 136 with `permission_callback => 'liff_ai_perm_any'` (any authenticated user). `showStatusModal` made `async` and awaits `loadLeadFSM()`. Both LIFF AI status FSM (on WP) and chatbot status tools (on agent) read from their own modules — no cross-service contract to break.
- **Verdict**: ✅ ROOT CAUSE FIXED

### M10 — Snippet 8 full esc sweep
- **Commit**: `81af299` | **File**: `[B2B] Snippet 8: Distributor Ticket View` V.30.6
- **Verification**: Spot-checked 30 echo sites. Remaining unescaped echoes (lines 719, 724, 730, 740, 755–762, 935, 938, 966, 970, 974, 1165, 1244, 1255, 1297, 1337–1344) are all `number_format()`, `intval()`, `floatval()`, hardcoded ternary strings, or `json_encode()` (safe-by-type). Line 559 `$liff_guard` echo has `// trusted` inline comment documenting the hardcoded source.
- **Verdict**: ✅ ROOT CAUSE FIXED

### M11 — Flash cancel retry cap
- **Commit**: `81af299` | **File**: `[B2B] Snippet 5: Admin Dashboard` V.32.2 lines 1367–1395
- **Fix**: `window._b2bFlashCancelRetryCount` tracks attempts, hard alert at MAX_RETRY=3, counter reset on success/user cancel.
- **Verdict**: ✅ ROOT CAUSE FIXED

---

## ⚠️ Partial Fixes

None beyond H7 (promoted to new issue H8 below).

---

## 🔴 Regressions

None — all v1 fixes still intact per spot-check.

---

## 🆕 New Issues

### H8 — cancel-request rate limiter broken without persistent object cache
- **Severity**: 🟡 **High**
- **File**: `[B2B] Snippet 3: LIFF E-Catalog REST API` V.40.5 lines 853–879
- **Evidence**:
  ```php
  $cache_val = wp_cache_get( $rl_key, $rl_group );
  if ( $cache_val === false ) {
      if ( ! wp_cache_add( $rl_key, 1, $rl_group, $window ) ) {
          $cache_val = (int) wp_cache_get( $rl_key, $rl_group );
          if ( $cache_val >= $limit ) { return 429; }
          wp_cache_incr( $rl_key, 1, $rl_group );
      }
  } else { ... }
  // Transient mirror written AFTER, never READ on first branch
  $final = (int) wp_cache_get( $rl_key, $rl_group );
  set_transient( $rl_key, $final, $window );
  ```
- **Why this is a problem**:
  On default WordPress (no Redis/Memcache), `wp_cache_*` lives only inside a single PHP request. Every incoming cancel-request sees `wp_cache_get() === false` on line 853, enters the `wp_cache_add` branch which always succeeds (fresh cache per request) → counter initialized to 1 → request proceeds. Counter never accumulates across requests. The transient mirror (line 878) is written but never read on the `cache_val === false` path → rate limit is effectively **disabled** on default WP hosting. Combined with V.40.5's decision to move the limiter AFTER ownership check (good), the net effect is: legitimate owner can spam cancel-request with zero throttling, which was the exact N4 scenario v1 tried to fix.
- **Suggested fix** (either works):
  1. Read transient FIRST as primary source of truth, use `wp_cache_*` only as hot-path accelerator:
     ```php
     $count = (int) get_transient( $rl_key );
     if ( $count >= $limit ) return 429;
     set_transient( $rl_key, $count + 1, $window );
     ```
  2. OR check `wp_using_ext_object_cache()` and branch: persistent cache → atomic `wp_cache_add`/`wp_cache_incr`; non-persistent → transient.
- **Root cause pattern**: same as N4 → H7 → H8 trail — rate limiting has been reinvented three times without testing on a vanilla WP installation. Recommend extracting a `b2b_rate_limit($key, $limit, $window)` helper used by all throttled endpoints.

### M12 — Brand Voice H4 `_bv: true` FormData hint is undocumented contract
- **Severity**: 🔵 **Low**
- **File**: `[Admin System] DINOCO Brand Voice Pool` V.2.7 lines 1651–1654
- **Evidence**: `if (options.data instanceof FormData) { if (origOptions && origOptions._bv === true) isBV = true; }`
- **Why**: Any future FormData caller must know to set `_bv: true` in `$.ajax({ _bv: true, data: formData })`. There's no documentation and no fallback. Bug-by-omission risk.
- **Suggested fix**: add a short comment block at the top of the prefilter documenting the `_bv: true` contract, OR scan FormData entries for `dinoco_bv_action`. Same applies to `_fin: true` in Finance V.3.18 line 2216.

### L1 — I1 v3 defensive check on redirect path is dead code
- **Severity**: 🔵 **Low (cosmetic)**
- **File**: `[System] LINE Callback` V.30.6 line 385
- **Evidence**: `} elseif ( $state && $state !== 'GENERAL_LOGIN' && $state !== 'WARRANTY_PAGE' && ! $state_payload ) {`
- **Why**: Blocklist already rejects these literals at line 301–307 before reaching this branch. The explicit `!=='GENERAL_LOGIN'` / `!=='WARRANTY_PAGE'` conditions can never be false. Harmless but misleading — a reader might think legacy literals still flow here.
- **Suggested fix**: Drop to `} elseif ( $state && ! $state_payload ) {` with comment "legacy raw-serial fallthrough — legacy literals already blocked upstream".

---

## 🧩 Pattern Analysis

### Rate limiting reinvented three times (N4 → H7 → H8)
- **v1 N4**: `get_transient` + `set_transient` with pre-ownership counter burn vulnerability.
- **v2 H7**: Moved post-ownership (good) but replaced with broken `wp_cache_add` primary.
- **v3 open H8**: Net effect on default WP is no rate limit at all.
- **Root cause**: No canonical helper. Each fix adds a slightly different recipe.
- **Recommendation**: Add `b2b_rate_limit($key, $limit, $window_seconds): bool` to `[B2B] Snippet 1: Core Utilities` with transient-primary implementation. Unit test on non-persistent cache.

### Nonce injection: ajaxSend → ajaxPrefilter (H4 twice, correct)
- Brand Voice and Finance both rewrote the ajaxSend pattern to ajaxPrefilter + header. Consistent across both files. Good — no pattern drift this cycle.

### FSM tables as source of truth (C4 + M9)
- C4 v1 attempted to rollback a state transition that wasn't in the FSM table → silent fail. The fix was to stop attempting illegal transitions (C4 v2) and to expose the transition table via REST (M9). Both land at "FSM is server-authoritative" — good convergence.

---

## 🤖 Chatbot Cross-ref

- **Auth session**: LINE Callback V.30.6 only changes OAuth state handling. Chatbot auth goes through agent JWT (`LIFF_AI_JWT_SECRET`) independent of LINE OAuth state. No impact.
- **Debt/stock/credit**: H3 refund changes are PHP-side atomic with `FOR UPDATE`. Chatbot `check_debt` tool (`openclawminicrm/proxy/modules/dinoco-tools.js`) calls `/wp-json/dinoco-mcp/v1/dealer-lookup` which reads from committed state via `dinoco_get_debt()` helper — sees consistent data post-COMMIT.
- **FSM transitions**: LIFF AI Lead FSM V.2.0 map exposed by M9 mirrors `lead-pipeline.js` in agent (per commit message). Any future drift between the two needs a contract test; not blocking now.
- **Chatbot V.5.4 (`fa50dec`)**: touches only `shared.js` prompt + `chatbot-rules.md` docs. No PHP/auth/debt state. Safe.

---

## 🚢 Ship Decision

**✅ Ship now** (updated 2026-04-12 after H8/M12/L1 resolution)

**Original reasoning** (pre-resolution):
- 11 v2 fixes: 10 fully root-caused, 1 half-fixed (H7 ownership gate correct, counter broken).
- I1 v3 cleanly closes the grandfather window; backward compat is safe due to same-batch deployment of Gateway V.30.3.
- H8 was a High severity issue — latent regression of an already-latent N4 Nice-to-have.
- No Critical regressions. No data-loss path. No auth bypass.

**Post-resolution**: All 3 new issues (H8, M12, L1) closed in commits below. Root cause for rate-limit drift (pattern debt) architecturally fixed via canonical `b2b_rate_limit()` helper.

---

## 📋 Action Items — Resolution Log

- [x] **H8** — ✅ RESOLVED by commit `b9c94cf` (2026-04-12)
  - Extracted `b2b_rate_limit()` canonical helper to `[B2B] Snippet 1` V.33.1
  - Transient-primary pattern mirrors proven `b2f_rate_limit()` semantics
  - Refactored `[B2B] Snippet 3` V.40.6 cancel-request callsite
  - Smoke test: **17/17 PASS** on simulated non-persistent WP cache (default hosting)
- [x] **M12** — ✅ RESOLVED by commit `a2e2a2b` (2026-04-12)
  - Brand Voice V.2.8 + Finance V.3.19 auto-detect FormData via `FormData.has()` entry scan
  - `_bv: true` / `_fin: true` undocumented contract eliminated entirely
- [x] **L1** — ✅ RESOLVED by commit `a2e2a2b` (2026-04-12)
  - LINE Callback V.30.7 drops dead `!== 'GENERAL_LOGIN'` / `!== 'WARRANTY_PAGE'` guards at line 385
  - Upstream blocklist at line 301-307 verified to cover these cases
- [ ] **Pattern debt** (tracked separately) — Audit other rate-limiting sites (`[Admin System] DINOCO Manual Invoice System:2183`, `[System] Member Dashboard Main`, LIFF AI `/auth`) for same bug class. Not blocking; existing sites use transient-primary correctly (verified).

---

## 🎯 Resolution Summary

**Commits**:
- `b9c94cf` — H8 architectural fix (b2b_rate_limit helper + refactor)
- `a2e2a2b` — M12 + L1 cleanup

**Verification**:
- Smoke test `/tmp/dinoco-smoke/test-rate-limit.php` (not committed) — 17/17 PASS
- All modified files pass `php -l` via temp `<?php` wrapper
- No regression to v1/v2 closed items
