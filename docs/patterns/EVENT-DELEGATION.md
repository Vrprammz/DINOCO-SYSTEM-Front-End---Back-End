# Pattern: Event Delegation

[← Patterns index](./README.md)

## Problem

Inline `onclick=` / `onchange=` / `oninput=` handlers were a recurring source of three classes of bugs:

1. **XSS surface area** — any value interpolated into the handler attribute had to be `esc_attr` + `esc_js` + JSON-aware escaped. One missing escape = XSS.
2. **CSP incompatibility** — Content Security Policy `script-src 'self'` blocks inline handlers entirely.
3. **Memory leaks on dynamic re-render** — when the parent container re-renders 100 rows, each row re-parses the inline string. Not catastrophic but wasteful.

UX-H3 (audit 2026-04-17) called this out across 75+ sites in 9 snippets. Phase 6 closed all of them.

## Solution

Replace inline handlers with **module-level event delegation** using `data-action` attributes. The pattern:

```javascript
// Once per module — idempotent guard prevents duplicate handlers on reload
if (!container._b2bBoDelegated) {
  container.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id; // string — parse if numeric needed

    if (action === 'bo-confirm-full') {
      _b2bCfm('ยืนยันออเดอร์เต็มจำนวน?', () => boConfirmFull(parseInt(id, 10)));
    } else if (action === 'bo-reject') {
      _b2bCfm('ยกเลิกออเดอร์?', () => boReject(parseInt(id, 10)));
    } else if (action === 'bo-split') {
      openSplitModal(parseInt(id, 10));
    }
  });
  container._b2bBoDelegated = true;
}
```

Render side becomes pure HTML:

```html
<button class="btn btn-success" data-action="bo-confirm-full" data-id="${esc_attr_id}">ยืนยันเต็ม</button>
<button class="btn btn-warning" data-action="bo-split" data-id="${esc_attr_id}">Split BO</button>
<button class="btn btn-danger"  data-action="bo-reject"      data-id="${esc_attr_id}">ปฏิเสธ</button>
```

## data-attr scoping rules

- `data-action` carries the **verb** (what to do)
- `data-id` carries the **primary identifier** (always string — parse with `parseInt(x, 10)` at the handler)
- Compound args: `data-args='${JSON.stringify({...})}'` — parse with `JSON.parse(target.dataset.args)`
- Per-module prefix: each snippet uses its own action namespace (`bo-*`, `b2f-*`, `inv-*`) to avoid collisions when multiple snippets render in the same admin page

## Module-level idempotent guard

WP admin pages reload module HTML via lazy-load AJAX. Without the guard, the `addEventListener` runs N times per session = duplicate handlers = each click fires N callbacks.

Pattern: tag the container with a custom property (`_b2bBoDelegated`, `_b2fMakersDelegated`). Property name uses the snippet prefix to avoid cross-snippet collision.

```javascript
if (!container._b2bBoDelegated) {
  container.addEventListener('click', handler);
  container._b2bBoDelegated = true;
}
```

## When to use

- 3+ similar handlers in a render loop (rows, cards, table cells)
- Dynamic re-render via AJAX (lazy-load, infinite scroll, modal refresh)
- Confirm-then-act flows where you want a uniform `_b2bCfm` / `_scCfm` wrapper
- Any new admin UI in WP Code Snippets context (CSP-friendly)

## When NOT to use

- One-shot DOM elements (header, footer) with single fixed handler — `.addEventListener` directly on the element is simpler
- Compound onclick edge cases that interleave inline JS expressions (rare — usually a sign the render layer should be refactored)
- React-managed components inside the admin (different paradigm)

## Used in

- **`[B2B] Snippet 16` V.1.15** — BO admin (6 sites + flag-toggle handler refactor, Round 6 commit)
- **`[B2F] Snippet 5` V.7.8** — Makers tab (9 functions, 13+ native confirm/alert calls)
- **`[Admin System] B2F Migration Audit` V.3.14** — Phase 4 controls (7 sites)
- **`[Admin System] DINOCO Manual Invoice System` V.34.4+** — picker rows (Multi-Picker chips + grid cells)
- **`[B2B] Snippet 5` V.32.4** — Flash ops, reprint, bulk ops (14 sites via `_b2bCfm/_b2bAlert` helpers)
- **`[B2B] Snippet 9` V.33.8** — Print settings, RPi commands (9 sites via `_cpCfm/_cpAlert`)
- **`[Admin System] DINOCO Service Center & Claims` V.30.6** — Approval inline updates (16 sites via `_scCfm/_scAlert/_scPrompt`)
- **`[B2B] Snippet 12` V.31.4** — LIFF tracking entry (9 sites via `_liffCfm/_liffAlert`)

## Helper extraction

When the same module has 5+ confirm/alert sites, extract a per-module helper:

```javascript
function _b2bCfm(message, onOk) {
  try {
    if (window.dinocoModal && dinocoModal.confirm) {
      dinocoModal.confirm({ message, onOk });
      return;
    }
  } catch (_) { /* fall through */ }
  if (confirm(message)) onOk();
}

function _b2bAlert(message) {
  try {
    if (window.dinocoModal && dinocoModal.alert) {
      dinocoModal.alert({ message });
      return;
    }
  } catch (_) { /* fall through */ }
  alert(message);
}
```

Benefits:
1. **Native fallback** — if Modal Helpers snippet is rolled back or removed, native dialogs still work
2. **Consistent UX** — one styling source = no theme drift across modules
3. **Concise call sites** — `_b2bCfm('msg', cb)` vs full try/catch boilerplate

## Anti-patterns

```html
<!-- BAD: inline handler with template-literal interpolation -->
<button onclick="boConfirm(${order.id}, '${order.title}')">OK</button>
```
- XSS if `order.title` contains `'` or `</script>`
- Breaks under CSP `script-src 'self'`
- 100 rows = 100 inline parses

```javascript
// BAD: re-attaches listener on every render
function renderRows() {
  rows.forEach(r => {
    const btn = document.createElement('button');
    btn.addEventListener('click', () => doAction(r.id));
    container.appendChild(btn);
  });
}
```
- Listener leak if `renderRows()` is called multiple times without removing old buttons
- 1000 listeners = perceptible lag on large lists

## Migration checklist

When migrating an existing module:

1. Grep for `onclick=` / `onchange=` / `oninput=` / `onerror=` in the render functions
2. For each match, derive a `data-action` name from the function being called
3. Add a module-level delegated handler at the bottom of the `init()` or shortcode renderer
4. Replace inline handler with `data-action="${action}" data-id="${esc_attr_id}"`
5. Test with 0 and N rows + dynamic AJAX reload (lazy-load admin tab switch)
6. Verify with the `inline-handler-regression.test.js` Jest test (Round 21 — fails CI if you accidentally introduce a new inline handler)

## See also

- [Pattern: Data-Attr Scoping](./DATA-ATTR-SCOPING.md) — for hierarchical DOM tagging
- [Pattern: function_exists Guards](./FUNCTION-EXISTS-GUARDS.md) — for the `dinocoModal` fallback chain
- `tests/jest/inline-handler-regression.test.js` — automated guard against regressions
- Audit doc: `docs/audit/ROUNDS-1-19-RETROSPECTIVE.md` Section "Patterns Established #1"
