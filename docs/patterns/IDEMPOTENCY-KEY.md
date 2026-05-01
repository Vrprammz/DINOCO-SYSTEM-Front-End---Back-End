# Pattern: Idempotency-Key Wrapper

[← Patterns index](./README.md)

## Problem

Mobile clients (LIFF on flaky 4G), warehouse Wi-Fi (RPi pickup creation), and retry-prone admin LIFF (B2F PO creation) can generate duplicate POST requests when:

- Network drops mid-request → client retries → server processes both
- User double-taps submit button before debounce kicks in
- LINE app force-closes after submission, user reopens and retries

API-H4 (audit 2026-04-17) identified 75+ POST endpoints where duplicate processing could cause data corruption (duplicate orders, double debt entries, duplicate Flash labels).

Round 18-19 closed 3 critical endpoints with the Idempotency-Key wrapper pattern. Remaining endpoints deferred until 1-2 weeks production canary observed.

## Solution

Add an additive ~50 LOC wrapper at the top + bottom of POST handlers:

```php
function place_order_handler(WP_REST_Request $req) {
    // ─────── TOP: idempotency check ───────
    $idem_key = function_exists('dinoco_idempotency_extract_key')
        ? dinoco_idempotency_extract_key($req)
        : null;

    if ($idem_key) {
        // Build canonical body hash from semantic fields ONLY
        $body_hash_input = [
            'gid'   => $gid,
            'items' => $items,
            // exclude: timestamps, request IDs, debug flags
        ];
        $check = dinoco_idempotency_check($idem_key, 'place-order', $body_hash_input);
        if (is_wp_error($check)) {
            return $check; // 409 conflict — same key, different body
        }
        if (is_array($check)) {
            return rest_ensure_response($check); // replay — return cached response
        }
    }

    // ─────── EXISTING HANDLER LOGIC (unchanged) ───────
    $order_id = wp_insert_post([...]);
    // ... business logic ...
    $response = ['success' => true, 'order_id' => $order_id];

    // ─────── BOTTOM: store response for replay ───────
    if ($idem_key && function_exists('dinoco_idempotency_store')) {
        dinoco_idempotency_store($idem_key, 'place-order', $body_hash_input, $response, 200);
    }

    return rest_ensure_response($response);
}
```

## Header extraction

Client sends `X-Idempotency-Key: <uuid-v4>` header. Server-side extraction:

```php
// In [Admin System] DINOCO Idempotency Helper V.1.0
function dinoco_idempotency_extract_key($req) {
    if (!($req instanceof WP_REST_Request)) return null;
    $key = $req->get_header('x_idempotency_key');
    if (!$key) return null;

    // Validate format: UUID v4 OR opaque string 16-128 chars
    $key = trim($key);
    if (strlen($key) < 16 || strlen($key) > 128) return null;
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $key)) return null;

    return $key;
}
```

Header naming follows WP REST convention: `X-Idempotency-Key` arrives as `x_idempotency_key` in `$req->get_header()`.

## Body hash design

The hash MUST cover semantic fields only. Excluded:

- Timestamps (`now()`, `created_at`)
- Request IDs / correlation IDs
- Debug flags (`X-Test`, `X-Replay`)
- Auth tokens (already validated separately)
- Client-side fingerprints

Pattern:

```php
$body_hash_input = [
    'gid'   => $gid,           // semantic: who's placing
    'items' => $items,         // semantic: what's being placed
    'note'  => $note,          // semantic: extra context
    // NOT: 'timestamp', 'request_id', 'client_version'
];
```

Helper internals:

```php
function dinoco_idempotency_compute_body_hash($body_input) {
    // Canonical JSON encoding (ksort recursive) for deterministic hash
    $sorted = dinoco_idempotency_recursive_ksort($body_input);
    $json = wp_json_encode($sorted, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return hash('sha256', $json);
}
```

## State machine

```text
client sends key → check store
├─ key not found       → INSERT (status=in_progress) → run handler → UPDATE (status=done, response=...)
├─ key found, status=in_progress, body matches    → REPLAY 200 with cached response (in-flight retry)
├─ key found, status=in_progress, body differs    → 409 conflict (same key, different request)
├─ key found, status=done, body matches           → REPLAY 200 with cached response
├─ key found, status=done, body differs           → 409 conflict
├─ key found, status=expired (>24h)               → treat as not found, re-run handler
└─ key found, status=failed                       → re-run handler (allow retry of failed work)
```

## TTL design (24 hours)

- **Why 24h** — covers mobile session boundaries (user closes app, retries next morning) without retaining indefinitely
- **Storage** — `wp_options` autoload=no, key prefix `dinoco_idem_<namespace>_<key>`
- **Cleanup** — daily cron `dinoco_idempotency_cleanup_cron` deletes expired entries
- **Quota** — soft cap 10K entries per namespace; hard cap via cleanup cron

## Endpoint integration template

For each POST endpoint:

1. Identify the semantic body fields (exclude timestamps, request IDs)
2. Choose a namespace string (matches endpoint name: `place-order`, `manual-flash-create`, `create-po`)
3. Wrap with the top + bottom pattern shown above
4. Test:
   - No header → byte-identical to pre-wrapper behavior (regression)
   - Same header + same body, twice → 2nd call replays 1st response
   - Same header + different body → 409 conflict
   - Concurrent requests with same header → only 1 succeeds; other returns conflict or replays

## Snippet 3 example (place-order)

`[B2B] Snippet 3` V.42.9 (Round 19, commit before defer):

```php
// Top of b2b_rest_place_order
$idem_key = function_exists('dinoco_idempotency_extract_key')
    ? dinoco_idempotency_extract_key($req) : null;

if ($idem_key) {
    $body_hash_input = [
        'dist_id' => $dist_id,
        'items'   => $items,
        'note'    => $note ?? '',
    ];
    $check = function_exists('dinoco_idempotency_check')
        ? dinoco_idempotency_check($idem_key, 'place-order', $body_hash_input)
        : null;
    if (is_wp_error($check)) return $check;
    if (is_array($check)) return rest_ensure_response($check);
}

// ... existing handler (unchanged) ...

if ($idem_key && function_exists('dinoco_idempotency_store')) {
    dinoco_idempotency_store($idem_key, 'place-order', $body_hash_input, $response_body, 200);
}
return rest_ensure_response($response_body);
```

## Snippet 2 example (B2F create-po)

`[B2F] Snippet 2` V.11.10:

```php
// Top of b2f_create_po
$idem_key = function_exists('dinoco_idempotency_extract_key')
    ? dinoco_idempotency_extract_key($req) : null;

if ($idem_key) {
    $body_hash_input = [
        'maker_id' => $maker_id,
        'items'    => array_map(function($i) {
            return [
                'sku'         => $i['sku'],
                'qty'         => (int)$i['qty'],
                'order_mode'  => $i['order_mode'] ?? null,
                'source_sku'  => $i['source_sku'] ?? null,
            ];
        }, $items),
    ];
    $check = function_exists('dinoco_idempotency_check')
        ? dinoco_idempotency_check($idem_key, 'create-po', $body_hash_input) : null;
    if (is_wp_error($check)) return $check;
    if (is_array($check)) return rest_ensure_response($check);
}
```

## Backward compat

**Critical**: clients without `X-Idempotency-Key` header behave **byte-identical** to pre-wrapper:

- `dinoco_idempotency_extract_key($req)` returns `null` for missing header
- The `if ($idem_key)` block is skipped entirely
- Handler runs exactly as before
- No store call at the bottom

This means rolling out the wrapper has zero risk for legacy clients — they simply don't benefit until they start sending the header.

## When to use

- POST endpoints that mutate state (insert/update/delete)
- Endpoints called from mobile clients (LIFF, RPi)
- Endpoints where duplicate processing causes data corruption (orders, debts, payments, Flash labels)
- High-value transactions where 409 conflicts are acceptable UX

## When NOT to use

- GET endpoints (idempotent by spec — no need to wrap)
- Internal cron jobs (no client retry concern)
- Test/debug endpoints
- Endpoints with externally-coordinated dedup (e.g. Stripe payments — Stripe handles its own idempotency)

## Bulk endpoint considerations

**Added in Round 26 (bo-split splits[]) and Round 27 (3 bulk endpoints)**.

When the body contains a list (items[], skus[], bo_queue_ids[]), the wrapper
needs extra care to discriminate "same intent" from "different intent":

### Rule 1 — Canonicalize array order before hashing

Admin reordering rows in the UI is **not** different intent. Sort the array
by a deterministic key (sku, bo_queue_id, etc.) before hashing.

```php
// GOOD — admin row reorder ≠ different intent
usort( $norm_items, function( $a, $b ) {
    return $a['bo_queue_id'] <=> $b['bo_queue_id'];
} );
$idem_body = array( 'items' => $norm_items );
```

```php
// BAD — admin reordering rows would surface as 409 unexpectedly
$idem_body = array( 'items' => $items );  // accepts any order
```

### Rule 2 — Include semantic per-row fields, exclude metadata

Per-row qty/value/reason changes ARE different intent → MUST be in hash.
Per-row UI-only fields (display order, color, expanded state) MUST NOT be
in hash.

```php
// GOOD — qty + reason discriminate intent
foreach ( $items as $it ) {
    $norm_items[] = array(
        'bo_queue_id' => (int) $it['bo_queue_id'],
        'qty'         => (int) $it['qty'],  // semantic — admin overriding qty = 409
    );
}
```

### Rule 3 — Normalize string fields (case, whitespace, dedup)

For SKU arrays, uppercase-normalize + dedup + sort:

```php
$norm_skus = array();
foreach ( $skus as $s ) {
    $sku = is_string( $s ) ? trim( $s ) : '';
    if ( $sku !== '' ) $norm_skus[] = strtoupper( $sku );
}
$norm_skus = array_values( array_unique( $norm_skus ) );
sort( $norm_skus, SORT_STRING );
```

This means `['DNCBOX500', 'dncrack500']` and `['DNCRACK500', 'DNCBOX500', 'dncbox500']`
hash identically — admin retyping or reselecting the same set is safe.

### Rule 4 — Avoid timestamp/random in cached response

The bulk wrapper returns the entire batch result. If the result includes
a server-side timestamp or random ID, replays will return the **stale**
timestamp from the first call:

```php
// BAD — ts in $resp = stale on replay
$resp = array(
    'success' => true,
    'results' => $results,
    'ts'      => current_time( 'mysql' ),  // ⚠ STALE on replay
);
dinoco_idempotency_store( $key, $ns, $body, $resp, 200 );
```

```php
// GOOD — only deterministic fields in the cached response
$resp = array(
    'success' => true,
    'results' => $results,  // counts + per-item errors only
);
dinoco_idempotency_store( $key, $ns, $body, $resp, 200 );
```

### Rule 5 — Bulk replay returns entire batch result (incl. partial failures)

If 3/5 rows succeeded on first call, the cached response contains
`{success: 3, failed: 2, errors: [...]}`. Replay returns the same shape —
admin sees identical confirmation and can act on the same per-item error
list as the first call.

This is **intentional** — replay = "same answer to same question".

### Reference impl (Round 26 bo-split, canonical example)

```php
// Top: extract + check
$idem_key = function_exists('dinoco_idempotency_extract_key')
    ? dinoco_idempotency_extract_key($request) : '';
$idem_namespace = 'b2b/v1::bo-split';
$idem_body = null;
if ($idem_key !== '' && function_exists('dinoco_idempotency_check')) {
    // Normalize splits to deterministic shape (sort by sku for stable hash)
    $norm_splits = array();
    foreach ($splits as $sp) {
        if (!is_array($sp)) continue;
        $norm_splits[] = array(
            'sku'         => isset($sp['sku']) ? sanitize_text_field($sp['sku']) : '',
            'qty_fulfill' => isset($sp['qty_fulfill']) ? intval($sp['qty_fulfill']) : 0,
            'qty_bo'      => isset($sp['qty_bo']) ? intval($sp['qty_bo']) : 0,
            'eta_days'    => isset($sp['eta_days']) ? intval($sp['eta_days']) : 0,
        );
    }
    usort($norm_splits, function($a, $b) { return strcmp($a['sku'], $b['sku']); });
    $idem_body = array(
        'order_id' => $order_id,
        'dist_id'  => $dist_id,
        'splits'   => $norm_splits,
    );
    $cached = dinoco_idempotency_check($idem_key, $idem_namespace, $idem_body);
    if (is_wp_error($cached)) return $cached;       // 409 conflict
    if (is_array($cached)) return rest_ensure_response($cached);  // replay
}

// ... handler logic (unchanged) ...

// Bottom: store
if ($idem_key !== '' && $idem_body !== null && !is_wp_error($res) && function_exists('dinoco_idempotency_store')) {
    $resp_data = ($res instanceof WP_REST_Response) ? $res->get_data() : (is_array($res) ? $res : array());
    $resp_code = ($res instanceof WP_REST_Response) ? $res->get_status() : 200;
    if (is_array($resp_data) && !empty($resp_data['success'])) {
        dinoco_idempotency_store($idem_key, $idem_namespace, $idem_body,
            array_merge($resp_data, array('_idem_code' => $resp_code)), $resp_code);
    }
}
return $res;
```

## Used in

- **`[Admin System] DINOCO Idempotency Helper` V.1.1** (Round 18 foundation + Round 28 cron heartbeat — 5 helpers + 25 unit tests)
- **`[B2B] Snippet 3` V.42.13** — `place-order`, `manual-flash-create`, `manual-flash-cancel`, `cancel-request`, `admin-stock-unlock`, `admin-stock-mark-oos`, `admin-submit-tracking` (Rounds 19/23/25/28)
- **`[B2F] Snippet 2` V.11.16** — `create-po`, `po-update`, `receive-goods`, `po-cancel`, `maker-confirm`, `record-payment`, `maker-deliver`, `po-complete`, `approve-reschedule`, `reject-resolve` (Rounds 19/23/25/26/27/28)
- **`[B2B] Snippet 5` V.33.5+** — `confirm-order`, `flash-create`, `update-status` (Round 23/25)
- **`[B2B] Snippet 16` V.3.4+** — `bo-fulfill`, `bo-confirm-full`, `bo-split`, `bo-undo-split`, `bo-cancel-item`, `bo-bulk-fulfill`, `bo-bulk-cancel` (Round 19/26/27)
- **`[Admin System] DINOCO Global Inventory Database` V.45.3** — `dip-stock/approve` (Round 27)
- **`[LIFF AI] Snippet 1` V.1.11** — `lead/{id}/accept` (Round 26)

**Status**: 🎯🎯🎯 **99/196 POST endpoints integrated (50.5% — Round 42 50% MAJOR MILESTONE REACHED ⭐⭐⭐)** against authoritative Round 30 census denominator. **24-round sustained Idempotency-Key campaign Rounds 18-42** — first sustained milestone past **1/2 of POST surface** integrated. (Earlier annotation: 59/196 = 30.1% TRUE 30% milestone Round 34.)

Cumulative test coverage: **382 contract test cases** (3-9 per endpoint depending on field count + bulk semantics). See `tests/helpers/IdempotencyEndpointContractTest.php` plus fixture-based round files (`IdempotencyRound29Test.php` ... `Round42Test.php`).

**Tracker**: see [`docs/audit/IDEMPOTENCY-COVERAGE.md`](../audit/IDEMPOTENCY-COVERAGE.md) for the full list of integrated + pending endpoints + recommended next picks.

**Pattern maturity at Round 42**: **7 patterns observed** across 24 rounds — single (most common ~75 of 99) / bulk (sorted-by-key arrays — ~10 instances) / bulk-of-targets (notify_tickets[] sort + dedup — Round 28) / state-machine (status enum + actor — Round 23/40) / boolean-discriminator + enum-discriminator (toggle-bot Round 34 / shipping-defaults Round 40) / constant-marker (4 instances — stock/initialize R30 + manual-flash-test R32 + daily-summary R39 + dip-stock/start R40) / **binary-fingerprint NEW R42** (upload-image — sha1_file fingerprint, see Pattern 7 below).

**Recommendation**: **Round 43+ slow-down** to 1-2 weeks production canary observation before continuing toward 60% milestone (~118/196 endpoints, Round 47+ realistic). The 50% milestone marks a natural pause point — sustained 24-round campaign deserves a check-in window. Pattern playbook is mature; future rounds expected to reuse existing patterns rather than introduce new ones (until ~70% coverage when remaining endpoints will likely be edge cases).

## Round 18-34 case study patterns

After 17 rounds (18, 19, 23, 25-34) of incremental integration across 59 endpoints
spanning 4 namespaces (B2B / B2F / inventory / MCP), 5 distinct patterns
have crystallized. Each is the wrapper composition for a specific class of
endpoint — pick the right pattern for your endpoint shape to keep contract tests
clean and replay semantics correct.

### Pattern 1 — `single` (most common, ~40 of 59 integrated)

Single semantic record, flat body. Most place-order / save / submit endpoints
fall here. Hash includes flat fields only — no array iteration needed.

**Reference impls**:
- `POST /b2b/v1/place-order` (Round 19, Snippet 3 V.42.10) — `{gid, items, note, edit_ticket}` (edit_ticket boolean discriminates new vs edit retry)
- `POST /b2f/v1/maker-confirm` (Round 25, Snippet 2 V.11.13) — JWT-scoped maker_id in hash for cross-tenant cache poison guard
- `POST /b2f/v1/po-undo-submit` (Round 33, Snippet 2 V.11.19) — `user_id` from `get_current_user_id()` in hash; same key from different admins = different audit trail attribution → 409

**Use when**: 1 record per call, no per-row arrays, no FSM transitions involved.

### Pattern 2 — `bulk` (canonical-sort ARRAY, ~7 of 59 integrated)

Body contains an array (items[], skus[], ids[]). MUST canonicalize order before
hashing — admin reordering rows in UI ≠ different intent.

**Reference impls**:
- `POST /b2b/v1/bo-split` (Round 26, Snippet 16 V.3.4) — `splits[]` sort by sku
- `POST /b2b/v1/bo-bulk-fulfill` (Round 27, Snippet 16 V.3.5) — `items[]` sort by bo_queue_id
- `POST /b2b/v1/admin-submit-tracking` (Round 28, Snippet 3 V.42.13) — `entries[]` sort by ticket_id
- `POST /b2b/v1/import-distributors` (Round 29, Snippet 9 V.34.1) — `rows[]` sort by gid + sanitize per-row + `dry_run` discriminator
- `POST /b2f/v1/maker-deliver` (Round 26, Snippet 2 V.11.14) — `delivery_items[]` sort by sku

**Use when**: client submits N rows in a single POST. Canonical sort key MUST
be deterministic (numeric ID > string SKU > position-based last resort).

### Pattern 3 — `bulk-of-targets` (1 entity + N notify targets)

Single primary entity + array of secondary targets to notify/affect. Treat
targets[] like bulk pattern (sort + dedup) but the cached response describes
the primary entity outcome.

**Reference impls**:
- `POST /b2b/v1/admin-stock-unlock` (Round 28, Snippet 3 V.42.13) — 1 SKU primary + `notify_tickets[]` sort + dedup
- `POST /b2b/v1/combined-slip-upload` (Round 29, Snippet 3 V.42.14) — 1 gid primary + `ticket_ids[]` sort+dedup + image_base64 EXCLUDED from hash (binary)

**Use when**: 1 mutation, N side-effect targets. Cached response = "did the
1 mutation succeed" + summary of side effects.

### Pattern 4 — `state-machine` (FSM transition with terminal/already-target guard)

Endpoint transitions FSM. Replays may hit "already in target state" guard
(handler returns 400). Wrapper turns 400 into cached 200 — replay = "same answer
to same question".

**Reference impls**:
- `POST /b2f/v1/po-complete` (Round 27, Snippet 2 V.11.15) — FSM `received → completed` is terminal; replay hits "already completed" but wrapper returns cached 200 with original `completed_at` timestamp
- `POST /b2f/v1/approve-reschedule` (Round 28, Snippet 2 V.11.16) — boolean discriminator (approve/reject) doubles as FSM transition gate
- `POST /b2b/v1/bo-confirm-full` (Round 26, Snippet 16 V.3.4) — `pending_stock_review → awaiting_confirm` transition; FSM blocks 2nd transition but Flex builder re-fires before FSM check (wrapper closes the gap)

**Use when**: handler validates current state before transitioning, retry
hits the validator and returns 400. Cached 200 replay > 400 noise.

### Pattern 5 — `boolean-discriminator` + `enum-discriminator` (state flip caught by hash)

Specialized pattern where a boolean (or small enum) field discriminates intent
within an otherwise identical body. Critical: the field MUST be in the hash so
replay with flipped value triggers 409 (admin changed mind) instead of silent
state flip. Complements existing transient/lock-based dedup.

**Reference impls**:
- `POST /b2b/v1/distributor/toggle-bot` (Round 34, Snippet 9 V.34.2) — `bot_enabled` boolean in hash; complements 5s transient dedup which only protects rapid double-click. Replay >5s with same bot_enabled = idempotent; replay with flipped bot_enabled = 409.
- `POST /dinoco-mcp/v1/distributor-notify` (Round 33, MCP V.2.6) — `type` enum (`new_lead` vs `follow_up`); same key + different type = different message format → 409 instead of replaying wrong Flex bubble shape.
- `POST /dinoco-mcp/v1/brand-voice-submit` (Round 34, MCP V.2.7) — `sentiment` enum (positive/neutral/negative) in hash; sentiment edits between retries = different ML training signal → 409 instead of cached stale classification.

**Use when**: endpoint has a boolean/enum that flips intent. Without the field
in hash, silent replay corrupts state in ways the dedup guard (transient/FSM)
can't see.

### Pattern 6 — `constant-marker` (no body params — 4 instances)

Endpoints that take NO meaningful body params (action implicit in URL or
server-side state). Use a constant marker like `{action: 'start'}` so hash
extraction works consistently. Hash itself isn't discriminating intent —
namespace gate at `idempotency_check()` layer is the sole separator.

**Reference impls**:
- `POST /dinoco-stock/v1/stock/initialize` (Round 30) — `{action: 'init'}`
- `POST /b2b/v1/manual-flash-test` (Round 32) — `{action: 'test'}`
- `POST /b2b/v1/daily-summary` (Round 39) — `{action: 'trigger-summary'}`
- `POST /dinoco-stock/v1/dip-stock/start` (Round 40) — `{action: 'start'}`

**Use when**: handler takes no body params. The constant marker keeps the
helper signature consistent — wrapper still extracts a hash even though the
hash is identical for all calls within the namespace.

### Pattern 7 — `binary-fingerprint` (NEW Round 42 — upload endpoints with file content)

Multipart form upload endpoints with binary blob (image, PDF, etc.). Storing
raw binary in the body hash would explode the `idempotency_keys` table
(5MB image × N retries × N admins). Use a content fingerprint (`sha1_file()`)
as a hash field — distinguishes "same file vs different file" without
storing binary.

**Reference impl**:
- `POST /dinoco-stock/v1/product/upload-image` (Round 42, Inventory V.45.9) —
  body hash `{sku, filename, size, content_sha1}`. `content_sha1 = sha1_file($_FILES['product_image']['tmp_name'])` computed once (~50ms for 5MB). Same image retry = idempotent replay (admin sees "already uploaded"). Different content_sha1 = 409 (admin selected wrong file mid-retry, prevents wrong image stuck on SKU).

```php
// GOOD — binary-fingerprint pattern
$content_sha1 = @sha1_file($_FILES['product_image']['tmp_name']);
$idem_body = array(
    'sku'          => $sku,
    'filename'     => sanitize_file_name($_FILES['product_image']['name'] ?? ''),
    'size'         => intval($_FILES['product_image']['size'] ?? 0),
    'content_sha1' => $content_sha1 ?: '',
);
```

**Use when**: endpoint accepts binary upload via multipart form. Binary itself
must be EXCLUDED from hash (table explosion). Fingerprint distinguishes file
identity without storing bytes. Compare with parent pattern "image_base64
EXCLUDED" (slip-upload R37 + combined-slip-upload R29) which omits binary
entirely with no fingerprint — that variant is fine for endpoints where
"same ticket retry = same intent regardless of which image was attached"
(payment slip upload). The NEW binary-fingerprint variant adds file-identity
check for endpoints where "same SKU but different image = admin error to
catch via 409" (catalog product image upload).

**Pattern selection guide**: image_base64 EXCLUDED variant (no fingerprint)
when endpoint is "outcome-oriented" (payment confirmed regardless of slip
photo); binary-fingerprint variant (sha1_file) when endpoint is
"file-identity-oriented" (catalog image must match admin's intended file).

## Anti-patterns spotted across rounds

These showed up in code review across Rounds 19-34 — avoid them:

### Anti-pattern A — Timestamps in cached body (bulk pattern)

```php
// BAD — bulk endpoint cached response includes server-side timestamp
$resp = array(
    'success' => true,
    'results' => $results,
    'ts'      => current_time( 'mysql' ),  // ⚠ STALE on replay 24h later
);
```

**Surfaced in**: Round 26 bulk-array audit (caught before commit). Round 28
bulk-of-targets pattern formalized exclusion of timestamp/random fields from
cached response. **Fix**: cache only deterministic fields; let client read
cached `_idem_code` if it needs to verify staleness.

### Anti-pattern B — Non-canonical bulk array (admin reorder = false 409)

```php
// BAD — admin reordering rows in the UI between retries surfaces unexpected 409
$idem_body = array( 'items' => $items );  // accepts any order
```

**Surfaced in**: Round 27 review (bo-bulk-fulfill / bo-bulk-cancel). Without
canonical sort, admin clicking checkboxes in different order on 2nd attempt
= different hash = 409 = confusing UX. **Fix**: `usort` by deterministic key
before hashing. See Pattern 2 reference impls.

### Anti-pattern C — Cross-namespace shape collision (defense-in-depth gap)

```php
// BAD — 2 different endpoints accept identical {ticket_id} body
// place-order namespace + delete-ticket namespace both hash {ticket_id}
// → same key reused across endpoints = stale cross-endpoint replay
```

**Surfaced in**: Round 29 dual-pattern (delete-ticket vs recalculate-total
both take `{ticket_id}`). Round 33 maker-product vs maker pair (both have
`id` field). Round 34 distributor-delete vs distributor-toggle-bot (both
target distributor `id`). **Fix**: namespace prefix in cache key
(`b2b/v1::delete-ticket` vs `b2b/v1::recalculate-total`) is the primary
defense; cross-namespace pair guard tests in `IdempotencyRoundNNTest.php`
prove hashes differ even within same canonical body shape (defense-in-depth).
Each round file documents which pair guards apply to that round's batch.

## Anti-patterns

```php
// BAD: hashing the entire $_POST including timestamps
$body_hash_input = $_POST; // includes 'timestamp', breaks dedup on retry
```

```php
// BAD: storing response BEFORE handler completes
dinoco_idempotency_store($key, 'place-order', $hash, ['pending' => true], 200);
$response = run_handler();
// If handler crashes, the 'pending' response is cached → next retry replays it
```

```php
// BAD: hard fail when helper missing
$check = dinoco_idempotency_check($key, 'ns', $body); // TypeError if helper missing
```

```php
// BAD: extracting key without validation (length, charset)
$idem_key = $req->get_header('x_idempotency_key'); // could be 10MB of garbage
```

## Migration checklist

When adding wrapper to a new endpoint:

1. Read the endpoint's existing logic — identify the response variable name
2. Identify semantic body fields (exclude timestamps, request IDs)
3. Choose a unique namespace string (matches endpoint slug)
4. Add top block:
   - Extract key with `function_exists` guard
   - If key present, check + replay/reject logic
5. Add bottom block (just before `return`):
   - Store response if key present
6. Test cases:
   - No header → byte-identical to pre-wrapper
   - Same key + same body, repeated → 1st runs, 2nd replays
   - Same key + different body → 409
   - Header malformed → ignored (treated as no header)
7. Update endpoint doc + OpenAPI spec to mention `X-Idempotency-Key` support

## See also

- [Pattern: function_exists Guards](./FUNCTION-EXISTS-GUARDS.md) — for the `dinoco_idempotency_*` helper guards
- Foundation snippet: `[Admin System] DINOCO Idempotency Helper` V.1.0 (Round 18)
- Round 19 integration: `CHANGELOG.md` Round 19 entry, log.md `2026-04-29 Round 19`
- Audit doc: `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` Section "Patterns Established #5"
- Test suite: `tests/jest/api-contract.test.js` (Idempotency-Key contract tests)
