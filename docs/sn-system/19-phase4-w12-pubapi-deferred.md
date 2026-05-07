# 🚫 Phase 4 W12 — F#15 Public API Gateway: DEFERRED (Q22)

**Date**: 2026-05-07
**Plan**: v2.13 §Phase 4 W12
**Boss decision**: Q22 — "ยังไม่มีแผนใช้" → defer indefinitely

---

## 🎯 What was planned

NEW snippet `[Admin System] DINOCO Public API Gateway` (V.0.1):
- Schema `wp_dinoco_sn_api_tokens` + `wp_dinoco_sn_api_log` (already in V.0.4 manager schema dump — NOT installed)
- Tab 12 admin UI for partner token management (issue/rotate/IP allowlist)
- 3 public endpoints under separate namespace `/dinoco-sn-api/v1/`:
  - `POST /verify` — body `{sn, hmac_sig}` → `{valid, status, top_set, warranty_active}` (no PII)
  - `GET /claim-status?sn=...&phone=...` → claim status (limited)
  - `GET /stolen-check?sn=...` → stolen status only
- HMAC-SHA256 signing + IP allowlist + per-token rate limit
- Audit log + 90d retention
- OpenAPI 3.1 spec + Postman collection + sample code (Python/Node/PHP)
- Partner onboarding (1 insurance + 1 dealer test)

Effort estimate: ~30h.

---

## 🚫 Why deferred

Boss Q22 (2026-05-04): "ยังไม่มีแผนใช้" — no insurance/dealer/government partnership commitments yet.

Building Public API without a partner = wasted infrastructure + ongoing security maintenance burden
(token rotation, IP allowlist drift, rate limit tuning, OWASP ASVS Level 2 compliance for external API).

---

## ✅ What WAS done

Internal-facing endpoints continue working — Q23 stolen-verify endpoint flipped from `perm_public` → `perm_admin`
(commit `8d97fdf` — V.0.23 manager). Customer LIFF `/lookup/{sn}` (admin/customer scope, NOT a partner API)
remains active.

Schema rows for `wp_dinoco_sn_api_tokens` + `wp_dinoco_sn_api_log` exist in
`[Admin System] DINOCO Production SN Manager` schema definition — table NOT installed
(no `dbDelta` call until pubapi snippet ships).

---

## 🔓 Activation path (when boss approves)

When DINOCO signs first partner agreement:

1. Create NEW snippet `[Admin System] DINOCO Public API Gateway` from scratch following v2.13 §F#15 spec
2. Install schema via lazy `admin_init` dbDelta
3. `wp option update dinoco_sn_pubapi_enabled 1` (master kill switch — default OFF)
4. Issue first partner token via Tab 12 admin UI
5. Onboard partner with OpenAPI spec + sample code
6. Monitor `wp_dinoco_sn_api_log` for first 7 days

Estimated activation effort: ~30h dev + 1 wk partner integration testing.

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` Q22
- `docs/sn-system/18-phase3-w11.3-acceptance-test.md` (Phase 3 closure)
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 4 W12 + §F#15

---

## 📅 Phase 4 path forward

W12 = **SKIP** (this deferral note)
W13 = ✅ F#16 Demand Forecast — proceed (active scope, ~25h)
W14 = ✅ OpenClaw chatbot refactor + GDPR extension — proceed (~25h)

Phase 4 effective duration: 2 wk instead of 3 wk (W12 deferral saves 1 wk).
