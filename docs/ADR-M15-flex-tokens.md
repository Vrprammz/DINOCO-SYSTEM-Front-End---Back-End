# ADR M15 — Flex Card Design Tokens (Phase 1)

**Status**: Accepted (Option C+)
**Date**: 2026-04-12
**Sprint**: Sprint 4 (DINOCO Full Loop Review v1 remediation)
**Supersedes**: Original "full refactor" scope from `.second-brain/topics/flex-card-builder-pattern.md`

---

## Context

Full Loop Review v1 Phase 2.31 flagged 128 Flex Card builders as the worst pattern debt in the codebase (M15). The audit proposed extracting a canonical `b2b_flex_bubble($hero, $body, $buttons)` structural helper + color/size constants, then migrating the top-10 largest builders.

## Sprint 4 Phase 0 reality check (2026-04-12)

Phase 0 scanned 80 builder function bodies across the 2 core Flex files and measured uniformity across 8 buckets:

### Count axis: CONFIRMED (first sprint where audit was accurate)

| Metric | Audit | Reality |
|---|---:|---:|
| Top-level builders | 128 | **123** (−4%) |
| Pure dedicated builders (Snippet 1 B2B + B2F) | 62 | **57 + 29 = 86** |
| Sub-component helpers | — | 32 |

### Architectural axis: PARTIALLY CONFIRMED (nuanced)

| Bucket | Unique values | Uniformity | Verdict |
|---|---:|---:|---|
| Colors (hex) | 52 | 0.16 | Chaotic |
| Button colors | 32 | 0.19 | Chaotic |
| Font size | 7 | 0.40 | Chaotic |
| Spacing | 7 | 0.43 | Chaotic |
| Padding | 8 | 0.48 | Chaotic |
| Button style | 3 | 0.52 | Drifted |
| Bubble size | 2 | 0.80 | Moderate |
| Font weight | 1 | 1.00 | Uniform |
| **Average** | — | **0.50** | **Boundary** |

**Key insight**: drift is concentrated in **colors** (0.16 uniformity), not in **structure** (bubble size 0.80, font weight 1.00). 52 unique hex codes for ~8 semantic roles. A structural `b2b_flex_bubble()` wrapper would add ceremony without fixing the real drift.

## Decision

**Option C+ — Color constants + header helper + 3 POC migrations + lint convention.**

### What we build

1. **12 color token constants** in `[B2B] Snippet 1` derived from Phase 0.1b histogram data:
   - 4 semantic: success `#16A34A`, danger `#DC2626`, warning `#F59E0B`, info `#2563EB`
   - 3 text grays: dark `#1E293B`, mid `#64748B`, light `#94A3B8`
   - 3 header backgrounds: admin `#1E293B`, accent `#1E40AF`, purple `#7C3AED`
   - 2 foundational: white `#FFFFFF`, separator `#E2E8F0`

2. **`b2b_flex_header($title, $subtitle, $bg_color_token)` helper** (~15 lines) — the most-duplicated structural fragment, saves ~8 lines per builder and enforces token usage at the header level.

3. **3 POC migrations** (L9/M22-safe builders):
   - `b2b_build_flex_daily_summary` (167 LoC, highest-traffic admin Flex)
   - `b2f_build_flex_delivered_detail` (122 LoC, B2F cross-module proof)
   - `b2b_build_flex_command_menu_admin` (97 LoC, carousel edge case)

4. **Lint comment convention**: `// B2B_FLEX_COLOR: hardcoded` marker on intentionally non-tokenized colors.

### What we explicitly do NOT build

- `b2b_flex_bubble()` structural wrapper — structure is already 0.80+ uniform
- Mass migration of 86 builders — 3 POC proves the pattern; incremental adoption as builders are touched for other reasons
- Spacing/typography token constants — LINE Flex uses semantic values (`'sm'`, `'bold'`) that are already self-documenting; wrapping in `B2B_FLEX_SPACE_SM` adds verbosity without value

### Rejected options

| Option | Why rejected |
|---|---|
| A (full refactor) | Structure is already uniform (0.80+); 86-builder migration is high-risk for marginal value. Color tokens alone capture 80% of the drift. |
| B (lint-only) | Colors ARE chaotic (0.16) — lint alone doesn't fix existing drift, just prevents new drift. Too passive given 52 unique hex codes. |
| D (observability-first) | We know which builders exist and what colors they use from Phase 0 histograms — no need to defer to production traffic data. This is a design problem, not a usage-frequency problem. |

## Token values (from Phase 0.1b histogram, not guesses)

```
Color histogram (80 builder bodies, 507 occurrences):
#16A34A  81 uses (16.0%) → B2B_FLEX_COLOR_SUCCESS
#64748B  72 uses (14.2%) → B2B_FLEX_COLOR_TEXT_MID
#DC2626  45 uses ( 8.9%) → B2B_FLEX_COLOR_DANGER
#1E293B  39 uses ( 7.7%) → B2B_FLEX_COLOR_TEXT_DARK / B2B_FLEX_COLOR_HEADER_ADMIN
#475569  33 uses ( 6.5%) → (variant of TEXT_MID — consolidation target)
#2563EB  28 uses ( 5.5%) → B2B_FLEX_COLOR_INFO
#F59E0B  28 uses ( 5.5%) → B2B_FLEX_COLOR_WARNING
#94A3B8  26 uses ( 5.1%) → B2B_FLEX_COLOR_TEXT_LIGHT
#333333  16 uses ( 3.2%) → (variant of TEXT_DARK — consolidation target)
#1E40AF   7 uses ( 1.4%) → B2B_FLEX_COLOR_HEADER_ACCENT
#7C3AED   8 uses ( 1.6%) → B2B_FLEX_COLOR_HEADER_PURPLE
#FFFFFF   3 uses ( 0.6%) → B2B_FLEX_COLOR_WHITE
```

Outliers to consolidate in future sprints:
- `#333333`, `#111111` → merge to `B2B_FLEX_COLOR_TEXT_DARK` (#1E293B)
- `#475569`, `#666666` → merge to `B2B_FLEX_COLOR_TEXT_MID` (#64748B)
- `#888888`, `#999999` → merge to `B2B_FLEX_COLOR_TEXT_LIGHT` (#94A3B8)

## Consequences

- New builders should use token constants; existing builders adopt incrementally
- 3 POC migrations demonstrate the pattern; pixel-diff verifies zero visual regression
- Future sprints can grep `// B2B_FLEX_COLOR: hardcoded` to find intentional exceptions vs forgot-to-tokenize
- L9/M22 postback data strings are NOT touched by color-only token replacement

## References

- Full Loop Review v1 Phase 2.31 (M15 pattern scan)
- `.second-brain/topics/flex-card-builder-pattern.md` (original Option A — superseded)
- Phase 0.1b histogram data (this ADR)
- Sprint 3 ADR-M17 (precedent for Phase 0 reality → scope revision)
