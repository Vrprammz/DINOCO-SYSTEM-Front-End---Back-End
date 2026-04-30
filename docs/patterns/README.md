# DINOCO Reusable Patterns Library

[← Back to docs](../) | [← Audit Retrospective](../audit/ROUNDS-1-19-RETROSPECTIVE.md)

Curated patterns extracted from Rounds 1-20 of the audit remediation sprint. Each pattern is battle-tested across multiple snippets and proven to be safe under WordPress + PHP Code Snippets constraints.

## When to use this library

- **Implementing a new feature** — check if your problem matches a pattern below before designing from scratch
- **Reviewing a PR** — verify the diff follows established patterns instead of inventing parallel solutions
- **Onboarding new contributors** — read these in order to internalize the project's idioms

## Pattern index

| # | Pattern | Use when… |
|---|---------|-----------|
| 1 | [Event Delegation](./EVENT-DELEGATION.md) | Replacing inline `onclick=` with parent-level dispatch (UX-H3 closure) |
| 2 | [Cache Priming](./CACHE-PRIMING.md) | Looping over WP_Query results that pull `get_field` / `get_post_meta` / `get_the_title` per row |
| 3 | [Data-Attr Scoping](./DATA-ATTR-SCOPING.md) | Rendering hierarchical DOM (parent/child/grandchild) where shared children appear multiple times |
| 4 | [function_exists Guards](./FUNCTION-EXISTS-GUARDS.md) | Calling helpers that live in another snippet (cross-snippet calls or WP private API) |
| 5 | [Idempotency-Key Wrapper](./IDEMPOTENCY-KEY.md) | Adding deduplication to a POST endpoint without breaking backward compat |

## How patterns relate

```
Event Delegation  ──depends on──▶  Data-Attr Scoping
                                   (data-action / data-id selectors)

Cache Priming     ──depends on──▶  function_exists Guards
                                   (update_meta_cache is WP private API)

Idempotency-Key   ──depends on──▶  function_exists Guards
                                   (helper lives in separate snippet)
```

## How to add a new pattern

When a recurring solution emerges across 3+ snippets:

1. Create a new file in `docs/patterns/` named `KEBAB-CASE.md`
2. Use the same structure as existing patterns:
   - **Problem** — what bug class this prevents
   - **Solution** — code skeleton
   - **Used in** — concrete file references with version numbers
   - **Gotchas** — known edge cases
   - **Anti-patterns** — what NOT to do
3. Add a row to the index table above
4. Update `docs/audit/ROUNDS-*-RETROSPECTIVE.md` "Patterns Established" section
5. Cross-link from the relevant CLAUDE.md gotcha entry

## Version policy

- Pattern docs are evergreen — they describe an idiom, not a snapshot
- When the canonical implementation changes (e.g. a helper signature evolves), update the doc and bump the version reference inline
- Do NOT delete a pattern doc when superseded — add a "Deprecated" banner and link to the replacement

## Quick reference

| Symptom | Likely pattern |
|---------|---------------|
| `onclick="..."` repeated 50+ times in a render loop | Event Delegation |
| Slow admin tab (>2s TTFB) on a list view | Cache Priming |
| Shared child renders only under one parent in the UI | Data-Attr Scoping |
| Fatal error on rollback "function not found" | function_exists Guards |
| Duplicate orders in DB on flaky network | Idempotency-Key Wrapper |
