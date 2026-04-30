# Pattern: function_exists Guards

[← Patterns index](./README.md)

## Problem

DINOCO is deployed as 40+ WordPress Code Snippets (no Composer, no autoloader, no build step). Each snippet is independently activatable / deactivatable / synced. Cross-snippet calls have three failure modes:

1. **Sync ordering race** — Snippet B calls `helper_from_snippet_a()` but Snippet A hasn't synced yet. Fatal `Call to undefined function`.
2. **Rollback fragility** — Admin rolls back Snippet A. All callers of its helpers crash.
3. **WordPress private API drift** — Functions like `_prime_post_caches`, `update_meta_cache` are technically not part of the public contract. They've been stable for years but a stripped install or a future deprecation breaks the snippet.

Phase 5+ closed this universally with the `function_exists` guard pattern.

## Solution

Wrap every cross-snippet helper call AND every WP private-API call in `function_exists()`:

```php
if (function_exists('dinoco_idempotency_extract_key')) {
    $idem_key = dinoco_idempotency_extract_key($req);
} else {
    $idem_key = null; // graceful no-op
}

if (function_exists('_prime_post_caches')) {
    _prime_post_caches($order_ids, false, true);
}

if (function_exists('b2f_is_flag_enabled') && b2f_is_flag_enabled('order_intent')) {
    // V.7.0 path
}
```

## When to use

- **Cross-snippet helper calls** — any function defined in another snippet
- **WP private API** — anything starting with `_` (underscore prefix indicates private)
- **Optional integrations** — Sentry, Modal Helpers, Idempotency, GDPR (might not be activated)
- **Class detection** — `if (class_exists('\Sentry\Client'))` for SDK-gated paths
- **Method detection** — `if (method_exists('DINOCO_Catalog', 'flush_memo'))` (round 4 caught a typo using `function_exists` — must use `method_exists` for class methods)

## When NOT to use

- Functions defined in the same snippet (always available)
- WordPress core public API (`get_post_meta`, `wp_remote_post`, etc.) — guaranteed stable
- Inside an `add_action`/`add_filter` callback if the callback name itself depends on the helper (the action wouldn't fire without the helper)

## Naming convention check

Use the right detection function for the right symbol type:

| Symbol | Check | Wrong (silent bug) |
|--------|-------|--------------------|
| Standalone function | `function_exists('foo')` | — |
| Class | `class_exists('Foo')` | `function_exists('Foo')` returns false even if class exists |
| Class method | `method_exists('Foo', 'bar')` | `function_exists('Foo::bar')` always returns false |
| Constant | `defined('FOO')` | `isset(FOO)` raises notice |
| Variable | `isset($foo)` / `array_key_exists('foo', $arr)` | — |

**Round 4 bug** (commit `164d00f`): code-reviewer found `function_exists('DINOCO_Catalog::flush_memo')` — always false. Fixed to `class_exists + method_exists`.

## Cross-snippet calls without sync ordering issue

WP Code Snippets sync via GitHub webhook in alphabetical order by filename. Order is not guaranteed across syncs (especially manual reloads). Pattern:

```php
// Snippet A: defines helper
function dinoco_idempotency_check($key, $namespace, $body) {
    // ...
}
```

```php
// Snippet B: caller (any snippet)
function place_order_handler($req) {
    if (function_exists('dinoco_idempotency_check')) {
        $check = dinoco_idempotency_check($key, 'place-order', $body);
        if (is_wp_error($check)) return $check;
    }
    // ... continue with regular flow ...
}
```

If Snippet A hasn't synced yet:
- `function_exists` returns false
- Caller skips idempotency check (graceful no-op — additive feature)
- Order placement still works
- Next page load (Snippet A now synced) → idempotency activates

If Snippet A is rolled back:
- Same path — graceful no-op
- Calling code doesn't fatal

## WP private API guards (mandatory)

WordPress has many functions prefixed with `_` (underscore). They're internal helpers but documented. Guard them:

```php
// _prime_post_caches — populate post + meta cache for a list of IDs
if (function_exists('_prime_post_caches')) {
    _prime_post_caches($ids, false, true);
}

// update_meta_cache — explicit meta cache priming
if (function_exists('update_meta_cache')) {
    update_meta_cache('post', $ids);
}

// _wp_translate_postdata — postmeta sanitizer (rarely used)
if (function_exists('_wp_translate_postdata')) {
    $sanitized = _wp_translate_postdata(false, $data);
}
```

Round 15 ITEM A (commit `bc38baa`) added these guards across all cache-priming sites.

## Helper detection in lazy-load scenarios

Admin Dashboard lazy-loads modules via AJAX. Each module's PHP code runs in isolation. Cross-module calls must guard:

```php
// In Snippet 16 (BO admin) calling helper from Snippet 1
if (function_exists('b2b_compute_dealer_price')) {
    $price = b2b_compute_dealer_price($base, $rank, $sku_data);
} else {
    $price = $base; // fallback to retail
}
```

If Snippet 1 hasn't loaded for this admin page (lazy-load order), Snippet 16 still functions — just with degraded pricing logic.

## Defensive `dinocoModal` fallback

JavaScript pattern (mirror of PHP guards):

```javascript
function _b2bCfm(message, onOk) {
    try {
        if (window.dinocoModal && dinocoModal.confirm) {
            dinocoModal.confirm({ message, onOk });
            return;
        }
    } catch (_) { /* fall through to native */ }
    if (confirm(message)) onOk();
}
```

If Modal Helpers snippet is rolled back:
- `window.dinocoModal` is undefined
- Try block returns early
- Falls through to native `confirm()`
- User sees old browser dialog instead of styled modal — degraded UX, but functional

## Used in

All Phase 5+ snippets:

- **`[Admin System] DINOCO Idempotency Helper` V.1.0** — caller wraps all 5 helpers
- **`[Admin System] DINOCO Flag Audit Log` V.1.0** — `b2f_log_flag_change` callers
- **`[Admin System] DINOCO Modal Helpers` V.1.0** — JS fallback to native dialogs
- **`[Admin System] DINOCO Observability` V.1.0** — `class_exists('\Sentry\Client')` SDK gate
- **`[System] DINOCO GDPR Data Requests` V.1.0** — `dinoco_gdpr_get_client_ip` etc.
- **`[System] DINOCO LIFF Asset Loader` V.1.0** — `dinoco_liff_enqueue` helper

Round 13 cross-rounds audit confirmed ZERO regressions across all guards.

## Benefits

1. **Instant rollback** — delete a snippet → others gracefully no-op (no fatal cascade)
2. **Foundation-deploy-ordering protection** — deploy helper snippet first, integrators second; integrators tolerate missing helpers
3. **Optional features** — Sentry, Modal Helpers, Idempotency can be flag-gated without breaking core paths
4. **Stripped install support** — WP private APIs may be removed in custom deployments; guards prevent fatals

## Anti-patterns

```php
// BAD: bare cross-snippet call
$check = dinoco_idempotency_check($key, 'place-order', $body); // FATAL if helper missing
```

```php
// BAD: function_exists for class method
if (function_exists('DINOCO_Catalog::flush_memo')) { // ALWAYS FALSE
    DINOCO_Catalog::flush_memo();
}

// GOOD: class_exists + method_exists
if (class_exists('DINOCO_Catalog') && method_exists('DINOCO_Catalog', 'flush_memo')) {
    DINOCO_Catalog::flush_memo();
}
```

```php
// BAD: defined() for function
if (defined('dinoco_helper')) { // ALWAYS FALSE — defined() is for constants
    dinoco_helper();
}
```

```php
// BAD: bare WP private API
_prime_post_caches($ids, false, true); // FATAL on stripped install
```

```javascript
// BAD: bare dinocoModal call
dinocoModal.confirm({ message, onOk }); // TypeError if Modal Helpers rolled back
```

## Migration checklist

When adding a new cross-snippet call:

1. Identify the symbol type (function / class / method / constant)
2. Use the matching detection (`function_exists` / `class_exists + method_exists` / `defined`)
3. Decide fallback behavior:
   - **Skip silently** (additive feature) — `if (function_exists(...))` { do }
   - **Fall back to alternative** — `if (function_exists(...)) { ... } else { /* alternate */ }`
   - **Hard fail** (rare — only if helper is mandatory) — log error + return early
4. Document the dependency in the snippet's header comment
5. Add a smoke test: temporarily rename the helper (simulating rollback), verify caller doesn't fatal

## See also

- [Pattern: Cache Priming](./CACHE-PRIMING.md) — uses `_prime_post_caches` / `update_meta_cache` guards
- [Pattern: Idempotency-Key Wrapper](./IDEMPOTENCY-KEY.md) — uses helper guards for graceful fallback
- WordPress reference: [private functions](https://developer.wordpress.org/reference/functions/_prime_post_caches/)
- Audit doc: `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` Section "Patterns Established #4"
