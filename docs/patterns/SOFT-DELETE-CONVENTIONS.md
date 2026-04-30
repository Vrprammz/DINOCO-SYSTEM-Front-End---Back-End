[← back to patterns/](./README.md)

# Soft-Delete Conventions in DINOCO

**Audit ref**: DB-H2 (AUDIT-REPORT-2026-04-17.md §DB High)
**Status**: Documentation-only — does NOT migrate data; documents existing patterns + recommends going-forward convention.
**Round**: 23 (2026-04-29)

## Problem

DINOCO has accumulated **3 different soft-delete patterns** across snippets:

| Pattern | Example tables | Read filter | Lifecycle column |
|---|---|---|---|
| **A. Compound state machine** | `wp_dinoco_product_makers` (B2F V.10.0+) | `WHERE status='active' AND deleted_at IS NULL` | `status` ENUM (active/discontinued/pending) + `deleted_at` DATETIME nullable |
| **B. Boolean flag** | `wp_dinoco_products`, `wp_dinoco_box_templates` (V.42 Flash Shipping) | `WHERE is_active=1` | `is_active` TINYINT |
| **C. State-only (no nullable date)** | (informal — some legacy admin filtering uses `status='trashed'` patterns) | `WHERE status != 'trashed'` | `status` VARCHAR |

Mixing these breaks 3 things:
1. **Cross-snippet UNION queries** — analyst writing `wp_dinoco_product_makers JOIN wp_dinoco_products` must remember which uses which filter
2. **Backfill scripts** — Phase 2 backfill Helpers had to special-case both forms
3. **Recovery / un-delete** — Pattern A allows recovery (`UPDATE … SET deleted_at=NULL, status='active'`), Pattern B is a one-bit toggle (recovery loses the deleted-when timestamp)

## Existing Patterns (DO NOT REWRITE — document only)

### Pattern A — Compound (B2F V.10.0+ junction)

**Used by**: `wp_dinoco_product_makers`, `wp_dinoco_idempotency_keys` (TTL not soft-delete proper, but uses `expires_at`).

**Schema**:
```sql
status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | discontinued | pending
deleted_at DATETIME DEFAULT NULL,
KEY idx_status (status),
KEY idx_deleted (deleted_at),
KEY idx_maker_status (maker_id, status)        -- composite for hot path
```

**Read filter** (active only):
```php
WHERE status = 'active' AND deleted_at IS NULL
```

**Soft-delete write** (Round 23 ref: B2F audit `junction-bulk-delete`):
```php
$wpdb->update(
    $tbl,
    array(
        'status'     => 'discontinued',
        'deleted_at' => current_time( 'mysql' ),
        'updated_at' => current_time( 'mysql' ),
        'updated_by' => get_current_user_id(),
    ),
    array( 'id' => $id ),
    array( '%s', '%s', '%s', '%d' ),
    array( '%d' )
);
```

**Recovery**:
```php
$wpdb->update(
    $tbl,
    array( 'status' => 'active', 'deleted_at' => null, 'updated_at' => current_time('mysql') ),
    array( 'id' => $id )
);
```

**When to use Pattern A**:
- Domain has natural state machine (active vs discontinued vs paused)
- Need timestamp of when soft-delete happened (audit, undo window UI)
- Need to filter "deleted but still referenced from history records"

### Pattern B — Boolean flag (Inventory + Flash V.42)

**Used by**: `wp_dinoco_products`, `wp_dinoco_box_templates`.

**Schema**:
```sql
is_active TINYINT(1) NOT NULL DEFAULT 1,
KEY idx_active (is_active)
```

**Read filter**:
```php
WHERE is_active = 1
```

**Soft-delete write**:
```php
$wpdb->update( $tbl, array( 'is_active' => 0 ), array( 'sku' => $sku ) );
```

**When to use Pattern B**:
- Pure on/off toggle (no intermediate states)
- Catalog tables where business rule is "show or hide"
- Already established in this codebase for inventory tables

### Pattern C — TTL with `expires_at` (Idempotency, GDPR Phase 6)

**Used by**: `wp_dinoco_idempotency_keys` (24h TTL), `wp_dinoco_gdpr_requests` (7d ZIP TTL since V.2.0).

**Schema**:
```sql
expires_at DATETIME NOT NULL,
KEY idx_expires_at (expires_at)
```

**Read filter** (live row):
```php
WHERE expires_at > NOW()
```

**Cleanup** (cron):
```php
DELETE FROM {$tbl} WHERE expires_at < NOW() LIMIT 1000
```

**When to use Pattern C**:
- Time-bounded data (idempotency keys, signed download URLs, OAuth tokens)
- Cleanup is automatic (cron) — no admin "delete" action
- Hard delete acceptable (no audit reason to keep)

## Going-Forward Recommendation

For NEW tables in this codebase:

1. **Domain has multiple states** → use **Pattern A** (compound `status` + `deleted_at`)
2. **Domain is on/off toggle** → use **Pattern B** (`is_active`)
3. **Domain is time-bounded automatic cleanup** → use **Pattern C** (`expires_at`)

**Rule of thumb**: If you ever need to undo the delete and know WHEN it was deleted, you need `deleted_at`. If you just need a flip switch and history doesn't matter, `is_active=0` is enough.

## Anti-Patterns (do NOT use)

- ❌ `status='trashed'` without `deleted_at` — loses delete timestamp; admin can't tell when something was hidden
- ❌ Hard `DELETE FROM` on tables with foreign references (B2F PO history → maker_product) — breaks audit trail
- ❌ Mixing patterns within the same table (e.g. both `is_active=0` AND `deleted_at IS NOT NULL`) — query authors don't know which to filter on; inconsistent state possible

## Migration Plan (deferred — NOT in scope of this round)

If we ever want to consolidate, the cheapest migration is:

1. Audit each Pattern B table → does it need `deleted_at`?
2. If yes: ADD column `deleted_at DATETIME DEFAULT NULL` + ADD KEY → backfill `deleted_at = updated_at WHERE is_active=0`
3. Update read filters: `WHERE is_active=1` → `WHERE is_active=1 AND deleted_at IS NULL` (idempotent — both can be true)
4. Eventually drop `is_active` once all readers migrated

Most Pattern B tables (`wp_dinoco_products`) DON'T need `deleted_at` — products are toggled hidden/visible by admin in real-time, not "deleted" with audit need. So the recommendation is to leave them alone.

## See Also

- `docs/patterns/IDEMPOTENCY-KEY.md` — TTL pattern in detail (Pattern C variant)
- `docs/patterns/CACHE-PRIMING.md` — performance optimizations on filtered queries
- AUDIT-REPORT-2026-04-17.md §DB-H2 — original audit finding
- B2F-SCHEMA-V10.sql + B2F-SCHEMA-V11.sql — Pattern A reference schema
- Round 23 ledger entry — when this doc was authored (no code changes)
