# Pattern: Cache Priming

[← Patterns index](./README.md)

## Problem

The naive WordPress N+1 anti-pattern. A loop that pulls metadata per post compounds DB queries:

```php
$orders = get_posts(['post_type' => 'b2b_order', 'numberposts' => 50]);
foreach ($orders as $order) {
    $items     = get_field('items', $order->ID);            // 1 query
    $dist_id   = get_post_meta($order->ID, '_dist_id', true); // 1 query
    $title     = get_the_title($order->ID);                  // 1 query (post object cache miss)
    $status    = get_post_meta($order->ID, '_b2b_status', true); // 1 query
    // ... build response
}
```

50 orders × 4 queries = **200 DB roundtrips per request**. Average admin tab TTFB: 2.5-4 seconds.

PERF-H8 (audit 2026-04-17) identified 6+ admin endpoints with this pattern. Rounds 13-15 closed all of them.

## Solution

Prime WP's object cache **once** before the loop:

```php
$orders = get_posts(['post_type' => 'b2b_order', 'numberposts' => 50]);

if (!empty($orders) && function_exists('_prime_post_caches')) {
    $order_ids = wp_list_pluck($orders, 'ID');
    _prime_post_caches($order_ids, false, true); // post + meta in 2 queries

    if (function_exists('update_meta_cache')) {
        update_meta_cache('post', $order_ids); // explicit redundant safety
    }

    // Pre-cache distributor posts referenced by orders (separate post type)
    $dist_ids = [];
    foreach ($orders as $o) {
        $d = get_post_meta($o->ID, '_dist_id', true);
        if ($d) $dist_ids[] = (int)$d;
    }
    $dist_ids = array_unique(array_filter($dist_ids));
    if (!empty($dist_ids)) {
        _prime_post_caches($dist_ids, false, true);
    }
}

foreach ($orders as $order) {
    // get_field / get_post_meta / get_the_title all hit object cache now — 0 queries
    $items   = get_field('items', $order->ID);
    $dist_id = get_post_meta($order->ID, '_dist_id', true);
    $title   = get_the_title($order->ID);
    $status  = get_post_meta($order->ID, '_b2b_status', true);
}
```

After fix: **2-3 DB queries total** (post fetch + meta prime + distributor prime). Admin tab TTFB drops 90%+ on large lists.

## Why both `_prime_post_caches` and `update_meta_cache`?

`_prime_post_caches($ids, $update_term_cache=false, $update_meta_cache=true)` is the canonical WP function. It calls `update_meta_cache` internally — so the explicit second call is redundant.

**But** the explicit call provides defense-in-depth:
- Some object cache drop-ins (Redis, Memcached) have non-standard behavior under high concurrency
- Calling `update_meta_cache` separately ensures the meta cache is fully populated even if the bulk prime had a cache miss
- The cost is one cache check (microseconds) — worth the safety margin

## When to use

- Loop iterates 10+ posts
- Loop calls `get_field`, `get_post_meta`, or `get_the_title` (all hit object cache when primed)
- Endpoint is on the hot path (admin dashboard tabs, daily summary cron, BO queue)
- Endpoint already does `WP_Query` or `get_posts` — priming is additive

## When NOT to use

- Loop iterates < 5 posts (priming overhead > benefit)
- Loop calls only `$post->post_title` etc. (already in $post object, no extra query)
- Function returns early on first match (no benefit if you don't iterate the full list)
- WP_Query already with `'update_post_meta_cache' => true` (default; verify before adding manual prime)

## Distributor / Maker pre-resolve pattern

When orders reference distributor posts (B2B) or maker posts (B2F), prime those **separately**:

```php
$dist_ids = [];
foreach ($orders as $o) {
    $d = get_post_meta($o->ID, '_dist_id', true);
    if ($d) $dist_ids[] = (int)$d;
}
$dist_ids = array_unique(array_filter($dist_ids));
if (!empty($dist_ids) && function_exists('_prime_post_caches')) {
    _prime_post_caches($dist_ids, false, true);
}
```

Without this, the inner loop's `get_field('distributor_name', $dist_id)` re-triggers the N+1 across distributor posts.

## function_exists guards (mandatory)

`_prime_post_caches` is part of WP's "private" API (underscore prefix). It's been stable since WP 3.0 but technically not part of the public contract. Always wrap:

```php
if (function_exists('_prime_post_caches')) {
    _prime_post_caches($ids, false, true);
}
```

Same for `update_meta_cache`. Round 15 ITEM A added these guards across all priming sites — graceful no-op on stripped WP installs.

## Used in

- **`[B2B] Snippet 16` V.2.9** — `/bo-pending-review` endpoint (50 orders × 4 queries → 3 queries total)
- **`[B2B] Snippet 7`** — daily summary cron (~500 orders × 4 → ~10 queries)
- **`[B2F] Snippet 2`** — PO list endpoint (maker posts pre-resolved)
- **`[LIFF AI] Snippet 1` V.1.10** — `/claims` endpoint (claim_ticket CPT + photo meta)

## Measurement

Before adding priming, measure with `Query Monitor` plugin or `SAVEQUERIES` constant:

```php
define('SAVEQUERIES', true);
// ... endpoint runs ...
global $wpdb;
error_log('[Perf] queries=' . count($wpdb->queries) . ' time=' . array_sum(array_column($wpdb->queries, 1)));
```

Target: **< 10 queries** for any single REST endpoint, **< 50 queries** for any cron job iterating 1000 records.

## Anti-patterns

```php
// BAD: priming inside the loop (no benefit — already too late)
foreach ($orders as $order) {
    _prime_post_caches([$order->ID], false, true);
    $items = get_field('items', $order->ID);
}
```

```php
// BAD: priming without function_exists — fatal on rollback / stripped install
_prime_post_caches($ids, false, true);
```

```php
// BAD: priming term cache when you don't read terms (wasted query)
_prime_post_caches($ids, true, true); // 2nd arg = update_term_cache — defaults to false for a reason
```

## Migration checklist

When fixing an endpoint:

1. Add `define('SAVEQUERIES', true);` temporarily, hit endpoint, count `$wpdb->queries`
2. Identify the inner-loop meta calls (`get_field`, `get_post_meta`, `get_the_title`)
3. Pluck post IDs after the outer `get_posts` / `WP_Query`
4. Insert priming block with `function_exists` guard before the loop
5. If inner loop references foreign post types (distributor, maker), prime those too
6. Re-measure — target 90%+ reduction
7. Verify endpoint behavior unchanged (response shape identical)

## See also

- [Pattern: function_exists Guards](./FUNCTION-EXISTS-GUARDS.md) — for the `_prime_post_caches` guard rationale
- WordPress Codex: [`_prime_post_caches`](https://developer.wordpress.org/reference/functions/_prime_post_caches/)
- WordPress Codex: [`update_meta_cache`](https://developer.wordpress.org/reference/functions/update_meta_cache/)
- Audit doc: `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` Section "Patterns Established #2"
