# Pattern: Data-Attr Scoping

[← Patterns index](./README.md)

## Problem

DD-3 (Design Decision #3) allows a child SKU to be shared across multiple parent SETs. Example: leaf `DNCGNDPRO5500` is a member of `DNCSETXL7500X001H`, `DNCSETNX500E002`, and `DNCSETNX500EX001`.

When rendering a hierarchical product list, the same leaf appears under each parent. Naive implementation:

```javascript
// BAD: dedupes shared children — only renders under first parent
const placed = {};
sortedRows.forEach(row => {
  if (placed[row.sku]) return;
  placed[row.sku] = true;
  appendRow(row);
});
```

Result: expanding SET_A shows `DNCGNDPRO5500`, but SET_B's expand toggle finds **no matching DOM rows** because the leaf was deduped.

V.43.6 (Inventory Stock Management, 2026-04-13) closed this with explicit DOM hierarchy attrs.

## Solution

Each rendered row carries `data-render-parent` (and optionally `data-render-grandparent`) identifying which parent's subtree owns this DOM instance. Shared children are rendered **once per parent SET**, each with distinct attrs.

```html
<tr class="stock-row stock-child-of-DNCSETXL7500X001H"
    data-sku="DNCGNDPRO5500"
    data-render-parent="DNCSETXL7500X001H">
  <!-- ... -->
</tr>
<tr class="stock-row stock-child-of-DNCSETNX500E002"
    data-sku="DNCGNDPRO5500"
    data-render-parent="DNCSETNX500E002">
  <!-- duplicate row, scoped to a different parent -->
</tr>
```

Toggle handler scopes by parent class:

```javascript
function toggleStockChildren(parentSku) {
  // Subtree scope: only rows with this exact render-parent
  const rows = document.querySelectorAll(`.stock-child-of-${parentSku}`);
  rows.forEach(row => {
    row.style.display = row.style.display === 'none' ? '' : 'none';
  });
}
```

## CSS class naming scheme

```
.stock-child-of-<PARENT_SKU>          — direct child rows
.stock-grandchild-of-<PARENT_SKU>     — grandchild rows under <PARENT_SKU>'s subtree
```

SKU is uppercase (matches `dinoco_sku_relations` key pattern). Both SET-direct and indirect grandchild rows tag the **top-level** SET they belong to, enabling subtree expand/collapse with a single selector.

## Outer card pattern

The outer card / accordion header carries shared attrs:

```html
<div class="set-accordion is-expanded"
     data-sku="DNCSETXL7500X001H"
     data-product-type="set">
  <div class="set-header" data-action="toggle-set">▼ DNCSETXL7500X001H — กันล้ม X-Plus</div>
  <div class="set-body">
    <!-- child rows here -->
  </div>
</div>
```

Child handlers walk up via `closest()`:

```javascript
container.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-set') {
    const set = e.target.closest('.set-accordion');
    const sku = set.dataset.sku;
    set.classList.toggle('is-expanded');
    toggleStockChildren(sku);
  }
});
```

## Per-module whitelist scoping

When multiple snippets render in the same admin page (e.g. Admin Dashboard with 6 lazy-loaded modules), each uses a **module-prefixed class**:

```
.b2b-bo-row             — BO admin module
.b2f-makers-row         — B2F Makers module
.stock-row              — Inventory Stock Management
.dnc-claim-row          — Service Center & Claims
```

This prevents cross-module CSS collisions when global styles target generic class names.

## JSON-encoded args for compound dispatch

When a single `data-action` needs multiple parameters:

```html
<button data-action="bo-cancel-item"
        data-args='{"order_id":12345,"item_index":2,"sku":"DNCGNDPRO5500"}'>
  ยกเลิก
</button>
```

```javascript
const target = e.target.closest('[data-action]');
const args = JSON.parse(target.dataset.args || '{}');
boCancelItem(args.order_id, args.item_index, args.sku);
```

PHP renderer must use `wp_json_encode` + `esc_attr`:

```php
echo '<button data-args="' . esc_attr(wp_json_encode([
    'order_id'   => (int)$order->ID,
    'item_index' => (int)$idx,
    'sku'        => $sku,
])) . '">';
```

## When to use

- Hierarchical DOM (parent/child/grandchild) where shared instances appear multiple times
- Subtree expand/collapse / show/hide
- DD-3 shared-child correctness (B2F maker products, B2B inventory)
- Compound action dispatch (3+ parameters per button)

## When NOT to use

- Flat lists without parent/child relationship
- Single-level dropdown / single-action buttons
- React-managed components (use props instead)

## Used in

- **Inventory Stock Management V.42.26+** — DD-3 shared child rendering, V.43.6 forward-lookup `parent_skus[]` indexing
- **`[B2F] Snippet 5` V.6.5+** — Makers tab accordion (SET headers + per-row delete button on auto-synced)
- **`[B2B] Snippet 8` V.5.0+** — LIFF E-Catalog SET Detail (shared badge "🔗 ใช้ใน N ชุด")
- **`[Admin System] DINOCO Service Center & Claims` V.30.6** — claim line items with approval inline updates

## Forward-lookup indexing

V.43.6 (commit `e10ff0d`) refactored from reverse-lookup to forward-lookup:

**Before** (reverse-lookup, single parent):
```javascript
child_map[row.parent_sku].push(row);  // shared child indexed under FIRST parent only
```

**After** (forward-lookup via `parent_skus[]`):
```javascript
row.parent_skus.forEach(parent => {
  const upper = parent.toUpperCase();
  if (!child_map[upper]) child_map[upper] = [];
  child_map[upper].push(row);  // shared child indexed under EVERY parent
});
```

API contract (Snippet 2 V.9.10 `maker-products`): each row returns `parent_skus: ["SET_A", "SET_B"]` (array, not single). Rendering iterates `parent_skus[]` to emit duplicate DOM rows.

## Pagination group-aware slicing

V.43.3 (commit `e10ff0d`) fixed the bug where pagination cut SET + descendants across pages:

```javascript
// BAD: slice flat sortedArray
const page = sortedArray.slice(start, end);
// SET appears on page 1, its children on page 2 — broken

// GOOD: build groups, slice groups
const groups = []; // [[SET_A, child_a1, gc_a1], [SET_B, ...], [single_X], ...]
const page = groups.slice(start, end).flat();
```

Each group = SET + all descendants OR a singleton. Pagination preserves hierarchy integrity.

## Anti-patterns

```javascript
// BAD: dedupe shared children with placed{} tracker
const placed = {};
rows.forEach(r => {
  if (placed[r.sku]) return;  // shared child rendered ONCE under first parent
  placed[r.sku] = true;
  render(r);
});
```

```html
<!-- BAD: implicit parent inference via DOM walk (fragile) -->
<tr class="stock-row" data-sku="LEAF">
  <!-- which parent's subtree? handler must walk up to nearest .set-accordion -->
</tr>
```

```javascript
// BAD: per-row addEventListener (10+ rows = 10+ listeners — leak on re-render)
rows.forEach(r => {
  r.element.addEventListener('click', () => doAction(r.sku));
});
```

## Search expansion gotcha

V.43.5 (Stock Management): search by SKU returns matched SET only (no children) → expand toggle finds 0 children.

Fix: when search-matched set includes a SET SKU, walk `sku_relations` recursive → include descendants in SQL `IN (...)` clause:

```php
if (in_array($matched_sku, $set_skus)) {
    $descendants = dinoco_get_all_descendants($matched_sku); // recursive walk
    $expanded_skus = array_merge($expanded_skus, $descendants);
}
```

## Migration checklist

When introducing a new hierarchical render:

1. Decide: do shared children appear multiple times in the UI?
2. If yes → emit one DOM row per (sku, parent) tuple with `data-render-parent`
3. CSS class scheme: `<module>-child-of-<PARENT_SKU>` + `<module>-grandchild-of-<PARENT_SKU>`
4. Toggle handler uses `.querySelectorAll('.<module>-child-of-' + parentSku)`
5. Pagination logic groups SET + descendants before slicing
6. Search expansion includes descendants in DB query
7. Smoke test: shared child appears N times where N = # of SETs containing it

## See also

- [Pattern: Event Delegation](./EVENT-DELEGATION.md) — for handler dispatch via `data-action`
- DD-3 spec: `CLAUDE.md` Section "B2F DD-3 Shared Child"
- Audit doc: `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` Section "Patterns Established #3"
- Forward-lookup migration: `[Admin System] DINOCO Global Inventory Database` V.43.6 (commit `e10ff0d`)
