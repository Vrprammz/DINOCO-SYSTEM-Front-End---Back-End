# DINOCO REST API Documentation

OpenAPI 3.1 spec: [`openapi.yaml`](./openapi.yaml) — ~2050 lines, **61 operations** documented across **6 namespaces**.

## Coverage

| Namespace | Tag(s) | Operations | Notes |
|---|---|---|---|
| `/b2b/v1/` | B2B-Orders, B2B-Backorder, B2B-Flash, B2B-Print | 20 | Includes BO System V.1.6 (split/fulfill/pending-review) |
| `/b2f/v1/` | B2F-Makers, B2F-PO, B2F-Receive | 14 | V.11.0 Order Intent fields + FSM transitions |
| `/liff-ai/v1/` | LIFF-AI | 8 | Auth (JWT), dashboard, leads, claims, agent-ask |
| `/dinoco-stock/v1/` | Inventory | 6 | stock/list, stock/adjust, valuation, forecast, product/pricing, warehouses |
| `/dinoco-mcp/v1/` | MCP | 5 | product-lookup, warranty-check, kb-search, dealer-lookup, lead-create |
| `/dinoco-gdpr/v1/` | GDPR | 3 | DSR scaffold (export, delete, status) — requires Agent 1 activation |

## View the Spec

### Swagger UI (recommended for quick browsing)
1. Go to https://editor.swagger.io
2. Paste contents of `openapi.yaml` into the left panel
3. Explore endpoints in right panel + try "Try it out" (staging only)

### Redocly CLI (offline)
```bash
npx @redocly/cli preview-docs docs/api/openapi.yaml
# Opens http://127.0.0.1:8080 with interactive docs
```

### VS Code
Install `OpenAPI (Swagger) Editor` extension → open `openapi.yaml` → "OpenAPI: Preview"

## Generate Client SDK

### TypeScript fetch
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/openapi.yaml \
  -g typescript-fetch \
  -o sdk/typescript
```

### Python
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/openapi.yaml \
  -g python \
  -o sdk/python
```

## Validate

```bash
# Basic syntax (requires pyyaml — pip3 install pyyaml)
python3 -c "import yaml; yaml.safe_load(open('docs/api/openapi.yaml'))"

# Schema validation (Spectral)
npx @stoplight/spectral-cli lint docs/api/openapi.yaml
```

## Scope & Known Gaps

**Documented**:
- All main production REST endpoints (B2B order lifecycle, B2F PO flow, LIFF AI)
- Backorder System V.1.6 critical endpoints (14 total, 9 documented — enough for client integration)
- Inventory core operations + multi-warehouse

**Not comprehensive**:
- MCP Bridge — 5 of 32 endpoints (most-used subset; admin claim tools + Phase 3 endpoints deferred)
- B2F Migration Audit (`/dinoco-b2f-audit/v1/`) — admin-only, flag-toggle related, not client-facing
- RPi-command / flash-webhook / flash-test endpoints — internal / testing
- `/b2b/v1/flash-webhook*` — public webhook, no auth, not useful for SDK
- Dip Stock lifecycle (`/dinoco-stock/v1/dip-stock/*`) — 6 endpoints, admin-only UI
- God Mode / margin analysis — JWT-gated confidential

**Auto-sync not implemented**: when REST routes change in snippets, `openapi.yaml` must be updated manually (Phase 5 roadmap item — likely `scripts/generate-openapi-from-routes.php` parsing `register_rest_route` calls).

## Security Schemes

| Name | Type | Description |
|---|---|---|
| `wpNonce` | apiKey (X-WP-Nonce) | WordPress nonce for admin writes |
| `liffAiBearer` | http bearer (JWT) | LIFF AI auth (Authorization: Bearer) |
| `b2fAdminToken` | apiKey (X-B2F-Token) | HMAC-signed B2F admin session |
| `b2bSessionToken` | apiKey (query: session_token) | B2B customer LIFF |
| `basicAuth` | http basic | RPi print daemon + Manual Flash |
| `apiKey` | apiKey (X-API-Key) | MCP Bridge (OpenClaw agent) |

## Versioning

Spec version: `1.0.0-2026-04-17`

When REST contracts change:
1. Bump spec `info.version` (use date-suffix for development iterations)
2. Update the relevant path entry
3. Update CHANGELOG entry in the individual snippet (keeps traceability)
4. Re-run `spectral lint` to catch regressions

## Reference

- OpenAPI 3.1 spec: https://spec.openapis.org/oas/v3.1.0
- Keep-a-changelog: https://keepachangelog.com/en/1.1.0/
- WordPress REST API handbook: https://developer.wordpress.org/rest-api/
