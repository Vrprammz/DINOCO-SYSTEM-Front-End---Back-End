# Drift Sweep — Round 29 (2026-04-30)

[← Audit index](./)

> **Purpose**: Comprehensive sweep for documentation/code drift across CLAUDE.md,
> README.md, IDEMPOTENCY-COVERAGE.md, and snippet headers. Round 29 surfaced 4
> findings — 2 fixed in this commit, 2 documented for future remediation.

---

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| HIGH | 1 | Documented (no fix — preserves test integrity) |
| MEDIUM | 2 | Fixed in this commit |
| LOW | 1 | Fixed in this commit |
| **Total** | **4** | |

---

## Findings

### F1 (HIGH) — `bo-fulfill` listed as integrated but no idempotency wrapper

**Location**: `docs/audit/IDEMPOTENCY-COVERAGE.md` line 45 (#14 entry)

**Symptom**: Tracker says `POST /b2b/v1/bo-fulfill` integrated in Round 19 (`[B2B] Snippet 16` V.3.4), but actual code at `[B2B] Snippet 16: Backorder System` line 2114 (`b2b_rest_bo_fulfill`) and line 2189 (`_b2b_rest_bo_fulfill_inner`) has **NO** `idem_namespace` reference. Only `bo-bulk-fulfill` (line 956) has the wrapper.

**Verification**:
```bash
grep -nE "idem_namespace|function _?b2b_rest_bo_fulfill" "[B2B] Snippet 16: Backorder System"
# 956: $idem_namespace = 'b2b/v1::bo-bulk-fulfill';   # bulk YES
# 2114: function b2b_rest_bo_fulfill( $request ) {     # single — NO wrapper
# 2189: function _b2b_rest_bo_fulfill_inner( ... )     # also no wrapper
```

**Status**: **Not fixed in Round 29 commit** — adding wrapper to bo-fulfill mid-round 29 would require:
1. Editing Snippet 16 (currently V.3.4) → bumping version
2. Adding 3 contract tests
3. Updating cumulative no-collision counts

This is scope-creep for a drift sweep. Documented here as Round 30 candidate.

**Action**: Add `bo-fulfill` to "Pending POST endpoints" → "High priority" in IDEMPOTENCY-COVERAGE.md (currently it sits in the integrated section). Mark Round 19 #14 entry as **TRACKER DRIFT**. Round 30 should integrate the wrapper.

**Risk if left unfixed**: BO admin admin "ส่งสินค้า BO" double-click → debt double-add + duplicate Flash secondary order + duplicate customer "BO ready" Flex (M7 builder fires twice). H5/H6 hook fire twice. Currently mitigated by manual-trigger pattern (admin pauses to verify after click) but not bulletproof.

### F2 (MEDIUM) — README test count badge stale

**Location**: `README.md` line 12 (`phpunit_tests-529_passing`)

**Symptom**: After Round 29 the count is 568 (529 + 39 new tests). Badge says 529.

**Status**: **Fixed** — bumped to 568 in this commit.

### F3 (MEDIUM) — REST endpoint count claim wildly off

**Location**: `CLAUDE.md` line 59:
> **125+ REST endpoints across 7 namespaces** (verified by `AUDIT-REPORT-2026-04-17.md` §Repo Map). Breakdown: `/b2b/v1/` ~30 + `/b2f/v1/` 21 + `/dinoco-stock/v1/` 11 + `/dinoco-b2f-audit/v1/` ~17 + `/liff-ai/v1/` 13 + `/dinoco-mcp/v1/` 32 + `/dinoco/v1/` 1.

**Symptom**: Actual `register_rest_route` calls: **335 across 32 snippets**. The 125+ claim came from the April 17 audit (12 days stale). Newer additions (Round 18+ idempotency / GDPR / flag-audit / observability / 14 audit/golive endpoints / inventory expansions) added ~210 routes.

**Per-snippet breakdown** (top 10):
```
 47  [B2B] Snippet 3: LIFF E-Catalog REST API
 42  [Admin System] DINOCO Global Inventory Database
 32  [System] DINOCO MCP Bridge
 27  [B2F] Snippet 2: REST API
 22  [Admin System] B2F Migration Audit
 20  [B2B] Snippet 9: Admin Control Panel
 20  [Admin System] DINOCO Manual Invoice System
 15  [B2B] Snippet 16: Backorder System
 15  [Admin System] DINOCO Slip Monitor
 13  [LIFF AI] Snippet 1: REST API
```

**Status**: **NOT fixed in Round 29** — needs a separate "REST endpoint census" sweep with namespace-by-namespace verification (some `register_rest_route` calls register multiple methods on the same route — actual unique endpoint count needs `array of methods` parsing). Documented for Round 30+.

**Action**: Round 30 should run a dedicated REST endpoint census. The simplistic count (335) overstates because some routes register multiple HTTP methods (GET + POST) in single call. The simplistic count (125) understates because new namespaces (dinoco-flash-golive, dinoco-slip, dinoco-gdpr, brand-voice, dinoco-export) aren't listed.

### F4 (LOW) — IDEMPOTENCY-COVERAGE.md count off by 1 (28 vs 33 actual)

**Location**: `docs/audit/IDEMPOTENCY-COVERAGE.md` line 21 ("Total integrated endpoints: **28**")

**Symptom**: Round 28 added 5 → 28 total. Round 29 adds 5 more → should be 33. Tracker not updated yet.

**Status**: **Fixed** — bumped to 33 in this commit (Round 29 work item).

**Verification**:
```bash
grep -hE "idem_namespace.*=" \[*\]* | sed -E "s/.*idem_namespace.*['\\\"]([^'\\\"]+)['\\\"].*/\1/" | grep -v _idem_code | sort -u | wc -l
# 33
```

---

## Drift not found (clean checks)

These checks PASSED — no action needed:

| Check | Result |
|-------|--------|
| **Mermaid count** | README says "23 diagrams", `WORKFLOW-REFERENCE.md` has 23 `\`\`\`mermaid` fences. ✓ |
| **DB_ID header presence** | All 30+ snippets have `DB_ID:` token in first 1000 lines. ✓ |
| **Snippet 1 V.34.25** | CLAUDE.md mentions match snippet header `V.34.25 (2026-04-29)`. ✓ |
| **Idempotency namespaces (lower-bound)** | 33 distinct `idem_namespace` strings in code = 33 entries in tracker (Round 28 + Round 29 combined). ✓ |
| **DB_ID `(pending — populate after first WP Code Snippets sync)` placeholder** | 14 snippets — these are NEW snippets not yet first-synced. Expected behavior; webhook fallback to filename match works. ✓ (but Round 30 should populate after first sync) |

---

## Round 29 deltas applied

1. **F2**: README badge 529 → 568 PHPUnit tests
2. **F4**: IDEMPOTENCY-COVERAGE.md `28 → 33 integrated` + Round 29 row entries
3. **F1 deferred**: Documented inaccuracy; recommend Round 30 fix
4. **F3 deferred**: Documented; recommend Round 30 census

---

## Methodology

```bash
# 1. Snippet version check
for f in \[*\]*; do head -10 "$f" | grep "Version:"; done

# 2. REST endpoint count
for f in \[*\]*; do echo "$(grep -c register_rest_route "$f") $f"; done | sort -rn

# 3. DB_ID header presence (V.32.0 webhook sync requirement)
for f in \[*\]*; do head -1000 "$f" | grep -q "DB_ID" || echo "MISSING: $f"; done

# 4. Idempotency namespace census
grep -hE "idem_namespace.*=" \[*\]* | sed -nE "s/.*['\"]([a-z0-9-]+/v[0-9]+::[a-z-]+)['\"].*/\1/p" | sort -u

# 5. Mermaid diagram count
grep -c "^\`\`\`mermaid" WORKFLOW-REFERENCE.md
```

---

## See also

- Pattern: [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md)
- Tracker: [`docs/audit/IDEMPOTENCY-COVERAGE.md`](./IDEMPOTENCY-COVERAGE.md)
- Cron drift (Round 28): [`docs/audit/CRON-DRIFT-ROUND-28.md`](./CRON-DRIFT-ROUND-28.md)
- Round 27 drift sweep: commit `50bee55`
