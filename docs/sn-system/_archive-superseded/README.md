# 📦 SN System SUPERSEDED Docs Archive

Plans/specs that became obsolete after boss decisions 2026-05-15. Kept for
audit trail + historical context only — DO NOT use as current spec.

Canonical replacement: `../35-boss-final-decisions-2026-05-15.md`

| File | Original Purpose | Why Archived |
|---|---|---|
| `14-q12-skip-pilot-risk-acceptance.md` | Pilot dealer 100-plate sign-off plan | v2.2 simplification (2026-05-04) made S/N standalone — no dealer integration. Boss decision Q12 R2 (2026-05-15): no pilot, flip flag globally with hard-rollback safety net. |
| `16-f8-legal-workstream-prephase1.md` | F#8 Marketplace 8-12wk legal track (tax invoice format / refund policy / VAT compliance) | F#8 scope refactored to non-VAT บัญชีบุคคล (boss 2026-05-15). Legal workstream not needed — personal bank account, plain receipt. |
| `19-q15-role-matrix-uat-plan.md` | Q15 approval delegation 10-user UAT scenarios | Replaced by Role Manager V.0.4 admin UI (matrix checkbox). Boss seeds users directly in production. |
| `20-f9-ltv-privacy-gate-spec.md` | F#9 LTV Dashboard separate backend cap enforcement spec | Existing `dinoco_sn_view_pii` capability already gates PII fields. Boss directive: "มันไปกำหนดสิทธิ์ในระบบได้อยู่แล้วนิ". |
| `28-refund-policy-warranty-extension.md` | F#8 Marketplace refund policy + admin workflow | Merged into `../15-q20-manual-refund-sop.md` — single source of truth for manual refund flow (Facebook DM intake + 4-eyes ฿5K threshold). |
| `29-tax-invoice-format-vat7.md` | Tax invoice GD render spec with VAT 7% line + ภพ.20 number | Cancelled — non-VAT บัญชีบุคคล scope. SN REST V.0.50+ ออก ใบเสร็จธรรมดา HTML แทน (no tax invoice). |

## How to read

Each file has a top banner with status (`SUPERSEDED` / `CLOSED` / `CANCELLED`
/ `MERGED`) and link to the canonical replacement. Body content preserved
as-is — context for "why this path was abandoned" lives in the canonical
file or boss-decisions log.

If you're reading this looking for current marketplace spec → see:
- `../15-q20-manual-refund-sop.md` (refund flow)
- `../35-boss-final-decisions-2026-05-15.md` (binding decisions)
- SN REST API V.0.50+ `/marketplace/*` endpoints (live)
- Warranty Extension Marketplace shortcode V.0.6 LIFF flow
