# Idempotency-Key Coverage Tracker

[← Audit index](./)

> **Purpose**: Track which DINOCO POST endpoints have `X-Idempotency-Key`
> middleware integration. Helps future rounds pick the next batch + lets
> reviewers audit at a glance.

> **Pattern reference**: [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md)

> **Helper snippet**: `[Admin System] DINOCO Idempotency Helper` V.1.1
> (Round 18 foundation, Round 28 cron heartbeat fix)

---

## Status summary

| Metric | Count |
|--------|-------|
| Total integrated endpoints | **129** (+5 new — Round 48 batch 26: auth-admin + brand-voice/entries + brand-voice/entries/batch + onboard/check-group-id + onboard/save. Push toward 70% milestone. 129/196 = 65.8%. Cross-snippet 3-file batch: B2F (1 endpoint) + Brand Voice (2 endpoints) + Distributor Onboarding (2 endpoints — NEW namespace). 30-round sustained campaign Rounds 18-48.) |
| **Total POST endpoints (Round 33 fresh census)** | **196** (+3 since Round 30 — natural growth, see [REST-ENDPOINT-CENSUS-2026-04-30.md](./REST-ENDPOINT-CENSUS-2026-04-30.md)) |
| Coverage | **129 / 196 = 65.8%** of POST endpoints — push past **🎯🎯 60% MAJOR MILESTONE toward 70% target**. **30-round sustained Idempotency-Key campaign Rounds 18-48**. Round 48 closes mixed admin-tooling cluster: B2F LIFF Admin auth init (auth-admin — slow LINE id_token verify network-call dedup + session_token issuance dedup + 2× rate-limit consumption guard, cross-namespace pair with R42 /b2b/v1/auth-group) + Brand Voice extension intake (entries single + entries/batch bulk-shape — Chrome extension wp_insert_post + sentiment counter inflation + analytics signal storm guard) + Distributor Onboarding wizard (check-group-id read-only DB load reduction + save CRITICAL distributor CPT creation race window guard). 3 cross-snippet files modified: `[B2F] Snippet 2: REST API` V.11.20→V.11.21 + `[Admin System] DINOCO Brand Voice Pool` V.2.12→V.2.13 + `[Admin System] DINOCO Distributor Onboarding Wizard` V.1.0→V.1.1. **B2F namespace coverage = 22 endpoints** (+1 since Round 47 = 21 → 22 — auth-admin). **Brand Voice namespace coverage = 4 endpoints** (+2 since Round 47 = 2 → 4 — entries + entries/batch). **Onboarding namespace coverage = 2 endpoints** (NEW namespace — check-group-id + save). **Inventory namespace coverage = 23 endpoints** (unchanged). **LIFF AI namespace coverage = 5 endpoints** (unchanged). **MCP cluster coverage = 13/17 = ~76%** (saturated since Round 35). **B2B namespace coverage = 60 endpoints** (unchanged). |
| Cumulative test cases | 481 (Round 19-48 — Round 48 added 18) |
| Body-shape distinct hashes asserted | 128 (Round 48: +5 new — all unique; auth-admin single {line_user_id} ONLY — NOT _ts/_sig/id_token because those rotate per request even for legit retry; cross-namespace pair with R42 auth-group; brand-voice/entries single {source_url, content_hash: md5(author + content[:100] + brands_csv), platform} — mirrors handler dedup_key logic deterministically; brand-voice/entries/batch bulk-shape {count, rows[]: usort by content_hash 'h' ASC} — order-stable so same dataset different upload order = same hash; onboard/check-group-id single {group_id, exclude_id} — read-only but reduces DB load on retry storm + admin paste-error 409; onboard/save single {shop_name, line_group_id, rank_system, credit_limit, credit_term_days} core — phone/address/walkin/bot_enabled excluded so admin minor metadata correction doesn't trigger 409; CRITICAL race-window dedup for 2× wp_insert_post + 10× ACF update_field) |

> **Round 30 note**: Earlier rounds reported coverage against a conservative
> "~75 POST endpoints" estimate. The Round 30 REST endpoint census
> ([REST-ENDPOINT-CENSUS-2026-04-30.md](./REST-ENDPOINT-CENSUS-2026-04-30.md))
> established the authoritative denominator of **193 POST endpoints**, so
> percentages prior to this round were inflated. The 50% milestone target
> (~97 endpoints) is therefore further out than initially planned — but
> the foundation + retry-prone hot paths (BO + Flash + create-PO + B2F
> writes) are now fully covered.

> **Round 31 note**: F1-class drift regression guard added —
> `tests/jest/idempotency-tracker-drift.test.js` (8 → 9 drift detectors).
> Detector parses this tracker + asserts each claimed file actually contains
> `dinoco_idempotency_check` call site + endpoint suffix appears in REST route
> registration. Catches the same drift class as Round 29 F1 bug (tracker lied
> about bo-fulfill being integrated when wrapper was missing).

---

## Milestones

> **Pre-Round 30 milestones (estimated denominator stale)**: Earlier milestones
> (25% / 30% / 35% / 40% / 45%) were calculated against a conservative ~75
> POST endpoint estimate. The Round 30 REST endpoint census established the
> authoritative count of 193 POST endpoints
> ([REST-ENDPOINT-CENSUS-2026-04-30.md](./REST-ENDPOINT-CENSUS-2026-04-30.md)).
> Real coverage at those rounds was lower than reported — see "estimated
> denominator stale" annotations below.

| Milestone | Round | Date | Notes |
|-----------|-------|------|-------|
| 25% (estimated denominator stale, see Round 30 census) | 22 | 2026-04-29 | First batch coverage past 1/4 of estimated total |
| 30% (estimated denominator stale, see Round 30 census) | 24 | 2026-04-29 | After Round 24 multi-currency POs |
| 35% (estimated denominator stale, see Round 30 census) | 26 | 2026-04-30 | BO endpoints (split + bulk-fulfill etc.) |
| 40% (estimated denominator stale, see Round 30 census) | 28 | 2026-04-30 | Admin BO + B2F approve-reschedule |
| 45% (estimated denominator stale, see Round 30 census) | 29 | 2026-04-30 | Combined-slip + import-distributors + delete/recalculate |
| **10% (true coverage)** | **26** | **2026-04-30** | First milestone against authoritative denominator (~19/193) |
| **15% (true coverage)** | **28** | **2026-04-30** | After Round 28 BO + B2F admin endpoints (~28/193) |
| **20.2% (corrected denominator)** | **30** | **2026-04-30** | Round 30 census reset — actual is 39/193 = 20.2% (not 50%). Foundation + hot-path retry-prone endpoints fully covered. |
| **22.8% (Round 31)** | **31** | **2026-04-30** | +5 endpoints (44/193) — claim-update + lead-update + pricing + warehouse + maker-reject. F1 drift regression guard added (`tests/jest/idempotency-tracker-drift.test.js`). |
| 🎯 **25.4% (Round 32 — TRUE 25% milestone)** | **32** | **2026-04-30** | +5 endpoints (49/193) — maker-reschedule + manual-flash-test + bo-update-eta + bo-restock-scan + reject-lot. **First milestone past 1/4 of POST endpoints AGAINST AUTHORITATIVE Round 30 census denominator** (earlier "25%" entries above were against stale ~75 estimate). 16 B2F endpoints + 22 B2B + 8 inventory + 3 MCP. |
| **27.6% (Round 33)** | **33** | **2026-04-30** | +5 endpoints (54/196 — denominator refreshed Round 33 to 196 from 193, +3 natural growth). Batch 11: maker-product + maker + po-undo-submit (B2F CRUD/admin) + distributor-notify + customer-link (MCP OpenClaw retry-prone). 19 B2F + 22 B2B + 8 inventory + 5 MCP. Drift detector extended (4 → 5 tests) — POST-only assertion guards against accidentally adding read-only endpoints to tracker. |
| 🎯 **30.1% (Round 34 — TRUE 30% milestone)** ⭐ | **34** | **2026-04-30** | +5 endpoints (59/196). Batch 12: bo-clear-enum-flag (B2B admin flag reset) + kb-suggest + brand-voice-submit (MCP chatbot signals) + distributor/delete + distributor/toggle-bot (B2B admin distributor management). 19 B2F + 24 B2B + 8 inventory + 7 MCP. **First sustained 30% milestone against authoritative Round 30 census denominator** — past 3/10 of POST surface. 5 distinct patterns observed across Rounds 18-34 (single / bulk / bulk-of-targets / state-machine / boolean-discriminator + enum-discriminator) — see [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md) "Round 18-34 case study patterns". |
| **32.7% (Round 35 — MCP cluster ~76%)** | **35** | **2026-04-30** | +5 endpoints (64/196). Batch 13 — all `/dinoco-mcp/v1/*` retry-prone OpenClaw signals: dashboard-inject-metrics (FB/IG metrics — inflated KPI guard) + lead-attribution (revenue double-count guard, event enum discriminator) + inventory-changed (stock webhook, action enum) + kb-updated (Qdrant rebuild webhook, trigger_source discriminator) + product-compatibility (catalog query — chatbot retry compute saver, brand+model normalized). 19 B2F + 24 B2B + 8 inventory + **12 MCP** (13/17 POST = 76% MCP namespace coverage). Pattern: 4× "compute-only/log-only" cache + 1× analytics signature hash. |
| 🎯 **35.2% (Round 36 — TRUE 35% milestone)** ⭐ | **36** | **2026-04-30** | +5 endpoints (69/196). Batch 14 — pivot from saturated MCP cluster to B2B admin Flash + BO + inventory long tail per Round 35 recommendation: bo-reject (admin pending_stock_review reject — customer Flex spam guard + counter decrement integrity) + flash-cancel (Flash per-PNO API charge guard + 1015 dedup) + flash-cancel-notify (pickup cancel — shares shape with flash-cancel via namespace discriminator) + flash-switch-manual (RPi duplicate manual label print guard + admin Flex spam dedup) + stock/hold (boolean-discriminator: hold/release flip caught by hash). 19 B2F + **27 B2B** + **9 inventory** + 13 MCP. **First 35% milestone past 7/20 of POST surface. B2B namespace passes ~48% (highest absolute count).** Pattern: 1× state-machine-enum (FSM cancellation) + 4× single (3 ticket-scoped flash + 1 boolean-discriminator inventory). |
| **37.8% (Round 37 — Snippet 3 RPi + customer LIFF cluster)** | **37** | **2026-04-30** | +5 endpoints (74/196). Batch 15 — closes ALL 5 Round 36 high-priority candidates in `[B2B] Snippet 3`: print-test (constant-marker `{type}` — admin double-click test print) + print-requeue (single `{ticket_id}` — admin/RPi reprint shipping label) + rpi-accept-order (single `{ticket_id}` — RPi kiosk FSM 400 surface fix) + rpi-flash-ready (single `{ticket_id}` — RPi scan-to-call-courier Flash /notify quota burn; 4 success store sites: already-courier / active-pickup-reuse / new-pickup-success / queued-retry) + slip-upload (CRITICAL — Slip2Go double-charge guard: `{ticket_id, gid}` bulk-shape with `image_base64` EXCLUDED following combined-slip-upload Round 29 pattern; gid from session prevents cross-group cache poisoning). 19 B2F + **32 B2B** + 9 inventory + 13 MCP + 1 LIFF AI. **Snippet 3 coverage 35% → 54% (9/26 → 14/26 POST routes).** Pattern: 1× constant-marker (no body content) + 3× single (ticket_id) + 1× bulk-shape (ticket_id+gid). |
| 🎯 **40.3% (Round 38 — TRUE 40% milestone) ⭐** | **38** | **2026-04-30** | +5 endpoints (79/196). Batch 16 — Snippet 3 medium-priority retry-prone closures + Snippet 5 Flash admin label: bo-notify (admin "ส่ง Flex แจ้งลูกค้า" double-click → 2× LINE Flex push to customer spam + bo_available_qty churn; bulk-shape `{ticket_id, items sorted by sku}`) + rpi-command (admin spam-click "รีบูท RPi"/"รีสตาร์ท service" → 2× cmd queue entries + cmd_id pollution; bulk-shape `{command, params normalized via ksort}`) + rpi-flash-box-packed (RPi scanner double-trigger → manifest-completion 2× Flash /notify quota burn + admin Flex pickup_added spam; single `{pno}`; 4 success store sites — reused_pickup / called / pending / partial-status) + flash-ship-packed (timeout dialog double-confirm → 2× courier /notify + admin LINE notification + hold_pending Flex push + audit log; single `{ticket_id}`) + flash-label (admin "ดาวน์โหลด Label" double-click → 2× Flash /open/v3/orders/printPdf quota burn; single `{pno}` — binary PDF cannot replay through cache, returns JSON marker on replay). **Snippet 3 coverage 54% → 69% (14/26 → 18/26 POST routes). B2B namespace coverage 57% → 66%.** 19 B2F + **37 B2B** + 9 inventory + 13 MCP + 1 LIFF AI. **First sustained 40% milestone past 4/10 of POST surface against authoritative Round 30 census denominator.** Pattern: 2× bulk-shape (ticket_id+items / command+params) + 3× single (2× pno + 1× ticket_id). |
| **42.9% (Round 39 — push toward 45% milestone)** | **39** | **2026-04-30** | +5 endpoints (84/196). Batch 17 — Snippet 5 Flash ops + Snippet 9 Flash admin setup cluster: flash-ready-to-ship (admin double-click "พร้อมจัดส่ง" → 2× distributor Flex push spam + 2× Flash courier /notify quota burn + 2× admin LINE notification + 2× audit log churn per ticket; **bulk-shape** `{ticket_ids sorted+deduped}` — handler accepts single or array, normalized) + daily-summary (admin manual-trigger "ส่งสรุป" → 2× admin Flex summary card + 2× DB storm cron-replica read; **constant-marker** `{action: 'trigger-summary'}` — no params at all, namespace + action string sole discriminator) + flash-webhook-setup (admin "ตั้งค่า Webhook" → 2× POST /notify/setting × 5 codes = 10 Flash API calls instead of 5 quota burn; **bulk-shape** `{webhook_url, codes:[0..4]}` — webhook_url change between retries → 409 alert env mismatch) + flash-api-test (admin "ทดสอบ Flash API" → 2× GET /warehouses Flash rate-limit count; **single** `{action, mch_id, is_production}` — env discriminator catches training↔prod switch; errors NOT cached) + test-push (admin "Test Push" double-click → 2× LINE push to admin group spam; **single** `{target, message}` — different message text → 409). **Snippet 5 coverage = 11 endpoints. Snippet 9 coverage 3 → 6 (+3).** B2B namespace coverage 66% → ~75%. 19 B2F + **42 B2B** + 9 inventory + 13 MCP + 1 LIFF AI. Pattern mix: 1× constant-marker (daily-summary — third instance, after stock/initialize Round 30 + manual-flash-test Round 32) + 1× bulk-shape (flash-ready-to-ship) + 1× bulk-shape with env discriminator (flash-webhook-setup) + 2× single (flash-api-test + test-push). |
| **58.2% (Round 45 — push toward 🎯 60% milestone)** | **45** | **2026-04-30** | +5 endpoints (114/196 = **58.2%**). **27-round sustained campaign Rounds 18-45**. Batch 23 — closes 5 retry-prone POSTs across 2 files (cross-snippet coordination): product/shipping/bulk (UPGRADED ad-hoc transient idempotency `set_transient('shipping_bulk_idem_'+md5(key))` to **central helper** with binary-fingerprint pattern — body hash = `{csv_sha1, csv_size, line_count}`; 100KB CSV cannot fit in idempotency_keys table directly, so sha1 fingerprint distinguishes "same CSV vs different rows mid-retry" without storing payload. Legacy ad-hoc `set_transient` shadow-write kept for V.45.9 in-flight clients during DAY_IN_SECONDS upgrade window — once central helper observed stable, remove. 2nd binary-fingerprint instance after R42 upload-image — cementing pattern for binary/large-payload endpoints) + shipping-compute (M6 "Test Payload" admin tool — pure compute path BUT 500-item `dinoco_resolve_manifest_shipping()` is expensive recursion + catalog lookups + box-template joins; admin double-click on slow tab switch → 2× resolver pass = CPU waste; **bulk-shape** body hash = `{items[]}` sorted by SKU UPPER + qty per row via `usort` — same items + same qtys = idempotent replay (instant); different SKU set or qty mid-retry → 409) + print-ack (RPi network retry / double-ack race on flaky wifi → 2× `update_field(print_status)` + 2× admin LINE Flex spam on error/partial during peak ops hours; printer error during shift change = 50+ duplicate notifications drown ops chat; **single** body hash = `{ticket_id, status}` — status enum discriminator (done/error/partial) catches RPi state confusion when reporting `done` then `partial` from misread output → 409 forces RPi to fix internal state; msg/details/printed_at EXCLUDED from hash — diagnostic drift fields) + print-heartbeat (RPi 30s heartbeat double-fire on network glitch / systemd timer race → 2× `update_option(b2b_print_device_info)` is idempotent at storage BUT printer-status-change detection (idle→disabled) fires `b2b_push_to_admin` Flex once per heartbeat → admin gets DUPLICATE "🖨️ Printer สถานะเปลี่ยน" alerts; **single** body hash = `{hostname}` only — RPi auto-generates new key per heartbeat tick → distinct keys per legitimate beat; same key = retry of same tick = idempotent; timestamp/cpu_temp/uptime/printers EXCLUDED — drift naturally per beat without semantic intent change) + rpi-command-ack (cmd_id naturally unique BUT `array_filter+array_unshift` on `b2b_rpi_pending_commands+b2b_rpi_command_history` arrays non-idempotent — 2nd call after pending already drained → cmd_info null → history row labelled `'unknown'` (audit log corruption) + 2× admin LINE Flex on error duplicates "❌ RPi command failed" alert; **single** body hash = `{cmd_id, status}` — status enum discriminator catches RPi confusion done→error mid-retry from misread output; same shape as print-ack pair). **B2B namespace coverage 53 → 56 (+3)**. **Inventory namespace coverage 17 → 19 (+2)**. 21 B2F + 56 B2B + 19 inventory + 13 MCP + 3 LIFF AI + 2 Brand Voice = **114/196 = 58.2%**. Pattern mix: 1× **binary-fingerprint** (product/shipping/bulk — 2nd instance after R42 upload-image) + 1× bulk-shape (shipping-compute items[] sort by SKU) + 3× single (print-ack + print-heartbeat + rpi-command-ack — 2 with status enum discriminator). Pattern maturity at Round 45 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). **Pattern milestone**: 2nd binary-fingerprint instance — pattern proven across 2 rounds (R42 + R45) for upload + bulk-import endpoints where raw payload (5MB image / 100KB CSV) exceeds idempotency_keys row size. **NEW upgrade pattern**: ad-hoc transient → central helper migration with backward-compat shadow-write (legacy `set_transient` kept during DAY_IN_SECONDS window). Push toward 🎯 60% milestone — only +4 needed for 118/196 = 60.2% in Round 46 batch 24. |
| **55.6% (Round 44 — push toward 60% milestone)** | **44** | **2026-04-30** | +5 endpoints (109/196 = **55.6%**). **26-round sustained campaign Rounds 18-44**. Batch 22 — closes 5 retry-prone POSTs across 3 files (cross-snippet coordination): flash-test/run-step (sysadmin runner double-click → 2× expensive Flash dispatch / API call / DB mutation per step e.g. `flash_create` burns Flash quota; `scan_qr` flips packing status + courier notify; webhook simulator fires `b2b_flash_wh_status`; **single** body hash `{ticket_id, step}` — step enum discriminator catches admin re-running different step on same ticket → 409. Switch with 200+ LOC of case returns wrapped via IIFE pattern → captures `WP_REST_Response` + stores cached only on `success=true` exit) + flash-test/simulate-webhook (admin re-fires webhook simulator double-click → 2× state-mutation per type e.g. delivered fires order auto-complete; returned generates new returnedPno; weight/price overwrites prior data; **single** body hash `{ticket_id, type}` — type enum discriminator; same IIFE wrap pattern) + api-keys/generate (admin "Generate Key" double-click on slow update_option → 2× api_key INSERT into bv_api_keys array → 2 keys exist in wild **SECURITY RISK**: admin only saw 1 in UI; **single** body hash `{name}` — different label between retries → 409, same name retry → cached 200 returns FIRST raw_key + audit log entry; FIRST Brand Voice namespace idempotency wrap) + api-keys/revoke (admin "Revoke" double-click during slow reload race → 2× array_splice on adjacent indices → wrong key revoked **AUDIT LOG SCRAMBLED**; **single** body hash `{index}` — index discriminator catches admin clicking different row mid-retry → 409 surfaces security event; same index retry → cached 200 prevents double-decrement of array which would skip middle key) + discount-mapping (admin batch upsert double-click or external system retrying on network drop → 2× custom table writes + 2× ACF update_field per item × 500 items = up to 5000 redundant DB ops + 2× transient flush; **bulk-shape** body hash `{items[]}` sorted by SKU UPPER + per-row normalized fields — different items[] mid-retry → 409 catches admin business decision change mid-retry; same items retry → cached 200). **B2B namespace coverage 50 → 53 (+3)**. **Brand Voice namespace coverage 0 → 2 (NEW)**. 21 B2F + 53 B2B + 17 inventory + 13 MCP + 3 LIFF AI + 2 Brand Voice = **109/196 = 55.6%**. Pattern mix: 4× single (flash-test/run-step + flash-test/simulate-webhook + api-keys/generate + api-keys/revoke) + 1× bulk-shape (discount-mapping items[] sorted by SKU). Pattern maturity at Round 44 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). **NEW pattern variant**: IIFE wrap for switch-heavy multi-return functions (b2b_rest_flash_test_run_step had 200+ LOC of case returns — wrap entire switch in `(function() {...})()` closure → capture WP_REST_Response → store only on success exit, preserves all existing case returns intact zero refactoring). Push toward 60% milestone — only +9 needed for ~118/196 in future Rounds 45-46. |
| **53.1% (Round 43 — push past 50% toward 60%)** | **43** | **2026-04-30** | +5 endpoints (104/196 = **53.1%**). **25-round sustained campaign Rounds 18-43**. Batch 21 — closes ALL 5 Manual Invoice retry-prone POST endpoints (single file `[Admin System] DINOCO Manual Invoice System` V.34.10 → V.34.11): invoice/init (admin "เริ่มออกบิล" double-click on slow wp_insert_post → 2× draft + 2× invoice number consumed gap in sequence; **constant-marker** `{action: 'init', user_id}` — 5th constant-marker instance after R30 stock/initialize + R32 manual-flash-test + R39 daily-summary + R40 dip-stock/start; user_id scopes draft per-admin) + invoice/issue (admin "ออกบิล/ส่ง LINE" double-click on slow LINE push → 2× Flex card + 2× invoice image push to distributor LINE group + 2× FSM transition draft→awaiting_payment + 2× debt add via dinoco_inv_apply_debt; **single** `{id}` — wrapper short-circuits before FSM gate) + invoice/record-payment (CRITICAL retry-prone: admin "บันทึกชำระ" double-click on slow ACF/SQL → 2× _inv_paid_amount add + 2× partial_payments json append + 2× debt subtract via b2b_recalculate_debt → debt double-cleared; FOR UPDATE lock prevents physical race but 2nd retry AFTER 1st commit still re-adds; **single** `{id, amount, note}` — amount round(2) for float-precision normalize; different amount mid-retry → 409) + invoice/record-refund (CRITICAL retry-prone mirrors record-payment: admin "บันทึกคืนเงิน" double-click → 2× refund entry + 2× _inv_refunded_amount add + 2× FSM paid→awaiting_payment + 2× debt re-add → debt double-credited → distributor sees wrong outstanding balance; **single** `{id, amount, reason, method}` — method enum (manual\|bank_transfer\|cash\|credit_note) discriminates accounting category) + invoice/cancel (admin "ยกเลิก" double-click on slow LINE push → 2× cancel Flex card to distributor LINE group + 2× FSM transition + 2× dinoco_inv_reverse_debt; **single** `{id, force, force_reason}` — force boolean discriminator + force_reason text catches admin re-issuing different excuse mid-retry → 409 prevents accidental override of audit log entry). **B2B namespace coverage 45 → 50 (+5)**. 21 B2F + 50 B2B + 17 inventory + 13 MCP + 3 LIFF AI = **104/196 = 53.1%**. Pattern mix: 1× constant-marker (init) + 4× single (issue + record-payment + record-refund + cancel). Pattern maturity at Round 43 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). Push toward 60% milestone — only +14 needed for ~118/196 in future Rounds 47+. |
| 🎯🎯🎯 **50.5% (Round 42 — 50% MAJOR MILESTONE REACHED ⭐⭐⭐)** | **42** | **2026-04-30** | +5 endpoints (99/196 = **50.5%**). **24-round sustained campaign Rounds 18-42**. Batch 20 — push past the half-way mark: invoice-gen (customer/admin LIFF "ดูใบแจ้งหนี้" double-click on slow GD render → 2× expensive PDF generation b2b_generate_invoice_pages → 2× upload to /wp-content/uploads/b2b-invoices/ + 2× LINE notification spam if downstream pushes wired; **single** body hash = `{ticket_id, gid}` — gid from session prevents cross-group cache poisoning) + manual-flash-label (admin "ดาวน์โหลด Label Manual" double-click on slow Flash API → 2× call to b2b_flash_get_label_pdf → 2× Flash /open/v3/orders/printPdf quota burn; **single** body hash = `{pno}` globally unique; PDF binary CANNOT replay through cache — wrapper stores lightweight cached_replay marker on success store + LIFF/admin client handles UX) + auth-group (LIFF auth init double-fire on slow LINE verify → 2× session_token issuance + 2× rate-limit consumption + log spam; **single** body hash = `{group_id, line_uid}` — both required for distinct auth identity; rate-limit increment ALREADY happened so wrapper additionally protects token issuance + downstream side-effects only) + lead-note (admin/dealer LIFF "บันทึกหมายเหตุ" double-tap on slow MongoDB → 2× POST to agent proxy → 2× note insert into lead.history MongoDB array → user sees duplicate "by" entries UX + 2× downstream notify hooks; **single** body hash = `{lead_id, note, role, actor uid}` — actor scoped from JWT $auth['uid'] cross-admin/dealer key reuse impossible; note text edits between retries → 409 integrity guard) + upload-image (admin "อัพโหลดรูป" double-click on slow upload 5MB image over 4G → 2× S3/local file write to wp-content/uploads/ + 2× catalog UPDATE + 2× ACF update_field + 2× set_post_thumbnail; **NEW binary-fingerprint pattern** body hash = `{sku, filename, size, content_sha1}` — **binary blob EXCLUDED** from hash (5MB raw bytes would explode idempotency_keys table); content_sha1 = sha1_file of upload tmp file (~50ms for 5MB) — serves as fingerprint to distinguish "same file vs different file" without storing binary; admin selected wrong file mid-retry = different content_sha1 = 409 prevents wrong image stuck on SKU). **B2B namespace coverage 42 → 45 (+3)**. **Inventory namespace coverage 16 → 17 (+1)**. **LIFF AI namespace coverage 2 → 3 (+1)**. 21 B2F + 45 B2B + 17 inventory + 13 MCP + 3 LIFF AI = **99/196 = 🎯🎯🎯 50.5% MAJOR MILESTONE**. Pattern mix: 4× single (invoice-gen + manual-flash-label + auth-group + lead-note) + 1× **binary-fingerprint NEW** (upload-image). Pattern maturity at Round 42: **7 patterns** observed (single / bulk / bulk-of-targets / state-machine / boolean-discriminator + enum-discriminator / constant-marker / **binary-fingerprint NEW R42**) — see [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md). |
| **48.0% (Round 41 — push toward 🎯 50% MAJOR MILESTONE)** | **41** | **2026-04-30** | +5 endpoints (94/196). Batch 19 — pivot from B2B Flash admin cluster + LIFF AI/Inventory mix (Round 40) to Inventory shipping ops + B2F admin delete pair: dip-stock/count (admin "บันทึกผลนับ" double-click → 2x SQL UPDATE per item + variance/variance_pct re-compute waste + counted_skus recount; **bulk-shape** body hash = `{session_id, items: sorted-by-sku [{sku UPPER, actual_qty, note}]}` — different actual_qty between retries → 409 prevents wrong variance stuck via cached replay) + box-template create (admin "เพิ่มกล่อง" double-click race → 2x INSERT slips through handler dedup microsecond gap + 2x cache flush + 2x dinoco_invalidate_box_template_cache; **single** body hash = `{code, name, dims, tare/max weight, owner_type, sort_order}`) + box-template/{id} update (admin "แก้ไขกล่อง" double-click → 2x UPDATE + cache flush 2x + downstream Snippet 1 V.34.x dinoco_resolve_pno_shipping() static memo flush twice; **single** body hash = `{id, ...selective fields present}` — id discriminates create vs update; dim change between retries → 409) + maker/delete (admin "ลบโรงงาน" double-click on slow ACF write → 2nd request finds maker already inactive idempotent at storage but 2x b2f_log + admin Flex push double-fire risk; **single** `{id}` — cross-namespace pair guard with maker-product/delete same shape) + maker-product/delete (admin "ลบสินค้า" double-click → 1st wp_delete_post succeeds + soft-delete junction + b2f_junction_updated hook + cache invalidation; 2nd request hits NOT_FOUND 404 confusion — wrapper turns "already deleted" 404 into cached 200 retry-friendly UX; **single** `{id}`). **Inventory namespace coverage 13 → 16 (+3). B2F namespace coverage 19 → 21 (+2)**. 21 B2F + 42 B2B + **16 inventory** + 13 MCP + 2 LIFF AI. **Push toward 🎯 50% MAJOR MILESTONE — 94/196 = 48.0%, only +4 needed for ~98/196 in Round 42 batch 20.** Pattern mix: 1× bulk-shape (dip-stock/count items[] sort by SKU) + 2× single full-shape (box-template create) + 2× single shape-match {id}-only (B2F deletes — namespace-discriminated). Cross-namespace SHAPE-MATCH pattern reused (mirrors flash-cancel/flash-cancel-notify R36 pair + print-requeue/rpi-accept-order R37 pair). |
| **65.8% (Round 48 — push toward 🎯 70% milestone)** | **48** | **2026-04-30** | +5 endpoints (129/196 = **65.8%**). **30-round sustained campaign Rounds 18-48**. Batch 26 — cross-snippet 3-file admin-tooling cluster: auth-admin (B2F LIFF Admin auth init — slow LINE id_token verify ~500ms-1s POST to api.line.me/oauth2/v2.1/verify → admin LIFF retries on flaky network → 2× session_token issuance + 2× rate-limit consumption + 2× audit log spam; **single** body hash {line_user_id} ONLY — NOT _ts/_sig/id_token because those rotate per request even for legit retry of same admin session; cross-namespace pair with R42 /b2b/v1/auth-group same shape namespace-discriminated) + brand-voice/entries (Chrome extension single entry create — slow wp_insert_post + 5-10× update_post_meta + cache flush → ext retries on flaky → 2× brand_voice CPT row + 2× sentiment counter inflation + duplicate analytics signal corruption; **single** body hash {source_url, content_hash: md5(author + content[:100] + brands_csv), platform} — mirrors handler dedup_key logic deterministically; existing 24h transient dedup PASSES through but ALSO protects 2× DB writes when extension generates fresh idem-key per click) + brand-voice/entries/batch (Chrome extension bulk import max 50 — sysadmin double-click → 2× full loop = up to 100× wp_insert_post + 250-500 update_post_meta + 50× bv_invalidate_stats_cache → analytics signal storm; **bulk-shape** body hash {count, rows[]: usort by content_hash 'h' ASC} — order-stable hash so admin uploading same dataset different sequence = cached 200; different rows mid-retry → 409 catches admin re-uploading partial batch) + onboard/check-group-id (admin "ตรวจสอบ" double-click on slow get_posts meta_query → 2× DB scan ~5K distributor rows × 2 = 10K row scans + UI flicker; **single** body hash {group_id, exclude_id} — storage idempotent BUT prevents UX confusion + DB load + admin paste-error 409 when wrong group_id pasted then corrected mid-retry) + onboard/save (CRITICAL retry-prone: admin "Save" double-click on slow wp_insert_post + 10× ACF update_field → race window allows 2× distributor CPT creation with same line_group_id (uniqueness check passes for 1st request, microsecond gap before commit, 2nd request sees no dup yet, both succeed); **single** body hash {shop_name, line_group_id, rank_system, credit_limit, credit_term_days} core — phone/address/walkin/bot_enabled excluded so admin minor metadata correction doesn't trigger 409 only core identity + commercial terms are hash-discriminators; admin renamed shop / changed credit mid-retry → 409 catches business decision change). **B2F namespace coverage 21 → 22 (+1)**. **Brand Voice namespace coverage 2 → 4 (+2)**. **Onboarding namespace 0 → 2 (NEW)**. 22 B2F + 60 B2B + 23 inventory + 13 MCP + 5 LIFF AI + 4 Brand Voice + 2 Onboarding = **129/196 = 65.8%**. Pattern mix: 4× single (auth-admin + brand-voice/entries + onboard/check-group-id + onboard/save) + 1× bulk-shape (brand-voice/entries/batch with content_hash sort). Pattern maturity at Round 48 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). **Strategic note**: After 30 rounds of sustained instrumentation (Rounds 18-48), recommend slow-down to 1-2 weeks production canary observation matching Round 42 50% pause pattern. Push toward 🎯 70% milestone — only +9 needed for ~138/196 in Round 50 timeline. |
| **63.3% (Round 47 — push past 60% toward 70% milestone)** | **47** | **2026-04-30** | +5 endpoints (124/196 = **63.3%**). **29-round sustained campaign Rounds 18-47**. Batch 25 — first batch after 🎯🎯 60% MAJOR MILESTONE Round 46. Cross-snippet 2-file closure: Inventory admin endpoints (4 endpoints) + LIFF AI agent-ask. stock/sync-missing (admin "🔄 Sync Missing" double-click on slow drift sweep → 2× full table scan + 2× INSERT loop on missing SKUs e.g. 50 missing rows = 100 INSERTs + 2× cache invalidation; **constant-marker** {action:'sync-missing'} — **6th constant-marker instance** after R30 stock/initialize + R32 manual-flash-test + R39 daily-summary + R40 dip-stock/start + R43 invoice/init) + shipping/classify/{sku} (admin classify ad-hoc SKU "บันทึก pack mode" double-click on slow UPDATE → 2× UPDATE wp_dinoco_products + 2× DINOCO_Catalog::flush_memo + 2× shipping cache flush; **single** body hash {sku, update fields ksort-normalized} — different pack_mode mid-retry single_box→multi_box → 409; updated_by/updated_at EXCLUDED auto-stamped drift fields) + product/shipping (admin Edit Product modal "บันทึก Shipping V.42" double-click on slow transaction UPDATE products + DELETE+INSERT pack_slots × N → 2× transaction commit + 2× cache invalidation + 2× downstream Snippet 1 dinoco_resolve_pno_shipping memo flush; **bulk-shape selective** {sku, update fields ksort, pack_slots[] sorted by slot_index — slot_label + box_template_id + content_weight_g per row} — different pack_mode/weight between retries → 409 prevents stale weight propagation through cron forecast) + image-proxy (admin Edit Product canvas "อัพโหลดรูป" via JS fetch external CDN → flaky network = 2× wp_remote_get bandwidth burn 10MB image × 2 = 20MB; **single** {url} — cached data_url base64 returned on replay direct cache vs R42 sha1 fingerprint precedent because small payload fits in idempotency_keys row; different SKU image URL → 409) + agent-ask (admin LIFF "ถามผู้ช่วย AI" double-tap on slow OpenClaw agent proxy Gemini/Claude API quota burn → 2× LLM token spend + 2× MCP tool call chain catalog/dealer/warranty + 2× duplicate answer return confusing UX; **single** {question normalized via mb_strtolower + trim, actor_uid from JWT} — cross-admin JWT-scoped prevents cache leak between admins; transient agent failures NOT cached — admin retries without 409 noise; question normalization mirrors kb-suggest R34 pattern). **Inventory namespace coverage 19 → 23 (+4)**. **LIFF AI namespace coverage 4 → 5 (+1)**. 21 B2F + 60 B2B + 23 inventory + 13 MCP + 5 LIFF AI + 2 Brand Voice = **124/196 = 63.3%**. Pattern mix: 1× constant-marker (sync-missing — 6th instance proven across 6 rounds R30/R32/R39/R40/R43/R47) + 3× single (shipping/classify + image-proxy + agent-ask — agent-ask adds JWT cross-admin scoping discriminator) + 1× bulk-shape selective (product/shipping with pack_slots[] sort by slot_index — extends R45 shipping-compute pattern with multi-row sort key). Pattern maturity at Round 47 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). **Pattern milestone**: constant-marker now proven across 6 endpoints in 6 rounds — pattern fully mature for "no params" admin trigger endpoints. Push toward 70% milestone — only +14 needed for ~138/196 in Round 50 timeline (4-5 batches × 5 endpoints). |
| 🎯🎯 **60.7% (Round 46 — 60% MAJOR MILESTONE REACHED) ⭐⭐** | **46** | **2026-04-30** | +5 endpoints (119/196 = **60.7%**). **🎯🎯 60% MAJOR MILESTONE REACHED** — past 6/10 of POST surface integrated against authoritative Round 30 census denominator. **28-round sustained Idempotency-Key campaign Rounds 18-46**. Cross-snippet 3-file batch closure: B2B Snippet 3 V.42.19→V.42.20 (manual-flash-status — admin/RPi "เช็คสถานะ Manual Flash" double-click on slow Flash network → 2× b2b_flash_get_routes(pno) Flash Routes API quota burn + state>0 → 2× b2b_flash_manual_shipment_webhook(pno) status mutation + 2× notify spam; **single** {pno} globally unique per shipment) + B2B Snippet 9 V.34.4→V.34.5 (3 admin save endpoints — distributor admin "บันทึกตัวแทน" double-click race → 2× wp_insert_post + 2× ACF update_field × 15 fields + 2× recalc_debt; **single** {id, shop_name, line_group_id} core — id discriminates create vs update; full body 15+ fields too noisy minimum viable hash. settings admin "บันทึกตั้งค่า" double-click → 2× update_option(b2b_settings) array overwrite race; **bulk-shape selective** {bank_name, bank_account, bank_holder, company_name, promptpay_id} fields PRESENT only sorted by ksort. print-settings admin "บันทึกตั้งค่า Print" double-click → 2× update_option × 4 + if regen=1 → 2× wp_generate_password creates 2 different API keys last one wins **SECURITY-CRITICAL key rotation race**; **bulk-shape selective with regen boolean discriminator** + warehouse/registered subfields). + LIFF AI Snippet 1 V.1.13→V.1.14 (lead-status — admin LIFF "เปลี่ยนสถานะ Lead" double-tap on slow MongoDB → 2× POST agent proxy → 2× lead status update + 2× history insert + 2× downstream notify hooks (StockBack/FollowUp Flex if status flips to waiting_stock/waiting_decision); **single** {lead_id, status, actor_uid from JWT} — actor scoped cross-admin key reuse impossible; **status enum 17-statuses discriminator** catches admin clicking different button mid-retry → 409). **B2B namespace coverage 56 → 60 (+4)**. **LIFF AI namespace coverage 3 → 4 (+1)**. 21 B2F + **60 B2B** + 19 inventory + 13 MCP + **4 LIFF AI** + 2 Brand Voice = **🎯🎯 119/196 = 60.7% MAJOR MILESTONE**. Pattern mix: 3× single (manual-flash-status + distributor + lead-status) + 2× bulk-shape selective (settings + print-settings — print-settings adds boolean discriminator for regen). Pattern maturity at Round 46 unchanged: **7 patterns** (single / bulk / bulk-of-targets / state-machine / boolean+enum-discriminator / constant-marker / binary-fingerprint). **Strategic note**: After 🎯🎯 60% MAJOR MILESTONE, recommend slow-down to 1-2 weeks production canary observation matching Round 42 50% pause. 28-round sustained campaign represents significant test infra burden (447 cumulative test cases). |
| **58.2% (Round 45 — push toward 🎯 60% milestone)** | **45** | **2026-04-30** | (See entry above for Round 46 60% milestone — Round 45 was the immediate predecessor) |
| 🎯 **45.4% (Round 40 — TRUE 45% milestone) ⭐** | **40** | **2026-04-30** | +5 endpoints (89/196). Batch 18 — pivot from saturated B2B Flash admin cluster (Round 36-39) to mixed-namespace closure (1 LIFF AI + 4 Inventory): claim/{id}/status (LIFF AI Command Center admin status dropdown → slow ACF save → 2× dinoco_set_claim_status() → 2× status_history + 2× admin_note + 2× hook chain LINE push potential; **single** `{claim_id, status, note, actor uid from JWT}` — JWT-scoped actor, cross-admin key reuse impossible) + dip-stock/start (admin "เริ่มนับสต็อก" double-click race → 2× session INSERT + 10K+ row snapshot DB storm; **constant-marker** `{action: 'start'}` — handler takes no params, fourth constant-marker instance) + dip-stock/force-close (admin "ปิด session" double-click → 2× UPDATE + b2b_log fires twice audit noise; **single** `{session_id}` — 0 means close-any-in-progress) + stock/settings (admin "บันทึก" → 4× update_option × 2 = 8 DB writes + 2× option_changed hooks; **selective save** body hash — only fields PRESENT in request hashed; alert_enabled boolean discriminator) + shipping-defaults (admin "บันทึกค่าเริ่มต้น Flash" → 2× wp_dinoco_flash_audit INSERT on flag toggle + 2× cache flush + 2× update_option; **bulk-shape** with express_threshold sub-object normalized via ksort + flag_enabled **boolean discriminator** — V.42 enable/disable is single most consequential Flash admin action, ON↔OFF flip catches via 409). **Inventory namespace coverage 9 → 13 (+4)**. **LIFF AI namespace coverage 1 → 2 (+1)**. 19 B2F + 42 B2B + **13 inventory** + 13 MCP + **2 LIFF AI**. **First sustained 45% milestone past 9/20 of POST surface against authoritative Round 30 census denominator.** Pattern mix: 2× constant-marker (dip-stock/start — 4th instance after stock/initialize R30 + manual-flash-test R32 + daily-summary R39) + 2× single (claim-status + dip-stock/force-close) + 1× selective save (stock-settings) + 1× bulk-shape with boolean discriminator (shipping-defaults flag_enabled flip). Constant-marker pattern firmly proven across 4 endpoints in 4 rounds. |
| Target: 60% | future | TBD | ~118 endpoints — major sustained effort. Realistic timeline: Round 50+ |

> **Why no 50% milestone in Round 30**: User-facing milestone celebration in the
> Round 30 prompt assumed the ~75 denominator. The REST endpoint census (F3
> deferred fix from Round 29) revealed the real denominator is 193 POST
> endpoints. Round 30 still represents major progress (39 endpoints integrated +
> tracker drift fix + 21 new contract tests), but mathematical 50% (~97
> endpoints) is a future milestone, not Round 30.

---

## Integrated endpoints (129) — Round 48 push toward 70% milestone

| # | Endpoint | Snippet | Pattern | Round | Status |
|---|----------|---------|---------|-------|--------|
| 1 | `POST /b2b/v1/place-order` | `[B2B] Snippet 3` V.42.10 | single (edit_ticket discriminates new vs edit) | 19 | integrated |
| 2 | `POST /b2b/v1/manual-flash-create` | `[B2B] Snippet 3` V.42.10 | single (per-PNO Flash dispatch) | 19 | integrated |
| 3 | `POST /b2f/v1/create-po` | `[B2F] Snippet 2` V.11.11 | single (DD-3 composite merge) | 19 | integrated |
| 4 | `POST /b2b/v1/manual-flash-cancel` | `[B2B] Snippet 3` V.42.11 | single | 23 | integrated |
| 5 | `POST /b2f/v1/po-update` | `[B2F] Snippet 2` V.11.12 | single (exchange_rate IMMUTABLE excluded) | 23 | integrated |
| 6 | `POST /b2f/v1/receive-goods` | `[B2F] Snippet 2` V.11.12 | single (photos[] excluded — FormData binary) | 23 | integrated |
| 7 | `POST /b2b/v1/confirm-order` | `[B2B] Snippet 5` V.33.4 | single | 23 | integrated |
| 8 | `POST /b2b/v1/flash-create` | `[B2B] Snippet 5` V.33.4 | single | 23 | integrated |
| 9 | `POST /b2b/v1/update-status` | `[B2B] Snippet 5` V.33.4 | single (status enum) | 23 | integrated |
| 10 | `POST /b2b/v1/cancel-request` | `[B2B] Snippet 3` V.42.12 | single | 25 | integrated |
| 11 | `POST /b2f/v1/po-cancel` | `[B2F] Snippet 2` V.11.13 | single | 25 | integrated |
| 12 | `POST /b2f/v1/maker-confirm` | `[B2F] Snippet 2` V.11.13 | single (JWT-scoped maker_id) | 25 | integrated |
| 13 | `POST /b2f/v1/record-payment` | `[B2F] Snippet 2` V.11.13 | single (slip_image binary excluded) | 25 | integrated |
| 14 | `POST /b2b/v1/bo-fulfill` | `[B2B] Snippet 16` V.3.4 | single | 19 | integrated |
| 15 | `POST /b2b/v1/bo-confirm-full` | `[B2B] Snippet 16` V.3.4 | single (shape collides with bo-undo-split — namespace-discriminated) | 26 | integrated |
| 16 | `POST /b2b/v1/bo-split` | `[B2B] Snippet 16` V.3.4 | **bulk** (splits[] sort by sku) | 26 | integrated |
| 17 | `POST /b2b/v1/bo-undo-split` | `[B2B] Snippet 16` V.3.4 | single (shares shape with bo-confirm-full) | 26 | integrated |
| 18 | `POST /b2f/v1/maker-deliver` | `[B2F] Snippet 2` V.11.14 | **bulk** (delivery_items[] sort by sku) | 26 | integrated |
| 19 | `POST /liff-ai/v1/lead/{id}/accept` | `[LIFF AI] Snippet 1` V.1.11 | single | 26 | integrated |
| 20 | `POST /b2b/v1/bo-cancel-item` | `[B2B] Snippet 16` V.3.5 | single | 27 | integrated |
| 21 | `POST /b2b/v1/bo-bulk-fulfill` | `[B2B] Snippet 16` V.3.5 | **bulk** (items[] sort by bo_queue_id) | 27 | integrated |
| 22 | `POST /b2b/v1/bo-bulk-cancel` | `[B2B] Snippet 16` V.3.5 | **bulk** (bo_queue_ids[] sort + dedup + reason) | 27 | integrated |
| 23 | `POST /b2f/v1/po-complete` | `[B2F] Snippet 2` V.11.15 | single (FSM completed terminal) | 27 | integrated |
| 24 | `POST /dinoco-stock/v1/dip-stock/approve` | `[Admin System] DINOCO Global Inventory Database` V.45.3 | single (variance items[]) | 27 | integrated |
| 25 | `POST /b2b/v1/admin-stock-unlock` | `[B2B] Snippet 3` V.42.13 | **bulk-of-targets** (notify_tickets[] sort + dedup) | **28** | **integrated** |
| 26 | `POST /b2b/v1/admin-stock-mark-oos` | `[B2B] Snippet 3` V.42.13 | single | **28** | **integrated** |
| 27 | `POST /b2b/v1/admin-submit-tracking` | `[B2B] Snippet 3` V.42.13 | **bulk** (entries[] sort by ticket_id) | **28** | **integrated** |
| 28 | `POST /b2f/v1/approve-reschedule` | `[B2F] Snippet 2` V.11.16 | single (boolean discriminator) | **28** | **integrated** |
| 29 | `POST /b2f/v1/reject-resolve` | `[B2F] Snippet 2` V.11.16 | single (action enum financial impact) | **28** | **integrated** |
| 30 | `POST /b2b/v1/combined-slip-upload` | `[B2B] Snippet 3` V.42.14 | **bulk** (ticket_ids[] sort+dedup + gid; image_base64 EXCLUDED) | **29** | **integrated** |
| 31 | `POST /b2b/v1/manual-flash-ready` | `[B2B] Snippet 3` V.42.14 | mixed single/bulk (pno + all_pnos[] sort+dedup) | **29** | **integrated** |
| 32 | `POST /b2b/v1/delete-ticket` | `[B2B] Snippet 5` V.33.7 | single (shares {ticket_id} shape with recalculate-total — namespace-discriminated) | **29** | **integrated** |
| 33 | `POST /b2b/v1/recalculate-total` | `[B2B] Snippet 5` V.33.7 | single (shares {ticket_id} shape with delete-ticket — namespace-discriminated) | **29** | **integrated** |
| 34 | `POST /b2b/v1/import-distributors` | `[B2B] Snippet 9` V.34.1 | **bulk** (rows[] sort by gid + dry_run discriminator) | **29** | **integrated** |
| 35 | `POST /b2b/v1/bo-fulfill` (DRIFT FIXED) | `[B2B] Snippet 16` V.3.6 | single (items[sort by bo_queue_id, qty]) | **30** | **integrated** ✅ |
| 36 | `POST /dinoco-mcp/v1/claim-manual-create` | `[System] DINOCO MCP Bridge` V.2.4 | single (source_id primary discriminator) | **30** | **integrated** |
| 37 | `POST /dinoco-mcp/v1/lead-create` | `[System] DINOCO MCP Bridge` V.2.4 | single (source_id + phone identity) | **30** | **integrated** |
| 38 | `POST /dinoco-stock/v1/stock/initialize` | `[Admin System] DINOCO Global Inventory Database` V.45.4 | constant-marker `{action: 'init'}` | **30** | **integrated** |
| 39 | `POST /dinoco-stock/v1/stock/adjust` | `[Admin System] DINOCO Global Inventory Database` V.45.4 | single (type discriminates add/subtract) | **30** | **integrated** |
| 40 | `POST /dinoco-stock/v1/stock/transfer` | `[Admin System] DINOCO Global Inventory Database` V.45.4 | single (from_wh+to_wh swap caught) | **30** | **integrated** |
| 41 | `POST /dinoco-mcp/v1/claim-manual-update` | `[System] DINOCO MCP Bridge` V.2.5 | single (status enum + case_type + tracking) | **31** | **integrated** |
| 42 | `POST /dinoco-mcp/v1/lead-update` | `[System] DINOCO MCP Bridge` V.2.5 | single (status enum + updated_by + followup_at) | **31** | **integrated** |
| 43 | `POST /dinoco-stock/v1/product/pricing` | `[Admin System] DINOCO Global Inventory Database` V.45.5 | single (selective save — only present fields hashed) | **31** | **integrated** |
| 44 | `POST /dinoco-stock/v1/warehouse` | `[Admin System] DINOCO Global Inventory Database` V.45.5 | single (id discriminates create vs update) | **31** | **integrated** |
| 45 | `POST /b2f/v1/maker-reject` | `[B2F] Snippet 2` V.11.17 | single (JWT-scoped maker_id + reason in hash) | **31** | **integrated** |
| 46 | `POST /b2f/v1/maker-reschedule` | `[B2F] Snippet 2` V.11.18 | single (JWT-scoped maker_id + new_date in hash) | **32** | **integrated** |
| 47 | `POST /b2b/v1/manual-flash-test` | `[B2B] Snippet 3` V.42.15 | constant-marker `{action: 'test'}` | **32** | **integrated** |
| 48 | `POST /b2b/v1/bo-update-eta` | `[B2B] Snippet 16` V.3.7 | single (notes silent double-append guard) | **32** | **integrated** |
| 49 | `POST /b2b/v1/bo-restock-scan` | `[B2B] Snippet 16` V.3.7 | single (sku target — empty = full scan) | **32** | **integrated** |
| 50 | `POST /b2f/v1/reject-lot` | `[B2F] Snippet 2` V.11.18 | single (po_id + reason in hash; pair with maker-reschedule) | **32** | **integrated** |
| 51 | `POST /b2f/v1/maker-product` | `[B2F] Snippet 2` V.11.19 | single (id discriminates create/update + cost in hash) | **33** | **integrated** |
| 52 | `POST /b2f/v1/maker` | `[B2F] Snippet 2` V.11.19 | single (id discriminates create/update + bank/credit fields in hash) | **33** | **integrated** |
| 53 | `POST /b2f/v1/po-undo-submit` | `[B2F] Snippet 2` V.11.19 | single (auth-scoped user_id from get_current_user_id — cross-tenant cache poison guard) | **33** | **integrated** |
| 54 | `POST /dinoco-mcp/v1/distributor-notify` | `[System] DINOCO MCP Bridge` V.2.6 | single (lead_id primary discriminator + type Flex vs follow_up) — caches HTTP 200 only | **33** | **integrated** |
| 55 | `POST /dinoco-mcp/v1/customer-link` | `[System] DINOCO MCP Bridge` V.2.6 | single (source_id + platform discriminates FB vs IG namespaces) | **33** | **integrated** |
| 56 | `POST /b2b/v1/bo-clear-enum-flag` | `[B2B] Snippet 16` V.3.8 | single (distributor_id — log/alert spam guard; storage idempotent) | **34** ⭐ | **integrated** |
| 57 | `POST /dinoco-mcp/v1/kb-suggest` | `[System] DINOCO MCP Bridge` V.2.7 | single (question normalized via mb_strtolower + trim — matches handler dedup) | **34** ⭐ | **integrated** |
| 58 | `POST /dinoco-mcp/v1/brand-voice-submit` | `[System] DINOCO MCP Bridge` V.2.7 | single (sentiment edits between retries → 409 — ML signal integrity) | **34** ⭐ | **integrated** |
| 59 | `POST /b2b/v1/distributor/delete` | `[B2B] Snippet 9` V.34.2 | single (id — log/alert spam guard; wp_delete_post idempotent) | **34** ⭐ | **integrated** |
| 60 | `POST /b2b/v1/distributor/toggle-bot` | `[B2B] Snippet 9` V.34.2 | **boolean-discriminator** (bot_enabled flip caught by hash; complements 5s transient dedup) | **34** ⭐ | **integrated** |
| 61 | `POST /dinoco-mcp/v1/dashboard-inject-metrics` | `[System] DINOCO MCP Bridge` V.2.8 | single (metrics_signature = sha1 of sorted name=>value pairs — order-stable) | **35** | **integrated** |
| 62 | `POST /dinoco-mcp/v1/lead-attribution` | `[System] DINOCO MCP Bridge` V.2.8 | single (event enum + lead_id discriminate; revenue double-count guard) | **35** | **integrated** |
| 63 | `POST /dinoco-mcp/v1/inventory-changed` | `[System] DINOCO MCP Bridge` V.2.8 | single (action enum in/out/hold/release + UPPER sku) | **35** | **integrated** |
| 64 | `POST /dinoco-mcp/v1/kb-updated` | `[System] DINOCO MCP Bridge` V.2.8 | single (trigger_source admin_save vs bulk_import — Qdrant rebuild scope) | **35** | **integrated** |
| 65 | `POST /dinoco-mcp/v1/product-compatibility` | `[System] DINOCO MCP Bridge` V.2.8 | single (brand+model normalized via mb_strtolower + trim — catalog query cache) | **35** | **integrated** |
| 66 | `POST /b2b/v1/bo-reject` | `[B2B] Snippet 16` V.3.9 | single (order_id + reason discriminator — admin-edited reason text in audit/Flex) | **36** ⭐ | **integrated** |
| 67 | `POST /b2b/v1/flash-cancel` | `[B2B] Snippet 5` V.33.8 | single (ticket_id — Flash per-PNO API charge guard + 1015 misleading code dedup) | **36** ⭐ | **integrated** |
| 68 | `POST /b2b/v1/flash-cancel-notify` | `[B2B] Snippet 5` V.33.8 | single (ticket_id — shares shape with flash-cancel; namespace-discriminated) | **36** ⭐ | **integrated** |
| 69 | `POST /b2b/v1/flash-switch-manual` | `[B2B] Snippet 5` V.33.8 | single (ticket_id — RPi duplicate manual label print guard + admin Flex spam dedup) | **36** ⭐ | **integrated** |
| 70 | `POST /dinoco-stock/v1/stock/hold` | `[Admin System] DINOCO Global Inventory Database` V.45.6 | **boolean-discriminator** (sku UPPER + hold flip caught by hash; release-after-hold = 409) | **36** ⭐ | **integrated** |
| 71 | `POST /b2b/v1/print-test` | `[B2B] Snippet 3` V.42.16 | **constant-marker** ({type} — type discriminates label/invoice/picking format) | **37** | **integrated** |
| 72 | `POST /b2b/v1/print-requeue/{ticket_id}` | `[B2B] Snippet 3` V.42.16 | single ({ticket_id} — admin/RPi reprint guard; shares shape with rpi-accept-order + rpi-flash-ready, namespace-discriminated) | **37** | **integrated** |
| 73 | `POST /b2b/v1/rpi-accept-order` | `[B2B] Snippet 3` V.42.16 | single ({ticket_id} — RPi kiosk FSM transition; replay turns 400 surface into cached 200) | **37** | **integrated** |
| 74 | `POST /b2b/v1/rpi-flash-ready` | `[B2B] Snippet 3` V.42.16 | single ({ticket_id} — Flash /notify quota guard; 4 success store sites: already-courier / active-pickup-reuse / new-pickup-success / queued-retry) | **37** | **integrated** |
| 75 | `POST /b2b/v1/slip-upload` | `[B2B] Snippet 3` V.42.16 | **bulk-shape** ({ticket_id, gid} — image_base64 EXCLUDED 5MB binary hash flap; gid from session prevents cross-group cache poisoning; CRITICAL Slip2Go double-charge guard) | **37** | **integrated** |
| 76 | `POST /b2b/v1/bo-notify` | `[B2B] Snippet 3` V.42.17 | **bulk-shape** ({ticket_id, items sorted by sku} — items array sort makes hash deterministic regardless of admin input order; admin Flex spam + bo_available_qty churn guard) | **38** ⭐ | **integrated** |
| 77 | `POST /b2b/v1/rpi-command` | `[B2B] Snippet 3` V.42.17 | **bulk-shape** ({command, params normalized via ksort} — params object normalized for deterministic hash; admin queue spam guard + cmd_id pollution dedup) | **38** ⭐ | **integrated** |
| 78 | `POST /b2b/v1/rpi-flash-box-packed` | `[B2B] Snippet 3` V.42.17 | single ({pno} globally unique — Flash /notify quota burn guard on manifest-completion trigger; 4 success store sites: reused_pickup / called / pending / partial-status) | **38** ⭐ | **integrated** |
| 79 | `POST /b2b/v1/flash-ship-packed` | `[B2B] Snippet 3` V.42.17 | single ({ticket_id} — partial-ship timeout dialog double-confirm guard; shares shape with rpi-flash-ready + print-requeue + rpi-accept-order, namespace-discriminated) | **38** ⭐ | **integrated** |
| 80 | `POST /b2b/v1/flash-label` | `[B2B] Snippet 5` V.33.9 | single ({pno} globally unique — Flash /open/v3/orders/printPdf quota guard; binary PDF cannot replay through cache, returns JSON marker on replay; shares shape with rpi-flash-box-packed, namespace-discriminated) | **38** ⭐ | **integrated** |
| 81 | `POST /b2b/v1/flash-ready-to-ship` | `[B2B] Snippet 5` V.34.0 | **bulk-shape** ({ticket_ids sorted+deduped} — handler accepts single ticket_id OR array param; bulk admin "พร้อมจัดส่ง" double-click → courier /notify quota burn + Flex spam guard) | **39** | **integrated** |
| 82 | `POST /b2b/v1/daily-summary` | `[B2B] Snippet 5` V.34.0 | **constant-marker** ({action: 'trigger-summary'} — no params; admin manual-trigger "ส่งสรุป" double-click → admin Flex summary card + DB storm cron-replica read guard; 3rd constant-marker instance after stock/initialize R30 + manual-flash-test R32) | **39** | **integrated** |
| 83 | `POST /b2b/v1/flash-webhook-setup` | `[B2B] Snippet 9` V.34.3 | **bulk-shape** ({webhook_url, codes:[0..4]} — webhook_url change between retries → 409 alerts env mismatch; admin "ตั้งค่า Webhook" double-click → 2× POST /notify/setting × 5 codes = 10 Flash API calls instead of 5 quota burn) | **39** | **integrated** |
| 84 | `POST /b2b/v1/flash-api-test` | `[B2B] Snippet 9` V.34.3 | single ({action, mch_id, is_production} — env discriminator catches training↔prod switch between retries; errors NOT cached so admin can immediately retry after config fix without TTL wait) | **39** | **integrated** |
| 85 | `POST /b2b/v1/test-push` | `[B2B] Snippet 9` V.34.3 | single ({target, message} — different message text across retries → 409 admin changed mind; same exact retry → cached 200 → single LINE push to admin group instead of spam) | **39** | **integrated** |
| 86 | `POST /liff-ai/v1/claim/{id}/status` | `[LIFF AI] Snippet 1` V.1.12 | single ({claim_id, status enum, note, actor uid from JWT} — JWT-scoped actor blocks cross-admin key reuse; admin status dropdown → slow ACF save → 2× dinoco_set_claim_status() → 2× status_history + 2× admin_note + 2× hook chain LINE push) | **40** ⭐ | **integrated** |
| 87 | `POST /dinoco-stock/v1/dip-stock/start` | `[Admin System] DINOCO Global Inventory Database` V.45.7 | **constant-marker** ({action: 'start'} — 4th constant-marker instance after stock/initialize R30 + manual-flash-test R32 + daily-summary R39; 10K+ row snapshot DB storm guard + duplicate session_id INSERT race during microsecond before commit) | **40** ⭐ | **integrated** |
| 88 | `POST /dinoco-stock/v1/dip-stock/force-close` | `[Admin System] DINOCO Global Inventory Database` V.45.7 | single ({session_id} — 0 means close-any-in-progress, server resolves at runtime; admin "ปิด session" double-click → 2× UPDATE + b2b_log fires twice audit noise) | **40** ⭐ | **integrated** |
| 89 | `POST /dinoco-stock/v1/stock/settings` | `[Admin System] DINOCO Global Inventory Database` V.45.7 | **selective save** ({default_threshold, default_reorder, alert_enabled, dip_interval} — only fields present in request hashed; alert_enabled boolean discriminator catches ON↔OFF flip; admin double-click → 4× update_option × 2 = 8 DB writes guard) | **40** ⭐ | **integrated** |
| 90 | `POST /dinoco-stock/v1/shipping-defaults` | `[Admin System] DINOCO Global Inventory Database` V.45.7 | **bulk-shape** ({weight/dims/article_category present, express_threshold sub-object ksort-normalized, flag_enabled boolean discriminator} — V.42 enable/disable is single most consequential Flash admin action; ON↔OFF flip catches via 409 prevents accidental flag desync from cached replay; admin double-click → 2× wp_dinoco_flash_audit INSERT + 2× cache flush guard) | **40** ⭐ | **integrated** |
| 91 | `POST /dinoco-stock/v1/dip-stock/count` | `[Admin System] DINOCO Global Inventory Database` V.45.8 | **bulk-shape** ({session_id, items: sorted-by-sku [{sku UPPER, actual_qty, note}]} — admin "บันทึกผลนับ" double-click → 2× SQL UPDATE per item + variance/variance_pct recompute waste + counted_skus recount + audit log churn; different actual_qty between retries → 409 prevents wrong variance stuck via cached replay) | **41** | **integrated** |
| 92 | `POST /dinoco-stock/v1/box-template` | `[Admin System] DINOCO Global Inventory Database` V.45.8 | single ({code, name, length_cm, width_cm, height_cm, tare_weight_g, max_weight_g, owner_type, sort_order} — admin "เพิ่มกล่อง" double-click race → 2× INSERT slips through handler 409 dedup microsecond window before commit + 2× cache flush + 2× dinoco_invalidate_box_template_cache hook fire; same code resubmit = cached 200 replay) | **41** | **integrated** |
| 93 | `POST /dinoco-stock/v1/box-template/{id}` | `[Admin System] DINOCO Global Inventory Database` V.45.8 | single ({id, ...selective fields present: name, owner_type, length_cm, width_cm, height_cm, tare_weight_g, max_weight_g, sort_order} — admin "แก้ไขกล่อง" double-click → 2× UPDATE + updated_at re-stamp + cache flush 2× + downstream Snippet 1 dinoco_resolve_pno_shipping() static memo flush twice; id discriminates from create endpoint; dimension change between retries → 409) | **41** | **integrated** |
| 94 | `POST /b2f/v1/maker/delete` | `[B2F] Snippet 2` V.11.20 | single ({id} — admin "ลบโรงงาน" double-click on slow ACF write → 2nd request finds maker already inactive idempotent at storage but 2× b2f_log entry + admin Flex push double-fire risk on hook chain; shares shape with maker-product/delete via SHAPE-MATCH pattern) | **41** | **integrated** |
| 95 | `POST /b2f/v1/maker-product/delete` | `[B2F] Snippet 2` V.11.20 | single ({id} — admin "ลบสินค้า" double-click → 1st wp_delete_post(true) succeeds + b2f_dual_soft_delete_junction + b2f_junction_updated hook + cache invalidation; 2nd request hits NOT_FOUND 404 confusion — wrapper turns "already deleted" 404 into cached 200 retry-friendly UX; SHAPE-MATCH with maker/delete, namespace-discriminated) | **41** | **integrated** |
| 96 | `POST /b2b/v1/invoice-gen` | `[B2B] Snippet 3` V.42.18 | single ({ticket_id, gid} — customer/admin LIFF "ดูใบแจ้งหนี้" double-click on slow GD render → 2× expensive PDF generation b2b_generate_invoice_pages + 2× upload to /wp-content/uploads/b2b-invoices/; gid from session prevents cross-group cache poisoning) | **42** ⭐⭐⭐ | **integrated** |
| 97 | `POST /b2b/v1/manual-flash-label` | `[B2B] Snippet 3` V.42.18 | single ({pno} globally unique — admin "ดาวน์โหลด Label Manual" double-click on slow Flash API → 2× call to b2b_flash_get_label_pdf → 2× Flash /open/v3/orders/printPdf quota burn; PDF binary CANNOT replay through cache — wrapper stores lightweight cached_replay marker on success store) | **42** ⭐⭐⭐ | **integrated** |
| 98 | `POST /b2b/v1/auth-group` | `[B2B] Snippet 3` V.42.18 | single ({group_id, line_uid} — LIFF auth init double-fire on slow LINE verify → 2× session_token issuance + 2× rate-limit consumption + log spam; both fields required for distinct auth identity; rate-limit increment ALREADY happened so wrapper additionally protects token issuance + downstream side-effects only) | **42** ⭐⭐⭐ | **integrated** |
| 99 | `POST /liff-ai/v1/lead/{id}/note` | `[LIFF AI] Snippet 1` V.1.13 | single ({lead_id, note, role, actor uid} — admin/dealer LIFF "บันทึกหมายเหตุ" double-tap on slow MongoDB → 2× POST to agent proxy → 2× note insert into lead.history MongoDB array → user sees duplicate "by" entries UX + 2× downstream notify hooks; actor scoped from JWT $auth['uid'] cross-admin/dealer key reuse impossible; note text edits between retries → 409 integrity guard) | **42** ⭐⭐⭐ | **integrated** |
| 100 | `POST /dinoco-stock/v1/product/upload-image` | `[Admin System] DINOCO Global Inventory Database` V.45.9 | **binary-fingerprint NEW R42** ({sku, filename, size, content_sha1} — admin "อัพโหลดรูป" double-click on slow upload 5MB image → 2× S3/local file write + 2× catalog UPDATE + 2× ACF update_field + 2× set_post_thumbnail; **binary blob EXCLUDED** from hash; content_sha1 = sha1_file of upload tmp file ~50ms — fingerprint distinguishes "same file vs different file" without storing 5MB; admin selected wrong file mid-retry = different sha1 = 409) | **42** ⭐⭐⭐ | **integrated** |
| 101 | `POST /b2b/v1/invoice/init` | `[Admin System] DINOCO Manual Invoice System` V.34.11 | **constant-marker** ({action: 'init', user_id} — admin "เริ่มออกบิล" double-click on slow wp_insert_post → 2× draft created + 2× invoice number consumed (gap in sequence) + 2× audit log entries; user_id from current admin scopes draft per-admin; 5th constant-marker after R30/R32/R39/R40) | **43** | **integrated** |
| 102 | `POST /b2b/v1/invoice/issue` | `[Admin System] DINOCO Manual Invoice System` V.34.11 | single ({id} — admin "ออกบิล/ส่ง LINE" double-click on slow LINE push → 2× Flex card + 2× invoice image push to distributor LINE group + 2× FSM transition draft→awaiting_payment + 2× debt add via dinoco_inv_apply_debt; FSM gate prevents 2nd write but LINE push fires before status check completes — wrapper short-circuits at hash-check level) | **43** | **integrated** |
| 103 | `POST /b2b/v1/invoice/record-payment` | `[Admin System] DINOCO Manual Invoice System` V.34.11 | single ({id, amount, note} — CRITICAL retry-prone: admin "บันทึกชำระ" double-click on slow ACF/SQL → 2× _inv_paid_amount add + 2× partial_payments json append + 2× debt subtract via b2b_recalculate_debt → debt double-cleared; FOR UPDATE lock prevents physical race but 2nd retry AFTER 1st commit still re-adds; amount round(2) for float-precision normalize; different amount mid-retry → 409) | **43** | **integrated** |
| 104 | `POST /b2b/v1/invoice/record-refund` | `[Admin System] DINOCO Manual Invoice System` V.34.11 | single ({id, amount, reason, method} — CRITICAL retry-prone mirrors record-payment: admin "บันทึกคืนเงิน" double-click → 2× refund entry + 2× _inv_refunded_amount add + 2× FSM paid→awaiting_payment + 2× debt re-add → debt double-credited → distributor sees wrong outstanding balance; method enum (manual\|bank_transfer\|cash\|credit_note) discriminates accounting category) | **43** | **integrated** |
| 105 | `POST /b2b/v1/invoice/cancel` | `[Admin System] DINOCO Manual Invoice System` V.34.11 | single ({id, force, force_reason} — admin "ยกเลิก" double-click on slow LINE push → 2× cancel Flex card to distributor LINE group + 2× FSM transition (2nd → 400 "ยกเลิกแล้ว") + 2× dinoco_inv_reverse_debt → debt double-reverted; force boolean discriminator + force_reason text catches admin re-issuing different excuse mid-retry → 409 prevents accidental override of audit log entry) | **43** | **integrated** |
| 106 | `POST /b2b/v1/flash-test/run-step` | `[B2B] Snippet 9` V.34.4 | single ({ticket_id, step} — sysadmin runner double-click → 2× expensive Flash dispatch / API call / DB mutation per step; step enum discriminator catches admin re-running different step on same ticket → 409; **NEW IIFE wrap pattern** for 200+ LOC switch-heavy function — wrap entire switch in closure → capture WP_REST_Response → store only on success exit, zero refactoring of existing case returns) | **44** ⭐ | **integrated** |
| 107 | `POST /b2b/v1/flash-test/simulate-webhook` | `[B2B] Snippet 9` V.34.4 | single ({ticket_id, type} — admin re-fires webhook simulator double-click → 2× state-mutation per type e.g. delivered fires order auto-complete; returned generates new returnedPno; weight/price overwrites prior data; type enum discriminator; same IIFE wrap pattern) | **44** ⭐ | **integrated** |
| 108 | `POST /brand-voice/v1/api-keys/generate` | `[Admin System] DINOCO Brand Voice Pool` V.2.12 | single ({name} — admin "Generate Key" double-click on slow update_option → 2× api_key INSERT into bv_api_keys array → 2 keys exist in wild **SECURITY RISK**; different label between retries → 409; same name retry → cached 200 returns FIRST raw_key + audit log entry; **FIRST Brand Voice namespace idempotency wrap**) | **44** ⭐ | **integrated** |
| 109 | `POST /brand-voice/v1/api-keys/revoke` | `[Admin System] DINOCO Brand Voice Pool` V.2.12 | single ({index} — admin "Revoke" double-click during slow reload race → 2× array_splice on adjacent indices → wrong key revoked **AUDIT LOG SCRAMBLED**; index discriminator catches admin clicking different row mid-retry → 409 surfaces security event; same index retry → cached 200 prevents double-decrement of array which would skip middle key) | **44** ⭐ | **integrated** |
| 110 | `POST /b2b/v1/discount-mapping` | `[B2B] Snippet 6` V.31.4 | **bulk-shape** ({items[]} sorted by SKU UPPER + per-row normalized fields — admin batch upsert double-click or external system retrying on network drop → 2× custom table writes + 2× ACF update_field per item × 500 items = up to 5000 redundant DB ops + 2× transient flush; different items[] mid-retry → 409 catches admin business decision change; same retry → cached 200) | **44** ⭐ | **integrated** |
| 111 | `POST /dinoco-stock/v1/product/shipping/bulk` | `[Admin System] DINOCO Global Inventory Database` V.45.10 | **binary-fingerprint** ({csv_sha1, csv_size, line_count} — UPGRADED ad-hoc transient `set_transient('shipping_bulk_idem_'+md5(key))` to central helper; 100KB CSV cannot fit idempotency_keys row directly so sha1 fingerprint distinguishes "same CSV vs different rows mid-retry" without storing payload; legacy `set_transient` shadow-write kept during DAY_IN_SECONDS upgrade window for V.45.9 in-flight clients; admin uploads different rows mid-retry → 409 surfaces accidental override of business decision; **2nd binary-fingerprint instance after R42 upload-image — pattern proven across 2 rounds for binary/large-payload endpoints**) | **45** ⭐ | **integrated** |
| 112 | `POST /dinoco-stock/v1/shipping-compute` | `[Admin System] DINOCO Global Inventory Database` V.45.10 | **bulk-shape** ({items[]} sorted by SKU UPPER + total_qty per row via usort — M6 "Test Payload" admin tool; pure compute path BUT 500-item dinoco_resolve_manifest_shipping() is expensive recursion + catalog lookups + box-template joins; admin double-click on slow tab switch → 2× resolver pass = CPU waste; same items + qtys retry = idempotent replay (instant); different SKU set or qty mid-retry → 409) | **45** ⭐ | **integrated** |
| 113 | `POST /b2b/v1/print-ack` | `[B2B] Snippet 3` V.42.19 | single ({ticket_id, status} — RPi network retry / double-ack race on flaky wifi → 2× update_field(print_status) + 2× admin LINE Flex spam on error/partial during peak ops hours = 50+ duplicate notifications drown ops chat + 2× flash_packing_status state churn; status enum discriminator (done/error/partial) catches RPi state confusion when reporting `done` then `partial` from misread output → 409 forces RPi to fix internal state; msg/details/printed_at EXCLUDED from hash — diagnostic drift fields) | **45** ⭐ | **integrated** |
| 114 | `POST /b2b/v1/print-heartbeat` | `[B2B] Snippet 3` V.42.19 | single ({hostname} only — RPi 30s heartbeat double-fire on network glitch / systemd timer race → 2× update_option(b2b_print_device_info) idempotent at storage BUT printer-status-change detection (idle→disabled) fires `b2b_push_to_admin` Flex once per heartbeat → admin gets DUPLICATE "🖨️ Printer สถานะเปลี่ยน" alerts; RPi auto-generates new key per heartbeat tick → distinct keys per legitimate beat; same key = retry of same tick = idempotent; timestamp/cpu_temp/uptime/printers EXCLUDED — drift naturally per beat without semantic intent change; different hostname using same key → 409 surfaces fleet key collision deployment error) | **45** ⭐ | **integrated** |
| 115 | `POST /b2b/v1/rpi-command-ack` | `[B2B] Snippet 3` V.42.19 | single ({cmd_id, status} — cmd_id naturally unique BUT array_filter+array_unshift on b2b_rpi_pending_commands+b2b_rpi_command_history arrays non-idempotent; 2nd call after pending already drained → cmd_info null → history row labelled `'unknown'` (audit log corruption) + 2× admin LINE Flex on error duplicates "❌ RPi command failed" alert; status enum discriminator catches RPi confusion done→error mid-retry from misread output; same shape as print-ack pair) | **45** ⭐ | **integrated** |
| 116 | `POST /b2b/v1/manual-flash-status` | `[B2B] Snippet 3` V.42.20 | single ({pno} — admin/RPi "เช็คสถานะ Manual Flash" double-click on slow Flash network → 2× b2b_flash_get_routes(pno) Flash Routes API quota burn + state>0 → 2× b2b_flash_manual_shipment_webhook(pno) status mutation + 2× notify spam; pno globally unique per shipment; same PNO retry = replay instant no quota burn; different PNO mid-retry → 409 catches admin typo/UI form drift) | **🎯🎯 46** ⭐⭐ | **integrated** |
| 117 | `POST /b2b/v1/distributor` | `[B2B] Snippet 9` V.34.5 | single ({id, shop_name, line_group_id} core — admin "บันทึกตัวแทน" double-click race → 2× wp_insert_post (NEW) + 2× ACF update_field × 15 fields + 2× recalc_debt potential; id discriminates create (id=0) vs update (id>0); full body has 15+ fields rank/credit/address/phone/recommended_skus too noisy minimum viable hash; admin renamed shop mid-retry → 409 catches business decision change) | **🎯🎯 46** ⭐⭐ | **integrated** |
| 118 | `POST /b2b/v1/settings` | `[B2B] Snippet 9` V.34.5 | **bulk-shape** ({bank_name, bank_account, bank_holder, company_name, promptpay_id} fields PRESENT only sorted by ksort — admin "บันทึกตั้งค่า" double-click → 2× update_option(b2b_settings) array overwrite race; selective save admin may save single field without overwriting others; admin corrected typo in bank_account mid-retry → 409 surfaces business decision change avoid silent overwrite) | **🎯🎯 46** ⭐⭐ | **integrated** |
| 119 | `POST /b2b/v1/print-settings` | `[B2B] Snippet 9` V.34.5 | **bulk-shape with boolean discriminator** ({auto_print, shipping_mode, regenerate_key, wh_*, reg_*} fields PRESENT only sorted by ksort — admin "บันทึกตั้งค่า Print" double-click → 2× update_option × 4 (auto_print + shipping_mode + warehouse_address + registered_address) + if regen=1 → 2× wp_generate_password creates 2 different API keys last one wins **SECURITY-CRITICAL key rotation race**; regen boolean discriminator catches toggle false→true mid-retry — 2 different rotation events → 409 prevents silent dual-rotation) | **🎯🎯 46** ⭐⭐ | **integrated** |
| 120 | `POST /liff-ai/v1/lead/{id}/status` | `[LIFF AI] Snippet 1` V.1.14 | single ({lead_id, status, actor_uid from JWT} — admin LIFF "เปลี่ยนสถานะ Lead" double-tap on slow MongoDB → 2× POST to agent proxy → 2× lead status update + 2× history insert (changed_by/uid metadata) + 2× downstream notify hooks (StockBack/FollowUp Flex if status flips to waiting_stock/waiting_decision); actor scoped from JWT cross-admin key reuse impossible; status enum 17-statuses discriminator catches admin clicking different button mid-retry → 409) | **🎯🎯 46** ⭐⭐ | **integrated** |
| 121 | `POST /dinoco-stock/v1/stock/sync-missing` | `[Admin System] DINOCO Global Inventory Database` V.45.11 | **constant-marker** ({action:'sync-missing'} — admin "🔄 Sync Missing" double-click on slow drift sweep → 2× full table scan + 2× INSERT loop on missing SKUs e.g. 50 missing rows = 100 INSERTs + 2× cache invalidation; admin generates fresh key per click; same key reuse = cached 200 instant no scan + insert burn; **6th constant-marker instance** after R30 stock/initialize + R32 manual-flash-test + R39 daily-summary + R40 dip-stock/start + R43 invoice/init — pattern fully mature for "no params" admin trigger endpoints) | **47** | **integrated** |
| 122 | `POST /dinoco-stock/v1/shipping/classify/{sku}` | `[Admin System] DINOCO Global Inventory Database` V.45.11 | single ({sku, update fields ksort-normalized} — admin classify ad-hoc SKU "บันทึก pack mode" double-click on slow UPDATE → 2× UPDATE wp_dinoco_products + 2× DINOCO_Catalog::flush_memo + 2× shipping cache flush; sku is path param canonical UPPER; different pack_mode mid-retry single_box→multi_box → 409 prevents silent override of upstream resolver behavior; updated_by/updated_at EXCLUDED auto-stamped drift fields) | **47** | **integrated** |
| 123 | `POST /dinoco-stock/v1/product/shipping` | `[Admin System] DINOCO Global Inventory Database` V.45.11 | **bulk-shape selective** ({sku, update fields ksort, pack_slots[] sorted by slot_index — slot_label + box_template_id + content_weight_g per row} — admin Edit Product modal "บันทึก Shipping V.42" double-click on slow transaction (UPDATE wp_dinoco_products + DELETE+INSERT pack_slots × N) → 2× transaction commit + 2× cache invalidation + 2× downstream Snippet 1 dinoco_resolve_pno_shipping memo flush + 2× cron forecast recompute; different pack_mode/weight between retries → 409 prevents stale weight propagation through cron forecast; updated_* audit columns EXCLUDED — extends R45 shipping-compute pattern with multi-row pack_slots sort key) | **47** | **integrated** |
| 124 | `POST /dinoco-stock/v1/image-proxy` | `[Admin System] DINOCO Global Inventory Database` V.45.11 | single ({url} — admin Edit Product modal "อัพโหลดรูป" via canvas → JS calls image-proxy to fetch external CDN URL → base64 data URL CORS workaround; flaky network → 2× wp_remote_get bandwidth burn (10MB image × 2 = 20MB download); cached response includes data_url base64 directly — replay returns identical bytes (mirror upload-image R42 binary-fingerprint precedent EXCEPT direct cache vs sha1 fingerprint here because small payload fits in idempotency_keys row); different SKU image URL mid-retry → 409 prevents stale image stuck in canvas) | **47** | **integrated** |
| 125 | `POST /liff-ai/v1/agent-ask` | `[LIFF AI] Snippet 1` V.1.15 | single ({question normalized via mb_strtolower + trim, actor_uid from JWT} — admin LIFF "ถามผู้ช่วย AI" double-tap on slow OpenClaw agent proxy Gemini/Claude API quota burn → 2× LLM token spend + 2× MCP tool call chain catalog/dealer/warranty + 2× duplicate answer return confusing UX; same key + same question retry = cached 200 returns first answer prevents quota burn; admin retyped different question mid-retry → 409 catches AI intent change; actor JWT-scoped cross-admin key reuse impossible prevents cache leak; transient agent failures (is_wp_error result) NOT cached — admin retries without 409 noise; question normalization mirrors kb-suggest R34 pattern) | **47** | **integrated** |
| 126 | `POST /b2f/v1/auth-admin` | `[B2F] Snippet 2` V.11.21 | single ({line_user_id} ONLY — NOT _ts/_sig/id_token because those rotate per request even for legit retry of same admin session; LIFF Admin auth init — slow LINE id_token verify ~500ms-1s POST to api.line.me/oauth2/v2.1/verify → admin LIFF retries on flaky → 2× session_token issuance + 2× rate-limit consumption + 2× audit log spam; same admin retrying = cached 200 instant + skip LINE verify network call; cross-namespace pair with R42 /b2b/v1/auth-group same shape namespace-discriminated; errors NOT cached so admin can fix + retry without 409 from first failed attempt) | **48** | **integrated** |
| 127 | `POST /brand-voice/v1/entries` | `[Admin System] DINOCO Brand Voice Pool` V.2.13 | single ({source_url, content_hash: md5(author + content[:100] + brands_csv), platform} — Chrome extension single entry create — slow wp_insert_post + 5-10× update_post_meta + bv_invalidate_stats_cache → ext retries on flaky → 2× brand_voice CPT row + 2× sentiment counter inflation + duplicate analytics signal corruption; existing 24h transient dedup by source_url + content_hash protects identical {url, content, brands} but NOT 2× DB writes when extension generates fresh idem-key per click; body hash mirrors handler dedup_key logic deterministically; different content mid-retry → 409 surfaces sentiment edit accident) | **48** | **integrated** |
| 128 | `POST /brand-voice/v1/entries/batch` | `[Admin System] DINOCO Brand Voice Pool` V.2.13 | bulk-shape ({count, rows[]: usort by content_hash 'h' ASC each row {h, url, plt}} — Chrome extension bulk import max 50 — sysadmin double-click → 2× full loop = up to 100× wp_insert_post + 250-500 update_post_meta + 50× bv_invalidate_stats_cache → analytics signal storm; order-stable hash so admin uploading same dataset different sequence = cached 200 instant; different rows mid-retry → 409 catches admin re-uploading partial batch with row B replaced by row C) | **48** | **integrated** |
| 129 | `POST /dinoco/v1/onboard/check-group-id` | `[Admin System] DINOCO Distributor Onboarding Wizard` V.1.1 | single ({group_id, exclude_id} — admin "ตรวจสอบ" double-click on slow get_posts meta_query → 2× DB scan ~5K distributor rows × 2 = 10K row scans + UI flicker; storage idempotent (read-only) BUT prevents UX confusion + DB load on retry storm; different group_id mid-retry → 409 catches admin paste error then correction; admin opens wizard step 2 → pastes group_id → checks → corrects to right group_id mid-flow) | **48** | **integrated** |
| 130 | `POST /dinoco/v1/onboard/save` | `[Admin System] DINOCO Distributor Onboarding Wizard` V.1.1 | single ({shop_name, line_group_id, rank_system, credit_limit, credit_term_days} core — phone/address/walkin/bot_enabled excluded so admin minor metadata correction doesn't trigger 409 only core identity + commercial terms are hash-discriminators; CRITICAL retry-prone: admin "Save" double-click on slow wp_insert_post + 10× ACF update_field → race window allows 2× distributor CPT creation with same line_group_id (uniqueness check passes for 1st request, microsecond gap before commit, 2nd request sees no dup yet, both succeed → 2 dup distributors live simultaneously); admin renamed shop / changed credit mid-retry → 409 catches business decision change e.g. credit_limit raised 50K→100K) | **48** | **integrated** |

> Note: numbering goes to 95 because bo-confirm-full (15) + bo-undo-split (17) share body shape +
> delete-ticket (32) + recalculate-total (33) share body shape +
> flash-cancel (67) + flash-cancel-notify (68) share body shape +
> print-requeue (72) + rpi-accept-order (73) + rpi-flash-ready (74) + flash-ship-packed (79) all
> share {ticket_id}-only body shape (4-way intentional collision via namespace discriminator) +
> rpi-flash-box-packed (78) + flash-label (80) share {pno}-only body shape (2-way namespace-
> discriminated) +
> maker/delete (94) + maker-product/delete (95) share {id}-only body shape (2-way namespace-
> discriminated, R41 SHAPE-MATCH pair guard) — all namespace-discriminated. Total integrated
> endpoint count = 99 (Round 28: 28 + Round 29: +5 + Round 30: +6 — incl. F1 drift fix for
> bo-fulfill which had no actual wrapper despite tracker entry + Round 31: +5 + Round 32: +5
> + Round 33: +5 + Round 34: +5 + Round 35: +5 + Round 36: +5 + Round 37: +5 + Round 38: +5
> + Round 39: +5 + Round 40: +5 + Round 41: +5 + Round 42: +5 — **🎯🎯🎯 50% MAJOR MILESTONE**).
>
> **Round 29 drift-sweep finding (DRIFT-SWEEP-ROUND-29.md F1) — RESOLVED in Round 30**: `bo-fulfill`
> (#14, Round 19) was listed as "integrated" but actual code had NO wrapper. **Round 30 fixed**:
> wrapper added in `[B2B] Snippet 16` V.3.6 between input validation and `dinoco_transaction()` call.
> See entry #35 above (DRIFT FIXED ✅). 21 new contract tests in `IdempotencyRound30Test.php`.
>
> **Round 31 F1 regression guard**: NEW `tests/jest/idempotency-tracker-drift.test.js` (4 tests)
> parses this tracker + asserts each claimed file actually contains
> `dinoco_idempotency_check` call site + endpoint suffix appears in REST route
> registration. Catches the same drift class automatically on every CI run.
>
> **Round 33 drift detector enhancement**: 4 → 5 tests. Added POST-only assertion —
> every tracker row MUST start with HTTP method `POST`. Read-only endpoints (GET) are
> idempotent by definition (no side effects); accidentally adding them to the tracker
> = scope creep + misleading coverage metric. DELETE/PUT/PATCH endpoints would warrant
> wrappers if mutational, but the current tracker schema documents POST only — guard
> keeps schema consistent.

---

## Pending POST endpoints (Round 48+ candidates)

### Round 47 closure — push past 60% toward 70% milestone

> **Round 47 closure**: 124/196 = **63.3%** — push past 🎯🎯 60% MAJOR MILESTONE Round 46
> toward 70% target. Cross-snippet 2-file batch closure (5 endpoints across
> `[Admin System] DINOCO Global Inventory Database` V.45.10→V.45.11 + `[LIFF AI] Snippet 1`
> V.1.14→V.1.15). 29-round sustained Idempotency-Key campaign Rounds 18-47.
>
> **Round 47 batch composition**: Inventory admin endpoints (4 endpoints — stock/sync-missing
> constant-marker drift sweep + shipping/classify single SKU pack mode + product/shipping
> bulk-shape pack_slots[] sort + image-proxy CORS canvas fetch with cached data_url) +
> LIFF AI agent-ask (admin AI assistant — JWT-scoped cross-admin guard + question
> normalization mirrors kb-suggest R34 pattern + transient agent failures NOT cached).
>
> **Round 47 pattern milestone**: 6th constant-marker instance (stock/sync-missing) joins
> R30 stock/initialize + R32 manual-flash-test + R39 daily-summary + R40 dip-stock/start +
> R43 invoice/init — pattern fully mature for "no params" admin trigger endpoints across
> 6 endpoints in 6 rounds. New "transient agent failure NOT cached" sub-pattern for
> agent-ask: admin should retry on agent-down without 409 noise (caches 2xx success only —
> consistent with daily-summary trigger / flash-create patterns). Pattern count unchanged
> at **7 patterns**.
>
> **Round 48 recommendation**: Continue toward 70% milestone (~138/196 = +14 endpoints
> needed). Realistic path: 3-4 batches × 5 endpoints by Round 50-51. Remaining candidates:
> Inventory `warehouse` PUT/DELETE if exposed as POST verbs, B2F `maker/toggle-bot`
> (handler missing — verify) or B2F `maker-confirm`/`maker-deliver` if not yet wrapped,
> additional B2B Snippet 12 admin LIFF endpoints, Snippet 1 mass action helpers if exposed.
> Strategic note: After 60% milestone Round 46 + Round 47 push, recommend optional
> slow-down for 1-2 weeks production canary observation matching Round 42 50% pause.
> 29-round sustained campaign = significant test infra burden (463 cumulative test cases).

### 🎯🎯 Round 46 closure — 60% MAJOR MILESTONE REACHED ⭐⭐

> **Round 46 closure**: 119/196 = **🎯🎯 60.7% — 60% MAJOR MILESTONE REACHED**.
> Cross-snippet 3-file batch closure (5 endpoints across `[B2B] Snippet 3` V.42.19→V.42.20 +
> `[B2B] Snippet 9` V.34.4→V.34.5 + `[LIFF AI] Snippet 1` V.1.13→V.1.14). 28-round
> sustained Idempotency-Key campaign Rounds 18-46 — past 6/10 of POST surface.
>
> **Round 46 batch composition**: B2B Snippet 3 manual-flash-status (Flash Routes API
> quota burn guard + state>0 webhook mutation dedup) + B2B Snippet 9 admin save endpoints
> (distributor upsert race + settings overwrite race + print-settings SECURITY-CRITICAL
> key rotation race) + LIFF AI lead-status (admin status enum 17-statuses discriminator
> catches different button mid-retry).
>
> **Round 46 pattern milestone**: No new pattern variants — but 2nd boolean-discriminator
> instance with print-settings regenerate_key field (paired with bulk-shape selective
> save). Pattern count unchanged at **7 patterns**. NEW LIFF AI namespace passes 4 endpoints
> (3 → 4). NEW B2B namespace passes 60 endpoints (56 → 60).
>
> **Strategic note**: After 🎯🎯 60% MAJOR MILESTONE, recommend slow-down to 1-2 weeks
> production canary observation matching Round 42 50% pause. 28-round sustained campaign
> represents significant test infra burden (447 cumulative test cases). Pragmatic remaining
> work: validate canary stability before continuing to 70% milestone (138/196).
>
> **Round 47 recommendation**: If campaign continues, batch 25 candidates: LIFF AI `/auth`
> (lead-init token cross-namespace verify), LIFF AI `/agent-ask` (admin Q&A retry burn —
> agent proxy quota guard), Inventory `category` CRUD if exposed, Inventory `dip-stock`
> remaining endpoints, B2F `maker-product/upsert`. Realistic path to 70%: 4 batches × 5 =
> +20 → ~139/196 = 70.9% by Round 50.

### Round 45 closure — push toward 🎯 60% milestone

> **Round 45 closure**: 114/196 = **58.2%** — cross-snippet 2-file batch closure
> (5 endpoints across `[Admin System] DINOCO Global Inventory Database` V.45.9→V.45.10 +
> `[B2B] Snippet 3` V.42.18→V.42.19). Inventory shipping ops cluster (bulk CSV import +
> M6 dry-run resolver) + B2B Snippet 3 RPi heartbeat/ack cluster (3 endpoints). Snippet 3
> coverage 18 → 21 POST routes integrated.
>
> **Round 45 pattern milestone**: 2nd binary-fingerprint instance — pattern now proven
> across 2 rounds (R42 upload-image + R45 product/shipping/bulk). Both endpoints have
> raw payload (5MB image / 100KB CSV) that exceeds idempotency_keys row size — sha1
> fingerprint distinguishes "same payload vs different mid-retry" without storing
> binary. Pattern count unchanged (still 7) but binary-fingerprint maturity solidified
> for upload + bulk-import endpoint shape. **NEW upgrade pattern**: ad-hoc transient →
> central helper migration with backward-compat shadow-write (legacy `set_transient`
> kept during DAY_IN_SECONDS window). Reusable for any pre-existing endpoint that has
> a custom transient-based idempotency before central helper landed.
>
> **Round 46 recommendation**: 🎯 60% milestone within reach — only +4 endpoints needed
> (118/196 = 60.2%). Recommended batch 24 candidates: B2B Snippet 3 manual-flash cluster
> closure — `manual-flash-cancel` (admin "ยกเลิก" double-click on slow Flash API),
> `manual-flash-ready` (admin "พร้อมส่ง" trigger Flash /notify quota burn),
> `manual-flash-status` (verify mutational vs read-only), `manual-flash-test` (admin
> smoke-test Flash API connectivity, constant-marker shape if no params). Alternative
> batch 24 candidates: `flash-test/orders` (Flash test admin orders list — verify mutational),
> `cancel-request` (customer LIFF cancel flow), `manual-reprint` (RPi reprint trigger).
>
> **Strategic note**: After 🎯 60% milestone, consider slow-down to 1-2 weeks production
> canary observation matching Round 42 50% milestone advice. 27-round sustained campaign
> Rounds 18-45 = significant test infra burden (431 cumulative test cases). Pragmatic
> remaining work: validate canary stability before continuing to 70%.

### Round 44 closure — push toward 60% milestone

> **Round 44 closure**: 109/196 = **55.6%** — cross-snippet 3-file batch closure
> (5 endpoints across `[B2B] Snippet 9` V.34.3→V.34.4 + `[Admin System] DINOCO Brand Voice
> Pool` V.2.11→V.2.12 + `[B2B] Snippet 6` V.31.3→V.31.4). FIRST Brand Voice namespace
> idempotency wraps. api-keys/generate + api-keys/revoke are SECURITY-CRITICAL (extra-keys-
> in-wild guard + audit-log integrity guard).
>
> **Round 44 pattern milestone**: NEW IIFE wrap variant for switch-heavy multi-return
> functions. b2b_rest_flash_test_run_step has 200+ LOC of case returns — wrapping entire
> switch in `(function() {...})()` closure preserves all existing case returns intact
> (zero refactoring). Closure captures `WP_REST_Response` → outer scope checks `success=true`
> + 2xx code → stores cached. Reusable pattern for future rounds with similar complex
> handlers. Pattern count unchanged (still 7) but variant expands "single" pattern toolkit.
>
> **Round 45 recommendation**: Continue toward 60% milestone (~118/196 = +9 endpoints
> needed). Remaining candidate batches exist in: Inventory `product/shipping/bulk` CSV
> import + `shipping-compute` dry-run resolver (Flash quota dedup useful even for dry-run),
> B2B admin Flash polling (`flash-tracking/{ticket_id}` + `print-monitor` + `print-status`
> verify mutational), Inventory `category` CRUD (write paths). ~2 batches × 5 endpoints
> = +10 → ~119/196 = ~60.7% milestone Round 46.

### Round 43 closure — push past 50% milestone toward 60%

> **Round 43 closure**: 104/196 = **53.1%** — single-file Manual Invoice cluster closure
> (5 endpoints all in `[Admin System] DINOCO Manual Invoice System` V.34.10 → V.34.11).
> Both invoice/record-payment + invoice/record-refund are CRITICAL retry-prone (debt
> double-clear / debt double-credit guards) — among highest-value Idempotency wraps to date.
>
> **Round 43 pattern milestone**: 5th constant-marker instance (invoice/init `{action:
> 'init', user_id}`) joins R30 stock/initialize + R32 manual-flash-test + R39 daily-summary
> + R40 dip-stock/start. Pattern firmly proven at 5 endpoints across 5 rounds. invoice/cancel
> demonstrates boolean+text discriminator combination (force=0 vs force=1 different audit
> path + force_reason text catches different excuse mid-retry).

### Round 42 closure — 🎯🎯🎯 50% MAJOR MILESTONE REACHED

> **Round 42 closure**: 99/196 = **50.5%** — past the half-way mark of POST surface integrated
> against authoritative Round 30 census denominator. **24-round sustained Idempotency-Key
> campaign Rounds 18-42**. Closed 2 long-pending B2B LIFF retry-prone POSTs (invoice-gen
> + manual-flash-label) + auth-group (LIFF init) + LIFF AI lead-note + introduced **NEW
> binary-fingerprint sub-pattern** with upload-image (first idempotent endpoint with
> sha1_file content fingerprint expanding "image_base64 EXCLUDED" parent pattern).
>
> **Round 42 pattern milestone**: 7 patterns now observed — single / bulk / bulk-of-targets /
> state-machine / boolean-discriminator + enum-discriminator / constant-marker (4 instances)
> / **binary-fingerprint NEW R42**. Pattern playbook is mature; future rounds expected to
> reuse existing patterns rather than introduce new ones (until ~70% coverage when remaining
> endpoints will likely be edge cases).
>
> **Round 42 recommendation**: Slow-down to 1-2 weeks production canary observation before
> Round 43 batch 21. The 50% milestone marks a natural pause point — sustained 24-round
> campaign deserves a check-in window. Alternatively, continue toward 60% (118/196) with
> ~5-batch sustained pace = ~Round 47.

### High priority (Round 45+ candidates)

> **Round 45+ targets toward 60% milestone (118/196 = +9 endpoints needed)**: Inventory
> `product/shipping/bulk` CSV import + `shipping-compute` dry-run resolver (Flash quota
> dedup useful even for dry-run), B2B admin Flash polling endpoints (`flash-tracking/{ticket_id}`
> if mutational + `print-monitor` + `print-status` verify mutational), Inventory category
> CRUD (write paths). Aim ~2 batches → ~60% milestone by Round 46.

| Endpoint | Snippet | Risk if double-fired | Round candidate |
|----------|---------|----------------------|-----------------|
| `POST /dinoco-stock/v1/product/shipping/bulk` | Inventory | CSV bulk import double-click → 2× INSERT/UPDATE batch + 2× transient flush + 2× cache invalidate | Round 45 |
| `POST /dinoco-stock/v1/shipping-compute` | Inventory | Dry-run resolver — Flash quota dedup useful even for dry-run computation | Round 45 |
| `POST /b2b/v1/flash-tracking/{ticket_id}` | `[B2B] Snippet 3` | Manual Flash tracking refresh — verify mutational vs read-only before wrap | Round 45 |
| `POST /b2b/v1/print-monitor` | `[B2B] Snippet 3` | RPi print monitor poll — verify mutational | Round 45 |
| `POST /b2b/v1/print-status` | `[B2B] Snippet 3` | Print status poll — verify mutational | Round 45 |
| `POST /dinoco-stock/v1/category` | Inventory | Category CRUD write — admin double-click create → 2× INSERT + 2× cache flush | Round 46 |

### Medium priority (Round 41+)

| Endpoint | Snippet | Notes |
|----------|---------|-------|
| `POST /b2b/v1/auth-group` | `[B2B] Snippet 3` | LIFF auth init — natural session token TTL but log spam |
| `POST /b2b/v1/manual-flash-status` | `[B2B] Snippet 3` | Manual Flash status check — verified GET-effectively despite POST method |
| `POST /b2b/v1/flash-test/run-step` | `[B2B] Snippet 9` | Flash test step runner — sysadmin tool, low retry rate |
| `POST /b2b/v1/flash-test/simulate-webhook` | `[B2B] Snippet 9` | Webhook simulator — testing harness, no production retry path |
| `POST /b2b/v1/print-monitor` | `[B2B] Snippet 3` | RPi print monitor poll — verify mutational |
| `POST /b2b/v1/print-status` | `[B2B] Snippet 3` | Print status poll — verify mutational |

### Low priority (don't need wrapper)

| Endpoint | Reason |
|----------|--------|
| `POST /b2b/v1/print-ack` | RPi acknowledgment — server-side dedup via order_id |
| `POST /b2b/v1/print-heartbeat` | Idempotent by design (last-poll timestamp) |
| `POST /b2b/v1/rpi-command-ack` | Fire-and-forget RPi ack |
| `POST /b2b/v1/flash-webhook` | Flash → DINOCO direction (Flash retry handled by Flash side) |
| `POST /b2b/v1/test-push` | Admin test endpoint |
| `POST /dinoco-stock/v1/god-mode/verify` | PIN verify — natural rate-limit + JWT TTL = effective dedup |

---

## MCP Cluster Coverage

> **Round 35 milestone**: MCP namespace `/wp-json/dinoco-mcp/v1/*` reaches **13/17 = ~76%
> POST endpoint coverage** — highest namespace cluster coverage in the project. The MCP
> Bridge serves OpenClaw chatbot retry-prone signal hot paths, so prioritization made
> sense; remaining 4 routes are either ack-only or have natural dedup.

### MCP integrated POST endpoints (13 total)

| # | Endpoint | Round | Pattern note |
|---|----------|-------|--------------|
| 1 | `POST /dinoco-mcp/v1/distributor-notify` | 33 | lead_id primary discriminator + type Flex vs follow_up — caches HTTP 200 only |
| 2 | `POST /dinoco-mcp/v1/customer-link` | 33 | source_id + platform discriminates FB vs IG namespaces |
| 3 | `POST /dinoco-mcp/v1/claim-manual-create` | 30 | source_id primary discriminator |
| 4 | `POST /dinoco-mcp/v1/claim-manual-update` | 31 | status enum + case_type + tracking |
| 5 | `POST /dinoco-mcp/v1/lead-create` | 30 | source_id + phone identity |
| 6 | `POST /dinoco-mcp/v1/lead-update` | 31 | status enum + updated_by + followup_at |
| 7 | `POST /dinoco-mcp/v1/kb-suggest` | 34 | question normalized via mb_strtolower + trim |
| 8 | `POST /dinoco-mcp/v1/brand-voice-submit` | 34 | sentiment edits between retries → 409 (ML signal integrity) |
| 9 | `POST /dinoco-mcp/v1/dashboard-inject-metrics` | **35** | metrics_signature = sha1 of sorted name=>value pairs (order-stable) |
| 10 | `POST /dinoco-mcp/v1/lead-attribution` | **35** | event enum discriminates conversion path; revenue double-count guard |
| 11 | `POST /dinoco-mcp/v1/inventory-changed` | **35** | action enum (in/out/hold/release) + UPPER sku |
| 12 | `POST /dinoco-mcp/v1/kb-updated` | **35** | trigger_source admin_save vs bulk_import — Qdrant rebuild scope |
| 13 | `POST /dinoco-mcp/v1/product-compatibility` | **35** | brand+model normalized; cache-only (compute saver, no side effect) |

### MCP POST endpoints NOT integrated (4 — low priority)

| Endpoint | Reason |
|----------|--------|
| `POST /dinoco-mcp/v1/product-lookup` | Read-only catalog query — no side effect, idempotent by design (compute-only; very lightweight) |
| `POST /dinoco-mcp/v1/dealer-lookup` | Read-only — geo-search returns existing distributors without write |
| `POST /dinoco-mcp/v1/warranty-check` | Read-only — serial-number lookup |
| `POST /dinoco-mcp/v1/kb-search` | Read-only — Qdrant query without write |

> **Coverage commentary**: After Round 35, the MCP cluster is effectively saturated for
> retry-prone WRITE endpoints. The remaining 4 are read-only POST routes (POST chosen
> only because of body size — search queries with multiple filters wouldn't fit in a GET
> URL). Naturally idempotent at the database layer. **Other namespaces still have larger
> tail to cover**: B2B (24 integrated, ~30 remaining), B2F (19 integrated, ~10 remaining),
> Inventory (8 integrated, ~5 remaining). Round 36+ should pivot away from MCP.

---

## Pattern legend

| Pattern | Description |
|---------|-------------|
| **single** | Single semantic record. Body hash includes flat fields only. Most common. |
| **bulk** | Body contains array (items[], skus[], ids[]). Requires canonical sort + per-row sanitize before hashing. See [IDEMPOTENCY-KEY.md § Bulk endpoint considerations](../patterns/IDEMPOTENCY-KEY.md#bulk-endpoint-considerations). |
| **bulk-of-targets** | Single primary entity + array of sub-targets to notify/affect. E.g. admin-stock-unlock = 1 SKU + N notify_tickets. Treat targets[] like bulk: sort + dedup. |
| **state-machine** | Endpoint transitions FSM — replays may hit "already in target state" guard. Wrapper turns 400 into cached 200. E.g. po-complete (received → completed). |

---

## Test coverage

Each integrated endpoint has 3-9 contract tests in
`tests/helpers/IdempotencyEndpointContractTest.php`:

- `test_*_identical_body_same_hash` — replay safety
- `test_*_<critical-field>_different_hash` — discriminator validation
- `test_*_no_collision` — per-round + cumulative

| Round | Endpoints | Test cases | Cumulative no-collision shapes |
|-------|-----------|------------|-------------------------------|
| 19    | 3         | 16         | 3                             |
| 23    | 5         | 21         | 8                             |
| 25    | 5         | 18         | 13                            |
| 26    | 5         | 15         | 17 (bo-undo-split shares with bo-confirm-full) |
| 27    | 5         | 18         | 22                            |
| 28    | 5         | 18         | 27                            |
| 29    | 5         | 39         | 32 (delete-ticket + recalculate-total share {ticket_id} shape) |
| 30    | 6 (incl. bo-fulfill F1 fix) | 21 | 38 (Round 30 added 6 new shapes — all unique; cross-namespace claim-vs-lead collision guard added) |
| **31** | **5** | **17** | **43** (Round 31: +5 new — all unique; cross-namespace claim-update vs lead-update collision guard added) |
| **32** | **5** | **17** | **48** (Round 32: +5 new — all unique; cross-namespace maker-reschedule vs reject-lot collision guard added) |
| **33** | **5** | **18** | **53** (Round 33: +5 new — all unique; 2 cross-namespace pair guards added — maker-product vs maker + distributor-notify vs customer-link) |
| 🎯 **34** ⭐ | **5** | **18** | **58** (Round 34: +5 new — all unique; 2 cross-namespace pair guards added — distributor-delete vs distributor-toggle-bot + kb-suggest vs brand-voice-submit) |
| **35** | **5** | **18** | **63** (Round 35: +5 new — all unique; 2 cross-namespace pair guards added — dashboard-inject-metrics vs lead-attribution + inventory-changed vs kb-updated; MCP cluster ~76%) |
| 🎯 **36** ⭐ | **5** | **19** | **68** (Round 36: +5 new — all unique; 3 cross-namespace pair guards — flash-cancel vs flash-cancel-notify SHAPE-MATCH guard (proves namespace is sole discriminator) + bo-reject vs flash-switch-manual + stock-hold vs flash-cancel; **🎯 35% milestone**) |
| **37** | **5** | **20** | **73** (Round 37: +5 new — all unique; 3 cross-namespace pair guards — print-requeue vs rpi-accept-order SHAPE-MATCH guard (proves namespace is sole discriminator for {ticket_id}-only endpoints — pattern reused from Round 36 flash-cancel pair) + print-test vs print-requeue + slip-upload vs print-requeue; **37.8% — Snippet 3 RPi + customer LIFF cluster**) |
| 🎯 **38** ⭐ | **5** | **19** | **78** (Round 38: +5 new — all unique; 3 cross-namespace pair guards — flash-ship-packed vs rpi-flash-ready SHAPE-MATCH guard ({ticket_id} 4-way collision: print-requeue/rpi-accept-order/rpi-flash-ready/flash-ship-packed) + flash-label vs rpi-flash-box-packed SHAPE-MATCH guard ({pno} 2-way) + bo-notify vs flash-ship-packed schema-shape (bulk vs single); **🎯 40% milestone — first sustained 40% past 4/10 of POST surface**) |
| **39** | **5** | **17** | **83** (Round 39: +5 new — all unique; 1 cross-namespace pair guard — daily-summary vs manual-flash-test (Round 32) constant-marker isolation guard, proves distinct action strings prevent collision even without namespace gate; **42.9% — Snippet 5/9 Flash admin cluster closed**) |
| 🎯 **40** ⭐ | **5** | **18** | **88** (Round 40: +5 new — all unique; 1 cross-namespace pair guard — dip-stock/start vs daily-summary vs manual-flash-test vs stock/initialize 4-way pairwise distinct constant-marker validation across 4 rounds; **🎯 45% milestone**) |
| **41** | **5** | **18** | **93** (Round 41: +5 new — all unique; 2 cross-namespace pair guards — maker-delete vs maker-product-delete SHAPE-MATCH (proves namespace is sole discriminator for `{id}`-only B2F admin deletes, mirrors flash-cancel/flash-cancel-notify R36 pair + print-requeue/rpi-accept-order R37 pair) + box-template-create vs box-template-update id-discriminator (proves id field separates create vs update intent within same domain); **48.0% — push toward 🎯 50% MAJOR MILESTONE in Round 42 batch 20**) |
| 🎯🎯🎯 **42** ⭐⭐⭐ | **5** | **17** | **98** (Round 42: +5 new — all unique; binary-fingerprint pattern guard — upload-image content_sha1 fingerprint catches binary changes WITHOUT storing 5MB raw bytes; documents new sub-pattern alongside slip-upload R37 + combined-slip-upload R29 image_base64 EXCLUDED variants; **🎯🎯🎯 50.5% — 50% MAJOR MILESTONE REACHED**) |
| **43** | **5** | **17** | **103** (Round 43: +5 new — all unique; 5th constant-marker instance via invoice/init `{action: 'init', user_id}` joins R30 stock/initialize + R32 manual-flash-test + R39 daily-summary + R40 dip-stock/start; record-payment + record-refund single-shape with float-precision normalize via `amount round(2)`; cancel boolean+text discriminator force=0/force_reason='' vs force=1/force_reason='Admin override...' different audit paths; **53.1% — push past 50% milestone toward 60%**) |
| **44** | **5** | **16** | **108** (Round 44: +5 new — all unique; flash-test/run-step + flash-test/simulate-webhook step+type enum discriminators; api-keys/generate + api-keys/revoke security ops first Brand Voice namespace wraps; discount-mapping bulk-shape items[] sorted by SKU UPPER + per-row normalized; NEW IIFE wrap variant for switch-heavy multi-return functions; **55.6% — push toward 60% milestone**) |
| **45** | **5** | **16** | **113** (Round 45: +5 new — all unique; product/shipping/bulk binary-fingerprint {csv_sha1, csv_size, line_count} 2nd binary-fingerprint instance after R42 upload-image (pattern proven across 2 rounds for binary/large-payload endpoints); shipping-compute bulk-shape {items[] sorted-by-sku UPPER}; print-ack + rpi-command-ack share status enum discriminator pattern (done/error/partial); print-heartbeat single {hostname} only — RPi auto-generates new key per heartbeat tick; **58.2% — push toward 🎯 60% milestone, only +4 needed Round 46 batch 24**) |
| 🎯🎯 **46** ⭐⭐ | **5** | **16** | **118** (Round 46: +5 new — all unique; manual-flash-status single {pno} pno globally unique per shipment; distributor single {id, shop_name, line_group_id} core — id discriminates create vs update; settings bulk-shape selective {bank fields} fields PRESENT only sorted by ksort; print-settings bulk-shape selective with regen boolean discriminator security-critical key rotation event; lead-status single {lead_id, status, actor_uid from JWT} status enum 17-statuses discriminator; **🎯🎯 60.7% — 60% MAJOR MILESTONE REACHED**) |
| **47** | **5** | **17** | **123** (Round 47: +5 new — all unique; stock/sync-missing constant-marker {action:'sync-missing'} **6th constant-marker instance** after R30/R32/R39/R40/R43 — pattern fully mature for "no params" admin trigger endpoints across 6 endpoints in 6 rounds; shipping/classify single {sku, update fields ksort-normalized} different pack_mode 409; product/shipping bulk-shape selective {sku, update fields ksort, pack_slots[] sorted by slot_index — slot_label + box_template_id + content_weight_g per row} extends R45 shipping-compute pattern with multi-row pack_slots sort key; image-proxy single {url} cached data_url base64 returned directly small payload vs R42 sha1 fingerprint; agent-ask single {question normalized via mb_strtolower + trim, actor_uid from JWT} cross-admin JWT-scoped + transient agent failures NOT cached sub-pattern; **63.3% — push past 🎯🎯 60% MAJOR MILESTONE toward 70% target**) |

Total: **463 contract tests** across 25 rounds (Rounds 19-47). Round 29 introduced
`IdempotencyTestFixture` base class — Round 30+ fully adopt it
(`IdempotencyRound47Test.php` averages ~4 LOC/test).

### Fixture refactor (Round 29) {#fixture-refactor}

`tests/helpers/IdempotencyTestFixture.php` — abstract base class for endpoint contract tests.
4 helper methods replace ~75% of repetitive setup:

- `assertReplayMatches($endpoint, $body)` — same body → same hash
- `assertDifferentBody($endpoint, $body, $variant_body, $field_label)` — discriminator validation
- `assertFirstCallSuccess($endpoint, $body)` — 64-char SHA-256 hex output
- `assertKeyTooShortRejected($endpoint, $bad_key, $reason)` — extract_key gate
- `assertNoCollisionsInRound($round_label, $body_map)` — round-level cumulative

**LOC saved**: legacy inline pattern ~25 LOC/test → fixture-based ~5 LOC/test (80% reduction).
Round 29 has 21 fixture-based tests (`IdempotencyRound29Test.php`) — that's ~420 LOC saved
versus the inline pattern. Future rounds SHOULD use the fixture for new endpoint integrations.
The legacy 18-case style is preserved in `IdempotencyEndpointContractTest.php` for Rounds 19-28
(no refactor — additive only).

---

## Versioning

When adding a new endpoint to this tracker:

1. Update the table above (status: pending → integrated)
2. Bump snippet version (V.X.Y → V.X.Y+1) with Round NN annotation
3. Add cumulative no-collision assertion (increment N)
4. Update `docs/patterns/IDEMPOTENCY-KEY.md § Used in` list
5. (Optional) Update OpenAPI spec to mention `X-Idempotency-Key` support
   — currently DEFERRED to bulk doc sweep round.

## See also

- Pattern: [`docs/patterns/IDEMPOTENCY-KEY.md`](../patterns/IDEMPOTENCY-KEY.md)
- Foundation: `[Admin System] DINOCO Idempotency Helper` V.1.1
- Tests: `tests/helpers/IdempotencyEndpointContractTest.php`
- Audit history: Rounds 18-19, 23, 25-41
