# ADR M17 — Postback Dispatch Consolidation

**Status**: Accepted (Option B+)
**Date**: 2026-04-12
**Sprint**: Sprint 3 (DINOCO Full Loop Review v1 remediation)
**Authors**: Engineering + Cowork
**Supersedes**: The Option A design in `.second-brain/topics/postback-dispatch-pattern.md`

---

## Context

Full Loop Review v1 Phase 2.32 + Phase 8 flagged DINOCO's LINE postback dispatch as tech debt (tracked as M17). The original audit findings were:

- 67 postback buttons across 130 Flex bubbles
- 2 ad-hoc `if/elseif` dispatcher sites (B2B webhook + B2F webhook)
- Format drift: query-string / colon / bare
- No canonical parser
- Adding a new button = 2-file edit

Proposed solution (wiki draft at `.second-brain/topics/postback-dispatch-pattern.md`): extract everything into a global `$GLOBALS['B2B_POSTBACK_HANDLERS']` registry, delete the dispatchers, enforce a strict `action:sub:id1:id2` colon schema, add 3-second dedup.

## Sprint 3 Phase 0 reality check (2026-04-12)

Phase 0 mandatory re-scan (following Sprint 1 + 2 lessons about audit over-count) found the audit was wrong on several claims:

### What the audit said vs reality

| Claim | Audit | Reality | Delta |
|---|---|---|---|
| Postback "buttons" | 67 | **66 emitters** (emitter sites, not unique actions) | ~accurate |
| **Unique action strings** | (implied 67) | **27** | **-60%** |
| Format consistency | "drift" | **96% uniform query-string** (`action=xxx&ticket_id=...`); 1 outlier in LIFF AI | much cleaner than claimed |
| Dispatcher count | 2 | **3** (B2B + B2F admin + B2F maker) | +50% |
| Dispatcher pattern | "ad-hoc `if/elseif`" | **Clean `switch` statements** + `parse_str()` + namespace-prefix routing | completely different |
| Fragmentation ratio (Phase 0.1b — Sprint 2 lesson) | unknown | **1.04** (1.00 = clean, >1.5 = messy, >2.0 = chaotic) | very clean |
| Total switch cases | unknown | **45 unique** (39 B2B + 2 B2F admin + 6 B2F maker, 2 overlap) | — |

### What the audit got right

- 2-file edit cost for new actions (Flex builder + dispatcher switch) is real
- No cross-dispatcher observability
- Dedup is implemented per-handler via advisory locks with varying key formats and durations
- B2F admin + maker dispatchers weren't as well-known as the B2B one

### What Phase 0 additionally found

- **9 potentially-dead handlers** in B2B dispatcher: `bo_cancel_all`, `bo_extend`, `bo_wait_full`, `cancel_draft`, `change_request`, `change_shipping`, `delivery_no`, `pack_done`, `stock_partial` — exist in switch but no Flex emitter found by scanner (could be Quick Reply, Rich Menu, older template format, or truly dead)
- **Semantic dup candidate**: `confirm_received` and `delivery_ok` have the same Thai label `"✅ ได้รับสินค้าแล้ว"`. Verdict after handler inspection: **NOT a removable dup**, it's a versioning artifact — `confirm_received` (V.38) is a multi-box-aware superset of legacy `delivery_ok`. Both live, both needed until legacy Flex cards are retired.
- **B2F reschedule double-registration**: `b2f_approve_reschedule` + `b2f_reject_reschedule` are registered in BOTH `b2f_handle_admin_postback()` AND `b2f_handle_maker_postback()`. Needs verification (could be intentional, shadow bug, or defensive) — separate investigation outside this ADR.

## Decision

**Adopt Option B+ — Observability wrapper + uniform dedup + B2F verify.**

Rejected alternatives:
- **Option A (full refactor to `$GLOBALS` registry)** — solves a problem the codebase doesn't have. The `switch` statement is already canonical. Extracting 45 cases into registered closures touches well-tested production code for zero correctness benefit, at Medium-High risk.
- **Option C (hybrid — POC migration of 5 cases + dormant registry helper)** — leaves two patterns coexisting (`switch` + registry) which is a different form of tech debt. Cross-dispatcher observability is still missing until implemented.

## Consequences

### What we build

1. **`b2b_dispatch_postback()` wrapper** — single entry point that:
   - Parses `$postback_data` once (via `parse_str`)
   - Records observation in `wp_option 'dinoco_postback_observations'` **before** the dispatch (Sprint 2 M18 lesson: unknown attempts must be captured for M21 canonicalization)
   - Applies **uniform 3-second dedup** via transient `b2b_pb_dedup_` + md5(group_id + postback_data) — replaces per-handler advisory locks of varying durations
   - Delegates to existing `b2b_handle_postback()` switch unchanged (zero handler-logic touch)
   - Observation option capped at 500 entries with trim-to-400-by-frequency on overflow (hostile input containment)

2. **Webhook callsite update** — event loop in `[B2B] Snippet 2` `b2b_rest_webhook` swaps `b2b_handle_postback(...)` for `b2b_dispatch_postback(...)`. 1-line change.

3. **B2F double-registration verification** — 15-min investigation of `b2f_approve_reschedule` / `b2f_reject_reschedule` duplicate. If real bug: fix in a separate commit. If intentional: document in code comment + leave alone.

### What we explicitly do NOT build

- ❌ `b2b_register_postback()` registry helper — deferred until observability data justifies the refactor
- ❌ Extraction of 45 switch cases into closures — risk/value ratio doesn't pencil out
- ❌ Strict format enforcement (`action:sub:id1:id2` colon schema) — 96% of the codebase already uses query-string consistently
- ❌ Per-handler advisory lock removal — dispatcher-level dedup is additive, handler-level locks can stay as belt-and-suspenders
- ❌ Dead-handler cleanup (9 candidates) — needs observability data first, separate cleanup task later

### Data-enabled follow-up

After **2–4 weeks of production traffic** with observability active, run analysis:

1. Query `dinoco_postback_observations` option
2. Identify zero-hit handlers — likely candidates for dead-code removal
3. Identify highest-traffic actions — candidates for optimization / caching
4. Identify any previously-unknown actions (format drift from chatbot / legacy client builds)
5. Revisit Option A refactor: if 45 → e.g. 30 active cases after dead removal, and observability reveals a stable pattern, the registry refactor becomes worth the risk

This follow-up is **not scheduled** — it's a data-informed decision point, not a deadline.

## Drawbacks accepted

1. **Two patterns will coexist long-term**: the switch is canonical, the wrapper is new. Future engineers need to read both to understand dispatch. Mitigated by the wrapper being small (~30 lines) and the ADR documenting the separation.

2. **The 2-file edit cost for new actions remains**: adding a new action still requires editing the Flex builder + adding a switch case. Option B+ doesn't solve this. Accepted because (a) new actions are rare, (b) the audit over-stated the pain level.

3. **Option A refactor debt is deferred, not erased**: if the registry becomes necessary later, we'll be revisiting this area. Accepted because deferred debt with known value (+observability data) is cheaper than premature debt with unknown value.

## Decision criteria used

| Criterion | Option A | Option B+ | Option C |
|---|:---:|:---:|:---:|
| Fixes a real problem | ❌ (switch is clean) | ✅ (observability + dedup drift) | ✅ |
| Low risk | ❌ (45 case extractions) | ✅ (30 LOC wrapper) | 🟡 (5 case extractions) |
| Sprint budget fit (~2h) | ❌ (~6h actual) | ✅ (~1.5h actual) | 🟡 (~2.5h) |
| Delivers observability | ✅ | ✅ | ✅ |
| Delivers uniform dedup | ✅ | ✅ | 🟡 (partial) |
| Data-driven future decisions | 🟡 (already committed) | ✅ (defers decision) | 🟡 (partial) |
| Matches Sprint 2 M18 pattern | 🟡 | ✅ (observability-first) | 🟡 |

**Option B+ wins on 6 of 7 criteria.**

## Implementation sketch

```php
// [B2B] Snippet 2: LINE Webhook Gateway & Order Creator
// Inserted right above existing b2b_handle_postback() function.

/**
 * M17 — Canonical postback entry point (Sprint 3 Option B+).
 *
 * Wraps the existing switch-based b2b_handle_postback() with:
 *   1. Observability (dinoco_postback_observations wp_option)
 *   2. Uniform 3-second dedup (replaces per-handler lock drift)
 *
 * Observation is recorded BEFORE dispatch so unknown / dead actions
 * are captured for future cleanup (mirrors Sprint 2 M18 pattern).
 *
 * @param string $postback_data    raw postback.data string from LINE
 * @param string $group_id         source group_id
 * @param string $user_id          LINE uid of tapper
 * @param string $reply_token      LINE replyToken (may be expired)
 * @return void
 */
function b2b_dispatch_postback( $postback_data, $group_id, $user_id, $reply_token ) {
    // 1. Parse action for observability + logging
    parse_str( $postback_data, $params );
    $action = isset( $params['action'] ) ? (string) $params['action'] : '';
    // Fallback for colon-separated actions (e.g. LIFF AI 'lead_accepted:{id}')
    if ( $action === '' && $postback_data !== '' ) {
        $action = explode( ':', $postback_data, 2 )[0];
    }

    // 2. Observability FIRST (before dispatch) — Sprint 2 M18 lesson
    $obs = get_option( 'dinoco_postback_observations', array() );
    if ( ! is_array( $obs ) ) $obs = array();
    $obs[ $action ] = isset( $obs[ $action ] ) ? (int) $obs[ $action ] + 1 : 1;
    if ( count( $obs ) > 500 ) {
        arsort( $obs );
        $obs = array_slice( $obs, 0, 400, true );
    }
    update_option( 'dinoco_postback_observations', $obs, false );

    // 3. Uniform 3-second dedup
    $dedup_key = 'b2b_pb_dedup_' . md5( $group_id . '|' . $postback_data );
    if ( get_transient( $dedup_key ) ) {
        b2b_log( '[Postback] duplicate suppressed (3s): action=' . substr( $action, 0, 40 ) );
        return;
    }
    set_transient( $dedup_key, 1, 3 );

    // 4. Dispatch — hand off to existing switch
    return b2b_handle_postback( $postback_data, $group_id, $user_id, $reply_token );
}
```

Webhook event loop change (1 line):

```php
// Before: b2b_handle_postback( $ev['postback']['data'], $gid, $uid, $rt );
// After:  b2b_dispatch_postback( $ev['postback']['data'], $gid, $uid, $rt );
```

## Gate criteria

| Criterion | How verified |
|---|---|
| Wrapper exists + is called by webhook | `php -l` + grep for callsite |
| Observability option created before dispatch | smoke test: inject unknown action, assert `dinoco_postback_observations[$unknown]` incremented |
| Dedup suppresses 2nd call within 3s | smoke test: double-fire same data, assert 2nd returns early |
| Dedup cap ≤ 500 entries | smoke test: inject 600 distinct actions, assert option size ≤ 500 |
| Handler logic untouched | diff review: `b2b_handle_postback()` byte-for-byte unchanged |
| B2F verify complete | investigation note in either commit message or follow-up issue |

## References

- Full Loop Review v1 Phase 2.32 (pattern scan)
- Full Loop Review v1 Phase 8 (gap matrix — M17 row)
- `.second-brain/topics/postback-dispatch-pattern.md` (original Option A design — superseded)
- Sprint 2 M18 commit `d1a5054` (observability-first pattern prototype)
- Sprint 2 M20 finding (why observability precedes canonicalization)

---

**Decision record ends.** Implementation tracked in commits:

- `TBD` — Wrapper + dedup + webhook callsite update
- `TBD` — (conditional) B2F double-registration fix if real bug
- `TBD` — FULL-LOOP-REVIEW-v1.md: mark M17 resolved + new findings
- `TBD` — `.second-brain/topics/postback-dispatch-pattern.md` sync with Option B+ outcome
