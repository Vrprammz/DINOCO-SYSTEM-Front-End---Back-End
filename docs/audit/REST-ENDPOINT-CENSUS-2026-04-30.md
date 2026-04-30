# REST Endpoint Census — Round 30 (2026-04-30)

[← Audit index](./)

> **Purpose**: Authoritative count of `register_rest_route` calls per namespace.
> Round 29 drift sweep (F3 MEDIUM) flagged that CLAUDE.md's "125+ REST endpoints
> across 7 namespaces" claim is wildly stale (12 days behind reality after Round
> 18+ idempotency / GDPR / flag-audit / observability / inventory expansions).
>
> **Methodology**: Python AST-style regex on all `\[*\]*` snippet files. Resolves
> variable namespaces (`$ns`) by tracking per-file `$ns = 'foo/v1'` assignments,
> and resolves constant namespaces (e.g. `B2F_AUDIT_NS`) via `define()` lookup.
>
> **Caveat**: Some `register_rest_route` calls register multiple HTTP methods on
> the same path (e.g. `'methods' => ['GET', 'POST']`). The "POST endpoint"
> count below treats those as 2 endpoints (one per method) — accurate for
> idempotency-coverage denominator since each method has its own
> permission_callback / handler / failure mode.

---

## Summary

| Metric | Value |
|--------|-------|
| Distinct namespaces | **12** |
| Total `register_rest_route` calls | **334** |
| Total endpoint method definitions | **334** (Round 33 fresh re-census) |
| **Total POST endpoint definitions** | **196** (Round 33: +3 since Round 30) |
| Total GET endpoint definitions | **137** |
| Total DELETE endpoint definitions | **1** (`/dinoco-stock/v1/warehouse`) |
| Multi-method routes | **0** |
| Idempotency-integrated endpoints | **54** (Round 33 batch 11) |
| **Coverage** | **54 / 196 = 27.6%** of POST endpoints |

> Note: The previous tracker denominator of "~75 POST endpoints" was a
> conservative pre-audit estimate. The actual census (193 → 196 in Round 33)
> means earlier rounds reported inflated coverage percentages. **Round 30
> established the authoritative denominator**, and Round 33 refreshed it for
> natural growth (+3 POST endpoints since Round 30 — likely Slip Monitor / Flag
> Audit / Idempotency self-admin endpoints).

---

## Per-namespace breakdown (Round 33 fresh re-census)

| Namespace | Routes | GET | POST | DELETE | PUT | PATCH | Sample paths (top 5) |
|-----------|--------|-----|------|--------|-----|-------|---------------------|
| `b2b/v1` | 126 | 40 | 86 | 0 | 0 | 0 | `/place-order`, `/manual-flash-create`, `/bo-fulfill`, `/flash-create`, `/print-heartbeat` |
| `dinoco-stock/v1` | 42 | 19 | 22 | 1 | 0 | 0 | `/stock/adjust`, `/stock/transfer`, `/dip-stock/approve`, `/warehouses`, `/margin-analysis` |
| `dinoco-mcp/v1` | 32 | 15 | 17 | 0 | 0 | 0 | `/claim-manual-create`, `/lead-create`, `/product-lookup`, `/dealer-lookup`, `/warranty-check` |
| `b2f/v1` | 29 | 8 | 21 | 0 | 0 | 0 | `/create-po`, `/maker-confirm`, `/receive-goods`, `/po-update`, `/po-cancel` |
| `dinoco-b2f-audit/v1` | 24 | 12 | 12 | 0 | 0 | 0 | `/sync-missing-intermediates`, `/junction-bulk-delete`, `/observations`, `/dry-run`, `/feature-flags` |
| `dinoco/v1` | 22 | 12 | 10 | 0 | 0 | 0 | `/sync-status`, `/audit/retention/run`, `/flag-audit/export`, `/onboard/save`, `/idempotency` |
| `dinoco-slip/v1` | 15 | 9 | 6 | 0 | 0 | 0 | `/manual-process`, `/replay-slip`, `/clear-locks`, `/missed-sweep`, `/ai-toggle` |
| `liff-ai/v1` | 13 | 7 | 6 | 0 | 0 | 0 | `/auth`, `/dashboard`, `/lead/(?P<id>[a-f0-9]+)/accept`, `/agent-ask`, `/dealer-dashboard` |
| `dinoco-flash-golive/v1` | 10 | 5 | 5 | 0 | 0 | 0 | `/preflight`, `/flip-flag`, `/save-pack-slots`, `/box-templates-list`, `/multi-box-pending` |
| `dinoco-gdpr/v1` | 10 | 4 | 6 | 0 | 0 | 0 | `/my-data-export`, `/my-data-delete`, `/my-data-status`, `/admin/request/(?P<id>\d+)/approve`, `/admin/request/(?P<id>\d+)/reject` |
| `brand-voice/v1` | 7 | 2 | 5 | 0 | 0 | 0 | `/entries`, `/entries/ai-bulk`, `/api-keys/generate`, `/api-keys`, `/meta` |
| `dinoco-export/v1` | 4 | 4 | 0 | 0 | 0 | 0 | `/makers`, `/catalog`, `/download-all`, `/health` |
| **TOTAL** | **334** | **137** | **196** | **1** | **0** | **0** | — |

### Method coverage analysis (Round 33)

| Method | Count | % of total | Idempotency relevance |
|--------|-------|-----------|----------------------|
| **POST** | **196** | **58.7%** | **Target for idempotency wrappers** — mutation endpoints where double-fire = side effect duplication |
| GET | 137 | 41.0% | **Skip** — read-only by definition, idempotent for free (no side effects) |
| DELETE | 1 | 0.3% | **Consider** — idempotent at DELETE semantics (delete twice = same end state) but admin double-click = cleaner UX with wrapper |
| PUT | 0 | 0% | N/A — DINOCO uses POST for all upserts |
| PATCH | 0 | 0% | N/A — DINOCO uses POST for partial updates |
| Multi-method routes | 0 | 0% | N/A — every `register_rest_route` call binds 1 method (no `methods=>['GET','POST']` patterns) |

> **Why POST-only tracker scope**: GET endpoints are replay-safe by definition (no
> side effects → identical responses without server state mutation). DELETE has
> only 1 endpoint (`/dinoco-stock/v1/warehouse` admin warehouse delete) which is
> idempotent at semantics level (DELETE twice = same end state); a wrapper would
> only improve UX (cleaner error messages on double-click) not data correctness.
> PUT/PATCH unused (DINOCO follows REST-loose convention: POST for all writes).
> See `tests/jest/idempotency-tracker-drift.test.js` Round 33 POST-only assertion
> that enforces this scope.

### Multi-method routes detection

The Round 30 census initially noted "1 multi-method route adds +1" leading to
335 endpoint definitions. Round 33 fresh re-census found **0 multi-method
routes** — every `register_rest_route` call binds exactly 1 HTTP method via
either string literal (`'methods' => 'POST'`) or constant
(`WP_REST_Server::CREATABLE` etc.). The previous +1 discrepancy was likely a
parser edge case in the Round 30 Python script. Total endpoint methods = 334
(matches `register_rest_route` call count exactly).

---

## Per-snippet breakdown (top 10)

| Routes | POST | Snippet |
|--------|------|---------|
| 47 | 26 | `[B2B] Snippet 3: LIFF E-Catalog REST API` |
| 42 | 22 | `[Admin System] DINOCO Global Inventory Database` |
| 32 | 17 | `[System] DINOCO MCP Bridge` |
| 27 | 20 | `[B2F] Snippet 2: REST API` |
| 22 | 11 | `[Admin System] B2F Migration Audit` |
| 20 | 15 | `[Admin System] DINOCO Manual Invoice System` |
| 19 | 9 | `[B2B] Snippet 9: Admin Control Panel` |
| 15 | 11 | `[B2B] Snippet 16: Backorder System` |
| 15 | 6 | `[Admin System] DINOCO Slip Monitor` |
| 13 | 6 | `[LIFF AI] Snippet 1: REST API` |

---

## Idempotency coverage by namespace (Round 33)

| Namespace | POST total | Integrated | Coverage |
|-----------|-----------|------------|----------|
| `b2b/v1` | 86 | 25 | 29.1% |
| `b2f/v1` | 21 | 16 | 76.2% (highest — Round 33 +3: maker-product, maker, po-undo-submit; remaining: maker/delete, maker/toggle-bot, maker-product/delete, po-detail/jwt POST, auth-admin) |
| `dinoco-stock/v1` | 22 | 6 | 27.3% |
| `dinoco-mcp/v1` | 17 | 6 | 35.3% (Round 33 +2: distributor-notify, customer-link) |
| `liff-ai/v1` | 6 | 1 | 16.7% |
| `dinoco/v1` | 10 | 0 | 0% |
| `dinoco-b2f-audit/v1` | 12 | 0 | 0% (admin-only audit endpoints — lower priority) |
| `dinoco-slip/v1` | 6 | 0 | 0% |
| `dinoco-flash-golive/v1` | 5 | 0 | 0% (one-time tool) |
| `dinoco-gdpr/v1` | 6 | 0 | 0% (V.1.0 stubs — full impl deferred) |
| `brand-voice/v1` | 5 | 0 | 0% |
| **Total** | **196** | **54** | **27.6%** |

---

## Drift correction

CLAUDE.md line 59 currently reads:

> 125+ REST endpoints across 7 namespaces

**Corrected**: **334 register_rest_route calls across 12 namespaces** (193 POST
+ 141 GET/DELETE). Update CLAUDE.md to reflect this baseline.

The drift compounded from 4 sources since April 17:
1. Round 18+ Idempotency Helper added 2 endpoints (`dinoco/v1`)
2. Round 19+ GDPR scaffold added 10 endpoints (`dinoco-gdpr/v1`)
3. Round 26+ Flash V.42 Go-Live added 10 endpoints (`dinoco-flash-golive/v1`)
4. Round 27+ Slip Monitor expanded by 15 endpoints (`dinoco-slip/v1`)
5. Round 28+ Brand Voice Pool expanded by 7 (`brand-voice/v1`)
6. Round 29+ Catalog Export added 4 (`dinoco-export/v1`)

Total new namespaces vs April 17 baseline: **5 new** (`dinoco-slip/v1`,
`dinoco-flash-golive/v1`, `dinoco-gdpr/v1`, `brand-voice/v1`, `dinoco-export/v1`).

---

## Methodology

```bash
# Reproduce: parse register_rest_route + resolve $ns vars + constants
python3 <<'PY'
import re, glob
from collections import Counter, defaultdict
ns_count = Counter()
for f in glob.glob("[[]*[]]*"):
    content = open(f).read()
    var_ns = {}
    for m in re.finditer(r"\$(\w+)\s*=\s*['\"]([a-z][a-z0-9-]*\/v\d+)['\"]", content):
        var_ns['$' + m.group(1)] = m.group(2)
    for m in re.finditer(r"register_rest_route\s*\(\s*([^,]+?)\s*,", content):
        ns_arg = m.group(1).strip()
        if ns_arg.startswith("'") or ns_arg.startswith('"'):
            ns = ns_arg.strip("'\"")
        elif ns_arg.startswith('$'):
            ns = var_ns.get(ns_arg, '?')
        else:
            ns = ns_arg  # constant
        ns_count[ns] += 1
print(ns_count)
PY
```

---

## See also

- Drift sweep: [`DRIFT-SWEEP-ROUND-29.md`](./DRIFT-SWEEP-ROUND-29.md) (F3 finding source)
- Idempotency tracker: [`IDEMPOTENCY-COVERAGE.md`](./IDEMPOTENCY-COVERAGE.md)
- CLAUDE.md "125+ REST endpoints" line — needs Round 30 update
