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

```
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

## Used in

- **`[Admin System] DINOCO Idempotency Helper` V.1.0** (Round 18 foundation, 5 helpers + 25 unit tests)
- **`[B2B] Snippet 3` V.42.9** — `place-order` (Round 19, mobile LIFF dup risk)
- **`[B2B] Snippet 3` (manual-flash-create)** — RPi warehouse Wi-Fi dup risk
- **`[B2F] Snippet 2` V.11.10** — `create-po` (admin LIFF retry risk)

**Status**: 3/72+ POST endpoints integrated. Remaining deferred until 1-2 weeks production canary observed (per Round 19 recommendation).

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
