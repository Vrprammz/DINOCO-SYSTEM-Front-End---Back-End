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

**Status**: 28/75+ POST endpoints integrated (~37% of mutating REST surface).

Cumulative test coverage: 106 contract test cases (3-9 per endpoint depending
on field count + bulk semantics). See `tests/helpers/IdempotencyEndpointContractTest.php`.

**Tracker**: see [`docs/audit/IDEMPOTENCY-COVERAGE.md`](../audit/IDEMPOTENCY-COVERAGE.md) for the full list of integrated + pending endpoints + recommended next picks.

**Recommendation**: Continue with `combined-slip-upload` / `combined-invoice-gen` /
`recalculate-total` / `delete-ticket` / `import-distributors` in Round 29 if no
production issues observed. Pivot candidates: Sentry canary observation / Vite
LIFF bundle staging / B2F CPT final drop (target 2026-05-02 day 14 from
Phase 4 migration).

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
