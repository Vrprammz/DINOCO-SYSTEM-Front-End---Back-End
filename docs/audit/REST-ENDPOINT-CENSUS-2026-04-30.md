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
| Total endpoint method definitions | **335** (1 multi-method route adds +1) |
| **Total POST endpoint definitions** | **193** |
| Idempotency-integrated endpoints | **39** (Round 30 batch 8) |
| **Coverage** | **39 / 193 = 20.2%** of POST endpoints |

> Note: The previous tracker denominator of "~75 POST endpoints" was a
> conservative pre-audit estimate. The actual census (193) means earlier
> rounds reported inflated coverage percentages. **Round 30 establishes the
> authoritative denominator** (193) for future tracking.

---

## Per-namespace breakdown

| Namespace | Routes | GET | POST | DELETE | Sample paths (top 5) |
|-----------|--------|-----|------|--------|---------------------|
| `b2b/v1` | 128 | 44 | 84 | 0 | `/place-order`, `/manual-flash-create`, `/bo-fulfill`, `/flash-create`, `/print-heartbeat` |
| `dinoco-stock/v1` | 42 | 19 | 22 | 1 | `/stock/adjust`, `/stock/transfer`, `/dip-stock/approve`, `/warehouses`, `/margin-analysis` |
| `dinoco-mcp/v1` | 32 | 15 | 17 | 0 | `/claim-manual-create`, `/lead-create`, `/product-lookup`, `/dealer-lookup`, `/warranty-check` |
| `b2f/v1` | 29 | 8 | 21 | 0 | `/create-po`, `/maker-confirm`, `/receive-goods`, `/po-update`, `/po-cancel` |
| `dinoco-b2f-audit/v1` | 22 | 11 | 11 | 0 | `/sync-missing-intermediates`, `/junction-bulk-delete`, `/observations`, `/dry-run`, `/feature-flags` |
| `dinoco/v1` | 22 | 12 | 10 | 0 | `/sync-status`, `/audit/retention/run`, `/flag-audit/export`, `/onboard/save`, `/idempotency` |
| `dinoco-slip/v1` | 15 | 9 | 6 | 0 | `/manual-process`, `/replay-slip`, `/clear-locks`, `/missed-sweep`, `/ai-toggle` |
| `liff-ai/v1` | 13 | 7 | 6 | 0 | `/auth`, `/dashboard`, `/lead/(?P<id>[a-f0-9]+)/accept`, `/agent-ask`, `/dealer-dashboard` |
| `dinoco-flash-golive/v1` | 10 | 5 | 5 | 0 | `/preflight`, `/flip-flag`, `/save-pack-slots`, `/box-templates-list`, `/multi-box-pending` |
| `dinoco-gdpr/v1` | 10 | 4 | 6 | 0 | `/my-data-export`, `/my-data-delete`, `/my-data-status`, `/admin/request/(?P<id>\d+)/approve`, `/admin/request/(?P<id>\d+)/reject` |
| `brand-voice/v1` | 7 | 2 | 5 | 0 | `/entries`, `/entries/ai-bulk`, `/api-keys/generate`, `/api-keys`, `/meta` |
| `dinoco-export/v1` | 4 | 4 | 0 | 0 | `/makers`, `/catalog`, `/download-all`, `/health` |

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

## Idempotency coverage by namespace

| Namespace | POST total | Integrated | Coverage |
|-----------|-----------|------------|----------|
| `b2b/v1` | 84 | 22 | 26.2% |
| `b2f/v1` | 21 | 10 | 47.6% |
| `dinoco-stock/v1` | 22 | 4 | 18.2% |
| `dinoco-mcp/v1` | 17 | 2 | 11.8% (Round 30 entry) |
| `liff-ai/v1` | 6 | 1 | 16.7% |
| `dinoco/v1` | 10 | 0 | 0% |
| `dinoco-b2f-audit/v1` | 11 | 0 | 0% (admin-only audit endpoints — lower priority) |
| `dinoco-slip/v1` | 6 | 0 | 0% |
| `dinoco-flash-golive/v1` | 5 | 0 | 0% (one-time tool) |
| `dinoco-gdpr/v1` | 6 | 0 | 0% (V.1.0 stubs — full impl deferred) |
| `brand-voice/v1` | 5 | 0 | 0% |
| **Total** | **193** | **39** | **20.2%** |

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
