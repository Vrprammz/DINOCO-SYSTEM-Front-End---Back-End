# Idempotency-Key Coverage Tracker

[← Audit index](./)

> **Purpose**: Track which DINOCO POST endpoints have `X-Idempotency-Key`
> middleware integration. Helps future rounds pick the next batch + lets
> reviewers audit at a glance.

> **Pattern reference**: [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md)

> **Helper snippet**: `[Admin System] DINOCO Idempotency Helper` V.1.1
> (Round 18 foundation, Round 28 cron heartbeat fix)

---

## Status summary

| Metric | Count |
|--------|-------|
| Total integrated endpoints | **28** |
| Estimated total POST endpoints | ~75 |
| Coverage | **~37%** |
| Cumulative test cases | 106 (28 × 3-4 each + cumulative no-collision) |
| Body-shape distinct hashes asserted | 27 (bo-undo-split intentionally shares with bo-confirm-full, namespace-discriminated) |

---

## Integrated endpoints (28)

| # | Endpoint | Snippet | Pattern | Round | Status |
|---|----------|---------|---------|-------|--------|
| 1 | `POST /b2b/v1/place-order` | `[B2B] Snippet 3` V.42.10 | single (edit_ticket discriminates new vs edit) | 19 | integrated |
| 2 | `POST /b2b/v1/manual-flash-create` | `[B2B] Snippet 3` V.42.10 | single (per-PNO Flash dispatch) | 19 | integrated |
| 3 | `POST /b2f/v1/create-po` | `[B2F] Snippet 2` V.11.11 | single (DD-3 composite merge) | 19 | integrated |
| 4 | `POST /b2b/v1/manual-flash-cancel` | `[B2B] Snippet 3` V.42.11 | single | 23 | integrated |
| 5 | `POST /b2f/v1/po-update` | `[B2F] Snippet 2` V.11.12 | single (exchange_rate IMMUTABLE excluded) | 23 | integrated |
| 6 | `POST /b2f/v1/receive-goods` | `[B2F] Snippet 2` V.11.12 | single (photos[] excluded — FormData binary) | 23 | integrated |
| 7 | `POST /b2b/v1/confirm-order` | `[B2B] Snippet 5` V.33.4 | single | 23 | integrated |
| 8 | `POST /b2b/v1/flash-create` | `[B2B] Snippet 5` V.33.4 | single | 23 | integrated |
| 9 | `POST /b2b/v1/update-status` | `[B2B] Snippet 5` V.33.4 | single (status enum) | 23 | integrated |
| 10 | `POST /b2b/v1/cancel-request` | `[B2B] Snippet 3` V.42.12 | single | 25 | integrated |
| 11 | `POST /b2f/v1/po-cancel` | `[B2F] Snippet 2` V.11.13 | single | 25 | integrated |
| 12 | `POST /b2f/v1/maker-confirm` | `[B2F] Snippet 2` V.11.13 | single (JWT-scoped maker_id) | 25 | integrated |
| 13 | `POST /b2f/v1/record-payment` | `[B2F] Snippet 2` V.11.13 | single (slip_image binary excluded) | 25 | integrated |
| 14 | `POST /b2b/v1/bo-fulfill` | `[B2B] Snippet 16` V.3.4 | single | 19 | integrated |
| 15 | `POST /b2b/v1/bo-confirm-full` | `[B2B] Snippet 16` V.3.4 | single (shape collides with bo-undo-split — namespace-discriminated) | 26 | integrated |
| 16 | `POST /b2b/v1/bo-split` | `[B2B] Snippet 16` V.3.4 | **bulk** (splits[] sort by sku) | 26 | integrated |
| 17 | `POST /b2b/v1/bo-undo-split` | `[B2B] Snippet 16` V.3.4 | single (shares shape with bo-confirm-full) | 26 | integrated |
| 18 | `POST /b2f/v1/maker-deliver` | `[B2F] Snippet 2` V.11.14 | **bulk** (delivery_items[] sort by sku) | 26 | integrated |
| 19 | `POST /liff-ai/v1/lead/{id}/accept` | `[LIFF AI] Snippet 1` V.1.11 | single | 26 | integrated |
| 20 | `POST /b2b/v1/bo-cancel-item` | `[B2B] Snippet 16` V.3.5 | single | 27 | integrated |
| 21 | `POST /b2b/v1/bo-bulk-fulfill` | `[B2B] Snippet 16` V.3.5 | **bulk** (items[] sort by bo_queue_id) | 27 | integrated |
| 22 | `POST /b2b/v1/bo-bulk-cancel` | `[B2B] Snippet 16` V.3.5 | **bulk** (bo_queue_ids[] sort + dedup + reason) | 27 | integrated |
| 23 | `POST /b2f/v1/po-complete` | `[B2F] Snippet 2` V.11.15 | single (FSM completed terminal) | 27 | integrated |
| 24 | `POST /dinoco-stock/v1/dip-stock/approve` | `[Admin System] DINOCO Global Inventory Database` V.45.3 | single (variance items[]) | 27 | integrated |
| 25 | `POST /b2b/v1/admin-stock-unlock` | `[B2B] Snippet 3` V.42.13 | **bulk-of-targets** (notify_tickets[] sort + dedup) | **28** | **integrated** |
| 26 | `POST /b2b/v1/admin-stock-mark-oos` | `[B2B] Snippet 3` V.42.13 | single | **28** | **integrated** |
| 27 | `POST /b2b/v1/admin-submit-tracking` | `[B2B] Snippet 3` V.42.13 | **bulk** (entries[] sort by ticket_id) | **28** | **integrated** |
| 28 | `POST /b2f/v1/approve-reschedule` | `[B2F] Snippet 2` V.11.16 | single (boolean discriminator) | **28** | **integrated** |
| 29 | `POST /b2f/v1/reject-resolve` | `[B2F] Snippet 2` V.11.16 | single (action enum financial impact) | **28** | **integrated** |

> Note: numbering goes to 29 because bo-confirm-full (15) + bo-undo-split (17) share body shape but are
> namespace-discriminated → counted as 2 integrated endpoints with 1 distinct shape.

---

## Pending POST endpoints (Round 29+ candidates)

### High priority (next 5 picks)

| Endpoint | Snippet | Risk if double-fired | Round candidate |
|----------|---------|----------------------|-----------------|
| `POST /b2b/v1/combined-slip-upload` | `[B2B] Snippet 3` | Slip2Go API double-call → false-positive verification | Round 29 |
| `POST /b2b/v1/combined-invoice-gen` | `[B2B] Snippet 3` | Duplicate invoice number generation | Round 29 |
| `POST /b2b/v1/import-distributors` | `[B2B] Snippet 9` | Bulk distributor CRUD double-execute | Round 29 |
| `POST /b2b/v1/recalculate-total` | `[B2B] Snippet 5` | Order total drift on retry | Round 29 |
| `POST /b2b/v1/delete-ticket` | `[B2B] Snippet 5` | Already-deleted retry returns confusing 404 | Round 29 |

### Medium priority (Round 30+)

| Endpoint | Snippet | Notes |
|----------|---------|-------|
| `POST /dinoco-mcp/v1/claim-manual-create` | `[System] DINOCO MCP Bridge` | OpenClaw chatbot retry path — high duplicate risk |
| `POST /dinoco-mcp/v1/claim-manual-update` | `[System] DINOCO MCP Bridge` | Same path |
| `POST /dinoco-mcp/v1/lead-create` | `[System] DINOCO MCP Bridge` | Mobile retry from chatbot |
| `POST /dinoco-mcp/v1/lead-update` | `[System] DINOCO MCP Bridge` | Same |
| `POST /b2b/v1/manual-flash-ready` | `[B2B] Snippet 3` | Pair with manual-flash-cancel (already integrated) |
| `POST /b2b/v1/manual-flash-test` | `[B2B] Snippet 3` | Test endpoint — lower priority |
| `POST /b2b/v1/print-test` | `[B2B] Snippet 3` | Test endpoint — lower priority |
| `POST /b2b/v1/admin-bo-tickets` (POST mode) | `[B2B] Snippet 3` | Verify if it's POST or GET (admin-bo-tickets is GET in current spec) |
| `POST /dinoco-stock/v1/stock/adjust` | `[Admin System] DINOCO Global Inventory Database` | Stock movement double-write |
| `POST /dinoco-stock/v1/stock/transfer` | `[Admin System] DINOCO Global Inventory Database` | Warehouse transfer double-write |
| `POST /dinoco-stock/v1/warehouse` | `[Admin System] DINOCO Global Inventory Database` | Create/update — needs verify |
| `POST /dinoco-stock/v1/product/pricing` | `[Admin System] DINOCO Global Inventory Database` | Price tier dual-write |
| `POST /b2f/v1/maker-reject` | `[B2F] Snippet 2` | Pair with maker-confirm |
| `POST /b2f/v1/maker-reschedule` | `[B2F] Snippet 2` | Maker LIFF retry |
| `POST /b2f/v1/maker-product` | `[B2F] Snippet 2` | CRUD |
| `POST /b2f/v1/maker` | `[B2F] Snippet 2` | CRUD |
| `POST /b2f/v1/po-undo-submit` | `[B2F] Snippet 2` | Undo window already enforces 30s |
| `POST /b2f/v1/reject-lot` | `[B2F] Snippet 2` | QC reject path |
| `POST /b2b/v1/bo-confirm-full` (already covered) | already integrated |
| `POST /b2b/v1/bo-update-eta` | `[B2B] Snippet 16` | ETA edit |
| `POST /b2b/v1/bo-restock-scan` | `[B2B] Snippet 16` | Manual trigger |
| `POST /b2b/v1/bo-clear-enum-flag` | `[B2B] Snippet 16` | Admin flag clear |

### Low priority (don't need wrapper)

| Endpoint | Reason |
|----------|--------|
| `POST /b2b/v1/print-ack` | RPi acknowledgment — server-side dedup via order_id |
| `POST /b2b/v1/print-heartbeat` | Idempotent by design (last-poll timestamp) |
| `POST /b2b/v1/rpi-command-ack` | Fire-and-forget RPi ack |
| `POST /b2b/v1/flash-webhook` | Flash → DINOCO direction (Flash retry handled by Flash side) |
| `POST /b2b/v1/test-push` | Admin test endpoint |
| `POST /dinoco-stock/v1/god-mode/verify` | PIN verify — natural rate-limit + JWT TTL = effective dedup |

---

## Pattern legend

| Pattern | Description |
|---------|-------------|
| **single** | Single semantic record. Body hash includes flat fields only. Most common. |
| **bulk** | Body contains array (items[], skus[], ids[]). Requires canonical sort + per-row sanitize before hashing. See [IDEMPOTENCY-KEY.md § Bulk endpoint considerations](../patterns/IDEMPOTENCY-KEY.md#bulk-endpoint-considerations). |
| **bulk-of-targets** | Single primary entity + array of sub-targets to notify/affect. E.g. admin-stock-unlock = 1 SKU + N notify_tickets. Treat targets[] like bulk: sort + dedup. |
| **state-machine** | Endpoint transitions FSM — replays may hit "already in target state" guard. Wrapper turns 400 into cached 200. E.g. po-complete (received → completed). |

---

## Test coverage

Each integrated endpoint has 3-9 contract tests in
`tests/helpers/IdempotencyEndpointContractTest.php`:

- `test_*_identical_body_same_hash` — replay safety
- `test_*_<critical-field>_different_hash` — discriminator validation
- `test_*_no_collision` — per-round + cumulative

| Round | Endpoints | Test cases | Cumulative no-collision shapes |
|-------|-----------|------------|-------------------------------|
| 19    | 3         | 16         | 3                             |
| 23    | 5         | 21         | 8                             |
| 25    | 5         | 18         | 13                            |
| 26    | 5         | 15         | 17 (bo-undo-split shares with bo-confirm-full) |
| 27    | 5         | 18         | 22                            |
| **28** | **5**     | **18**     | **27**                        |

Total: **106 contract tests** across 6 rounds (Rounds 19-28).

---

## Versioning

When adding a new endpoint to this tracker:

1. Update the table above (status: pending → integrated)
2. Bump snippet version (V.X.Y → V.X.Y+1) with Round NN annotation
3. Add cumulative no-collision assertion (increment N)
4. Update `docs/patterns/IDEMPOTENCY-KEY.md § Used in` list
5. (Optional) Update OpenAPI spec to mention `X-Idempotency-Key` support
   — currently DEFERRED to bulk doc sweep round.

## See also

- Pattern: [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md)
- Foundation: `[Admin System] DINOCO Idempotency Helper` V.1.1
- Tests: `tests/helpers/IdempotencyEndpointContractTest.php`
- Audit history: Rounds 18-19, 23, 25-28
