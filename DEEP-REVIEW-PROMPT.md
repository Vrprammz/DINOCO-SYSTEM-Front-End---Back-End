# DEEP-REVIEW-PROMPT.md

> วิธีใช้ — เปิดแชทใหม่ใน Cowork → ก๊อปทุกอย่างใน code block ด้านล่าง (ตั้งแต่ `ROLE` จนจบ) วางส่งครั้งเดียว → Claude จะ pre-load tool + skill + อ่าน docs + audit ตามลำดับเอง

---

```
ROLE
You are a Principal Engineer + Security Lead + UX Director + Data/SRE 
Specialist conducting an ULTRA-DEEP FULL SYSTEM REVIEW of the DINOCO System. 
Output one master audit report the team can act on for 4-8 weeks. Be 
thorough, specific, kind, brutally honest. No filler, no flattery, no 
hand-waving.

TARGET
- WordPress + ACF monolith (60+ PHP "snippets" auto-synced from GitHub)
- OpenClaw Mini CRM (Node.js + Express + MongoDB Atlas + Gemini/Claude)
- RPi Print Server (Python + Flask + CUPS + systemd)
- LIFF pages (B2B, B2F, LIFF AI, dealer)
- Next.js dashboard (openclawminicrm/dashboard)
- Second Brain wiki (.second-brain/, symlinked external — gitignored)
- Repo: /Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End

═══════════════════════════════════════════════════════════════════════════════
PHASE -1 — WARM-UP (do this FIRST in a single message, before reading docs)
═══════════════════════════════════════════════════════════════════════════════

-1.1 PRE-LOAD TOOLS (call ToolSearch in parallel — 4 calls in one message)
     so the audit never blocks on tool discovery mid-flow:

     ToolSearch("select:AskUserQuestion,TaskCreate,TaskGet,TaskList,TaskUpdate,TaskStop,WebSearch", max_results: 10)
     ToolSearch("select:mcp__workspace__bash,mcp__workspace__web_fetch,mcp__cowork__create_artifact,mcp__cowork__list_artifacts,mcp__cowork__present_files,mcp__cowork__request_cowork_directory,mcp__cowork__read_widget_context,mcp__cowork__update_artifact,mcp__cowork__allow_cowork_file_delete", max_results: 12)
     ToolSearch("select:mcp__skills__list_skills,mcp__plugins__search_plugins,mcp__plugins__suggest_plugin_install,mcp__mcp-registry__search_mcp_registry,mcp__mcp-registry__list_connectors,mcp__mcp-registry__suggest_connectors,mcp__session_info__list_sessions,mcp__session_info__read_transcript", max_results: 10)
     ToolSearch("select:mcp__scheduled-tasks__create_scheduled_task,mcp__scheduled-tasks__list_scheduled_tasks,mcp__scheduled-tasks__update_scheduled_task,mcp__40e8d0d8-0829-48e9-9610-528d22632c72__create_diagram,mcp__40e8d0d8-0829-48e9-9610-528d22632c72__search_shapes", max_results: 8)

-1.2 PRE-LOAD SKILLS (invoke each Skill tool ONCE so guidance is in context 
     before audit starts — pick from <available_skills>; skip ที่ไม่มี):

     Skill("engineering:code-review")
     Skill("engineering:tech-debt")
     Skill("engineering:architecture")
     Skill("engineering:debug")
     Skill("engineering:system-design")
     Skill("engineering:documentation")
     Skill("engineering:testing-strategy")
     Skill("engineering:incident-response")
     Skill("design:accessibility-review")
     Skill("design:design-critique")
     Skill("design:design-system")
     Skill("design:ux-copy")
     Skill("design:design-handoff")
     Skill("data:explore-data")
     Skill("data:validate-data")
     Skill("data:statistical-analysis")
     Skill("customer-support:customer-research")
     Skill("enterprise-search:search")

     ถ้า skill ไหน "already running" หรือไม่มีในรายการ ให้ skip + log ใน 
     orientation summary.

-1.3 MEMORY HYGIENE (บังคับตลอด audit — ลด RAM กินหนัก)
     - ห้าม Read ไฟล์ภาพ/PDF/ไฟล์ binary >500KB เข้า context โดยไม่จำเป็น
       ใช้ bash + ImageMagick/pdftotext/file extract เฉพาะส่วน
     - Snippet >2000 LOC → ใช้ Read offset/limit เป็น chunk 500 บรรทัด แล้ว
       เขียนสรุปต่อ chunk ลง outputs/notes/<filename>.md ก่อนอ่าน chunk ถัดไป
     - ใช้ Grep + head_limit แทน load ผลลัพธ์เต็ม (head_limit 50-100 พอ)
     - หา agent (Explore / general-purpose / Plan) ทำงานหนัก — context ของ
       sub-agent แยกจาก main thread → main ไม่บวม
     - เลี่ยงเรียก mcp__cowork__list_artifacts / read_transcript ซ้ำๆ
     - ทุก phase จบ → เขียนสรุปลงไฟล์ใน outputs/ แล้วอ้าง path แทน inline

-1.4 SETUP TODOLIST
     ใช้ TodoWrite สร้าง 6 phases (Orientation / Inventory / Review / 
     Synthesis / Doc-Updates / Self-Verify) + verification step ต่อ phase

GROUND RULES (binding throughout)
1. DO NOT SKIM. ไฟล์ 3000 LOC = อ่าน 3000 LOC. State LOC read per file.
2. CLAUDE.md = audit TARGET ไม่ใช่ ground truth — verify ทุก claim กับ code
3. EVERY finding ต้องมี file:line citation OR reproducible payload
4. Use parallel sub-agents — Phase 1 launch B2B/B2F/Admin/OpenClaw/RPi/LIFF/
   Docs sub-agents ใน ONE message
5. ถาม clarifying ผ่าน AskUserQuestion **เฉพาะ** ถ้า scope กำกวมจริง (1 ครั้ง)
6. SAFETY: read-only audit. ห้าม flip flag, ห้าม commit/push, ห้าม run 
   destructive command. เสนอ diff รออนุมัติ
7. Output ภาษา: Thai หรือ English ต่อ section อันไหนชัดกว่าใช้อันนั้น
8. Tone: direct, specific, kind. ไม่ประจบ ไม่อ้อม

═══════════════════════════════════════════════════════════════════════════════
PHASE 0 — ORIENTATION + READING INTAKE
═══════════════════════════════════════════════════════════════════════════════

0.1 อ่านตามลำดับ ครบทุกบรรทัด (no truncation):
    a. /CLAUDE.md
    b. SYSTEM-REFERENCE.md
    c. WORKFLOW-REFERENCE.md
    d. FEATURE-SPECS.md
    e. AUDIT-REPORT-2026-04-17.md
    f. FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md
    g. FEATURE-SPEC-OPTION-F-HYBRID-ADMIN-CONTROL-2026-04-16.md
    h. FLASH-SHIPPING-V42-REGRESSION-MANIFEST.md
    i. B2F-ARCHITECTURE-PLAN.md
    j. B2F-SCHEMA-V10.sql, B2F-SCHEMA-V11.sql
    k. *.md ทุกไฟล์ที่ root + docs/**/*.md
    l. .second-brain/hot-cache.md, .second-brain/log.md (top 10), 
       .second-brain/workflows/*.md
    m. openclawminicrm/CLAUDE.md, openclawminicrm/docs/*.md
       (chatbot-rules.md ทุกบรรทัด — canonical)
    n. rpi-print-server/CLAUDE.md + READMEs

0.2 Glob repo:
    - "**/*.md" — count + classify (ref/spec/runbook/log/drift)
    - "**/*.php" — list 60+ snippet ทั้งหมด พร้อม bracket prefix
    - "openclawminicrm/**/*.{js,ts,tsx,json}"
    - "rpi-print-server/**/*.{py,html,service,sh}"
    - "liff-src/**/*.{js,ts,css}", "dist/liff/**"
    - "scripts/**/*.{php,sh}", ".github/workflows/**"
    - "**/Dockerfile*", "**/docker-compose*.yml"
    - "**/package*.json", "**/composer*.json"
    - "**/.env*" — list filename เท่านั้น ห้ามอ่าน secret content

0.3 Output "Orientation Summary" (≤2 หน้า) เขียนลง 
    outputs/00-orientation.md:
    - Doc inventory: count + total LOC + last-modified
    - Code tree counts (deep dive ใน Phase 1)
    - Top-5 highest-risk areas (gut call ก่อนอ่าน code)
    - First-pass doc contradictions
    - Estimated effort + parallelization plan

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — CODE INVENTORY (อ่านทุกไฟล์ catalog เป็นโครงสร้าง)
═══════════════════════════════════════════════════════════════════════════════

LAUNCH 7 SUB-AGENTS IN PARALLEL (single message, 7 Agent tool calls):
  - Agent A: B2B snippets (Snippet 1-16 + B2B admin shortcodes)
  - Agent B: B2F snippets (Snippet 0-11 + audit + 0.5 dual-write)
  - Agent C: Admin System snippets (Inventory, Manual Invoice, Service 
             Center, Brand Voice, Sync, Modal Helpers, Observability, GDPR, 
             B2F Migration Audit, Flash Go-Live)
  - Agent D: System (member-facing) snippets (dashboard, registration, 
             claims, profile, transfer, legacy, LIFF AI)
  - Agent E: OpenClaw Mini CRM (proxy + modules + dashboard)
  - Agent F: RPi Print Server + LIFF Vite + scripts
  - Agent G: CI/CD + Dockerfiles + lockfiles + .github/workflows

แต่ละ agent ต้อง output ไฟล์ outputs/inventory-<X>.md format นี้ต่อไฟล์:
  - file path, DB_ID, version, LOC, last-modified
  - Registered surface:
      shortcodes (name, callback, capability gate)
      REST endpoints (route, methods, permission_callback, args schema)
      WP hooks (action/filter, priority, callback)
      cron schedules (hook, interval, registered + scheduled?)
      AJAX handlers (action, capability)
      CPTs / Taxonomies / ACF field groups
      globally exposed functions (prefix-namespaced or not)
      enqueued scripts/styles (handle, src, deps, version)
  - Dependencies (calls into other snippets — symbol-level)
  - Top 3 risk smells (1-line each)
  - Dead code / TODO/FIXME density

หลัง agents จบ → main thread รวมเป็น "Code Inventory" master table ใน 
outputs/01-inventory.md

═══════════════════════════════════════════════════════════════════════════════
PHASE 2 — DEEP REVIEW (core audit, 14 domains)
═══════════════════════════════════════════════════════════════════════════════

ทุก finding format:
  { id, severity (CRIT/HIGH/MED/LOW/INFO), domain, file:line, evidence, 
    blast_radius, exploit_or_repro, recommended_fix (concrete + code sketch), 
    rollback_plan, effort (S/M/L), dependencies }

ใช้ OWASP Top 10 (2021) + CWE Top 25 + Nielsen 10 + WCAG 2.1 AA + 
Twelve-Factor + SRE golden signals เป็น scaffolding

──────────────────────────────────────────────────────────────────────────────
A) SECURITY (paranoid mode)
──────────────────────────────────────────────────────────────────────────────
A.1  Authentication: LINE OAuth2 (state/PKCE/ID-token verify), LIFF auth, 
     JWT (LIFF AI + B2F admin + God Mode — alg pin, exp, alg=none confusion, 
     secret rotation), HMAC sigs (b2f_liff_url replay), WP nonce reuse, 
     Bearer tokens timing-safe (compare_digest), webhook secrets
A.2  Authorization: every REST endpoint permission_callback (`__return_true` 
     red flag — list all), capability checks, IDOR (order_id/ticket_id/
     lead_id/pno guess + access), object-level (dealer A reads dealer B's 
     leads?), mass-assignment
A.3  Injection: SQL ($wpdb prepare bypass), XSS (esc_html/esc_attr/esc_url/
     wp_kses), command injection (shell_exec / Python subprocess shell=True), 
     SSRF (image-proxy, slip URL, web_fetch — allowlist), header injection, 
     NoSQL (MongoDB query construction), template injection
A.4  CSRF: state-changing endpoints, SameSite/Secure/HttpOnly cookies, 
     webhook signature verify (NO csrf required, MUST verify sig)
A.5  Secrets/Crypto: hardcoded keys, secrets in client JS, .env in git 
     history, hash algos (SHA-256 vs MD5), random source (random_int vs 
     mt_rand), at-rest encryption (slip images, PII postmeta)
A.6  Rate limit / DoS: per-endpoint coverage, race conditions (transient vs 
     GET_LOCK vs Redis), distributed bypass, expensive ops (search, CSV 
     export), payload size caps
A.7  PII / PDPA: phone/address/national_id/plate/slip/LINE_UID/email — 
     logged where? Observability redact helper coverage; retention crons 
     (LINE messages? claim photos? slip images?); export scope; deletion vs 
     anonymization; cross-border transfer (Gemini/Claude/Atlas region)
A.8  File upload: MIME sniff vs ext, size cap, dim cap, getimagesize bombs, 
     SVG XSS, zip slip, double-ext, path traversal, web-accessible dir
A.9  Webhook sig verify: GitHub HMAC-SHA256, Flash, Slip2Go (PULL only — 
     verify no handler open), LINE, Telegram (path-secret only — body 
     trusted?)
A.10 Stock enumeration defense (BO opaque-accept claim) — verify timing 
     variance + error code uniformity + side channels (rate-limit headers 
     leak? Telegram alert latency?) + cross-SKU cap bypass via multi-distributor
A.11 Insider threat: admin LINE group reads ของลับ?, audit log immutability, 
     God Mode JWT TTL extension/leak risk
A.12 Dependencies: npm audit (every package.json HIGH/CRIT), composer audit, 
     pip audit, EOL warnings (PHP 7.x, Node 16, Python 3.7)

──────────────────────────────────────────────────────────────────────────────
B) CORRECTNESS / BUGS
──────────────────────────────────────────────────────────────────────────────
B.1  FSMs: B2B Order (V.1.6), B2F Order, Claim, BO sub-FSM, Dip Stock, 
     Manual Invoice — list state+transitions, draw graph, find unreachable/
     orphan/illegal/missing; verify FSM = sole status writer
B.2  Money/debt/currency: float vs decimal, rounding, multi-currency 
     boundary (THB/CNY/USD snapshot enforcement), debt double-add/subtract, 
     refund flow, tier % vs absolute migration completeness
B.3  Stock: DD-2 leaf-only, DD-3 shared child semantics, DD-7 SET expansion, 
     manual_hold lifecycle, walk-in negative, cascade ancestor race, 
     dual-write CPT vs junction drift, coverage rule auto-sync
B.4  Concurrency: place-order 4 sites idempotency, BO split invariant, 
     slip-verify race, debt GET_LOCK timeout, cron overlap, hook fires
B.5  Hook/filter: callbacks return void (silent break), action expecting 
     return, removed_filter pairing, priority drift (V.34.2 lesson)
B.6  Cron: registered vs scheduled vs custom-interval; DISABLE_WP_CRON 
     context; heartbeat option-key drift (V.42 R7 — re-grep similar bugs); 
     cleanup chunk size + sleep
B.7  PHP 8.x compat: deprecated APIs, dynamic property, mb_* fallback, 
     Asia/Bangkok DST safety
B.8  Error handling: `@` suppression sites (grep), wpdb->get_results null, 
     wp_remote_post WP_Error unchecked, JSON decode, try/catch silent
B.9  Idempotency: manual-flash-create double-click, webhook replay (Flash/
     GitHub/LINE/Telegram), order confirm postback double-tap
B.10 Test coverage: phpunit/jest/pytest presence, REG-001..REG-068 
     automation, Regression Guard V.1.5 fix-history coverage

──────────────────────────────────────────────────────────────────────────────
C) WORKFLOW DEAD-ENDS — walk every journey END-TO-END
──────────────────────────────────────────────────────────────────────────────
แต่ละ journey output: screen/snippet ต่อ step, trigger, success path, 
failure paths, recovery, hand-off ระหว่าง module, broken edges 
(button → 404, missing screen, modal ปิดไม่ได้, ไม่มี email/webhook fire). 
Sequence diagram (text/Mermaid) ต่อ journey.

  1.  Member: register warranty → claim submit → status → resolution
  2.  Member: profile edit → password reset → account delete (GDPR)
  3.  B2B distributor: catalog → place order → BO opaque accept → admin 
      full confirm OR split → bill → pay → ship → tracking → receive → 
      dispute → cancel → refund
  4.  B2B BO secondary: BO ready Flex → confirm BO bill → pay → ship → close
  5.  Walk-in: cart → bill → pay → cancel completed
  6.  B2B admin BO: pending review → split modal → undo (10min) → cancel 
      item → bulk fulfill
  7.  B2B admin print: ticket → label → RPi queue → print → reprint → bulk
  8.  Manual Invoice: builder → multi-picker → issue → pay → cancel → refund
  9.  Manual Ship: scan → dims → label → courier → status → reprint → CSV
  10. Maker (B2F): receive PO → confirm → reject lot → reschedule → deliver 
      → DINOCO receive → reject lot → resolve → DINOCO pay → slip verify → 
      completed
  11. B2F admin: makers tab → register product → primary/secondary lock → 
      coverage rule auto-sync → Phase 4 migration (dry-run + live) → rollback
  12. B2F admin: PO image generate → 3-language → mode badges → Intent Summary
  13. Inventory admin: dip stock start → count → approve → variance → 
      force-close
  14. Inventory admin: warehouse transfer → multi-warehouse stock view
  15. Inventory admin: hierarchy edit → auto-split N-part → migrate parent 
      stock → confirm
  16. Inventory admin: God Mode PIN → margin analysis → tier preview
  17. Service Center admin: ticket → reviewing → approve → in_progress → 
      waiting_parts → repairing → quality_check → completed
  18. Dealer LIFF AI: lead notify → accept → contact → status updates → 
      close (won/lost) → reassignment
  19. Admin LIFF AI: dashboard → claims → claim detail → status update → 
      photo lightbox
  20. Telegram บอสคุ้ง: every command → outcome → audit
  21. OpenClaw chatbot (LINE): customer message → tool call → reply; claim 
      flow 24h timeout; lead auto-create; dealer notify
  22. OpenClaw dashboard: training → KB add → regression run → drift alert
  23. GDPR: data export request → admin review → fulfillment OR rejection 
      → audit
  24. Flash V.42 Go-Live wizard: pre-flight → migrate → smoke test → flip → 
      monitor → rollback
  25. GitHub Webhook Sync: push to main → webhook → DB_ID match → snippet 
      update → failure path → retry
  26. RPi: heartbeat → command queue → ack → fail → DLQ
  27. Observability: error → Sentry → correlation ID → trace → resolution
  28. B2F Migration Audit Phase 1→2→3→4: every step, every guard, every 
      rollback

──────────────────────────────────────────────────────────────────────────────
D) UX / UI / DESIGN
──────────────────────────────────────────────────────────────────────────────
D.1  Mobile-first 380px (iOS Safari + Android Chrome): tap target ≥44×44, 
     spacing ≥8px, sticky header/keyboard collision, modal focus trap + ESC, 
     overflow-x guard (negative-margin gotcha), input font ≥16px (iOS zoom), 
     loading state perceived perf
D.2  Accessibility WCAG 2.1 AA full audit: color contrast (every badge/chip/
     link/placeholder/disabled — amber lineage), keyboard nav (tab order, 
     focus visible, skip links), screen reader (aria-label on icon buttons, 
     aria-live toasts, role=dialog modals, aria-expanded accordions), form 
     errors (aria-invalid + aria-describedby), prefers-reduced-motion, lang 
     attribute (th/en/zh)
D.3  Visual consistency cross-module: color tokens, spacing scale, type 
     scale, button system (primary/secondary/destructive/ghost + sizes + 
     states), modal patterns, badge taxonomy (4 hierarchy + status + source 
     + mode — overlap?)
D.4  Information architecture: Admin Dashboard 32+ tabs sidebar usability, 
     LIFF E-Catalog filter chip explosion, workflow visibility ("where am I")
D.5  Error states (every form + flow): empty, loading, error, success, 
     offline/network failure
D.6  Microcopy: confirm dialog wording (Modal Helpers migration verify), 
     toast tense/formality/length, button verb+noun, i18n (TH ครับ/ค่ะ, EN 
     tone, ZH tone, gender-neutral)
D.7  Print outputs: invoice PDF legibility + paper-saving + logo render 
     fallback, shipping label barcode/QR scan, PO image 3-language SET 
     header colors + mode badges
D.8  Notifications: LINE Flex dedup TTL + rate cap + digest math, Telegram 
     throttling + severity, email templates/deliverability/unsubscribe
D.9  Latency-perceived UX: optimistic UI, skeleton, progressive disclosure, 
     long-op progress + ETA + cancel
D.10 i18n: currency formatting per locale (฿8,800 vs ¥1,580 vs $45.00), 
     date locale, RTL injection guard

──────────────────────────────────────────────────────────────────────────────
E) DOCUMENTATION DRIFT
──────────────────────────────────────────────────────────────────────────────
E.1 CLAUDE.md numeric/factual claim verify — REST endpoint counts per 
    namespace, feature flag default + production state, FSM state counts, 
    schema column counts, "Closed N findings" claims (sample-verify)
E.2 SYSTEM-REFERENCE.md / WORKFLOW-REFERENCE.md / FEATURE-SPECS.md drift
E.3 .second-brain/hot-cache.md "Recent Changes" stale check
E.4 chatbot-rules.md Fix History 22+ rows → REG-NNN coverage in 
    regression-guard.md
E.5 Missing: README onboarding, architecture diagram, threat model
E.6 Output: Drift Register table { file, line, claim, reality, fix }

──────────────────────────────────────────────────────────────────────────────
F) DATA / SCHEMA
──────────────────────────────────────────────────────────────────────────────
F.1 Custom tables (wp_dinoco_*, wp_b2b_*, wp_b2f_*): column/type/null/
    default/charset, indexes (missing/redundant/wrong order), CHECK 
    constraints (MySQL 8.0.16+ gate), FKs, soft delete consistency, time 
    columns TZ semantics
F.2 dbDelta correctness (KEY syntax, PRIMARY KEY position, charset suffix)
F.3 Migrations: idempotent? versioned? rollback?
F.4 Retention: TTL crons every retention-bound table (observations 60d, 
    audit 90d, GDPR 90d anonymize)
F.5 Backup: wp-options size, postmeta bloat, transient cleanup, 
    autoload=yes audit
F.6 ACF vs custom-table dual-write drift detection + reconciliation tools

──────────────────────────────────────────────────────────────────────────────
G) PERFORMANCE
──────────────────────────────────────────────────────────────────────────────
G.1 N+1 patterns (DINOCO_Catalog memo coverage gaps)
G.2 Slow REST: SQL EXPLAIN on hot queries (place-order, bo-pending-review, 
    maker-products, dashboard stats, daily-summary, pipeline-review)
G.3 Page weight: inline <script>+<style> sites — Snippet 4/8/11/12 + admin 
    dashboard; PERF-H6 LIFF Vite migration coverage
G.4 Cache hit/miss: transient TTL, object-cache compat (
    dinoco_cache_flush_group helper coverage)
G.5 Cron storm: overlapping schedule peak times
G.6 RPi tight loops + label render queue depth
G.7 OpenClaw cold-start: agent boot, MongoDB pool
G.8 Frontend: Next.js dashboard + LIFF Vite bundle size, Lighthouse estimate

──────────────────────────────────────────────────────────────────────────────
H) RELIABILITY / OPERATIONS
──────────────────────────────────────────────────────────────────────────────
H.1 SRE golden signals (latency/traffic/errors/saturation) observability
H.2 Sentry V.1.0 OFF default — activation gaps
H.3 Correlation ID chain WP REST → OpenClaw → MongoDB
H.4 Cron heartbeat coverage (option-key drift V.42 R7 lesson)
H.5 DLQ Flash V.42: retry caps, retention, replay safety, masking
H.6 Auto-rollback Flash V.42: zero-denominator guard, window correctness
H.7 Kill switch inventory: every flag + default + current + tested rollback
H.8 Backup: WP DB, MongoDB, file uploads, RPi config — RTO/RPO?
H.9 DR: RPi dies, LINE bot dies, agent dies, Atlas region down — runbooks?
H.10 Deploy risk: GitHub Webhook Sync — malformed PHP, DB_ID conflict, 
     two pushes race, rollback path
H.11 Secrets rotation cadence (LINE/Flash/GitHub PAT/JWT)

──────────────────────────────────────────────────────────────────────────────
I) AI / CHATBOT (OpenClaw)
──────────────────────────────────────────────────────────────────────────────
I.1  Prompt safety: chatbot-rules.md says 14 injection patterns — verify
I.2  Tool call validation: 11 tools schema enforcement, output sanitization
I.3  Hallucination defenses: 3-layer verify, product knowledge rules 
     (H2C ban, materials, Side Rack rule, DINOCO Edition silver-only)
I.4  PII masking in conversation history (Gemini SAFETY block prevention)
I.5  Cost: per-msg token usage, rate limits per user/platform
I.6  Multi-platform parity: LINE/FB/IG/Telegram — feature drift
I.7  Lead pipeline FSM 17 statuses (same B.1 checks)
I.8  Claim flow 24h timeout — cron + DST safety
I.9  Dealer notify: direct LINE Flex from agent bypasses WP — auth + audit?
I.10 Telegram บอสคุ้ง 20+ commands — capability check (chat_id only), audit 
     immutability, replay safety
I.11 Training Dashboard: KB poisoning vector, source field validation
I.12 Regression Guard V.1.5: pass_rate_7d cron, mock guard (sourceId 
     prefix `reg_`), deploy gate enforcement

──────────────────────────────────────────────────────────────────────────────
J) RPi PRINT SERVER
──────────────────────────────────────────────────────────────────────────────
J.1 systemd sandbox compliance (V.42 fix re-verify both unit files)
J.2 Log rotation: RotatingFileHandler config, disk fill prevention
J.3 Auth: Basic Auth + bearer compare_digest (Round 4 fix)
J.4 Network: Cloudflare Tunnel scope, firewall, CUPS exposed?
J.5 Label render fallback chain (logo white vs bw), EROFS resilience
J.6 Reprint idempotency: snapshot → identical label
J.7 Manual Ship V.41 split (pickup vs label addr) — ALL templates updated
J.8 Heartbeat → WP option-key drift (Round 7 lesson) re-check

──────────────────────────────────────────────────────────────────────────────
K) BUILD / DEPLOY / DEPENDENCIES
──────────────────────────────────────────────────────────────────────────────
K.1  GitHub Actions: secret usage, action pin (SHA vs tag), supply chain
K.2  npm audit (every package.json) HIGH/CRIT
K.3  composer audit
K.4  Python pip audit
K.5  Lockfile drift: package.json vs lock, composer.json vs lock
K.6  Dockerfile: base image age, root user, multi-stage, layer order
K.7  docker-compose.prod.yml: env secrets, health checks, restart policy, 
     volume permissions
K.8  Cloudflare Tunnel scope/auth (if visible)
K.9  LIFF Vite: prod build settings, source maps, tree-shake, code-split, 
     asset hash
K.10 Next.js dashboard: build output, ISR/SSR/SSG choices, 
     NEXT_PUBLIC_ exposure

──────────────────────────────────────────────────────────────────────────────
L) COMPLIANCE
──────────────────────────────────────────────────────────────────────────────
L.1 PDPA TH: data scope matrix, lawful basis per use case, DPO designation, 
    breach notification SOP
L.2 GDPR (EU users): scope, cross-border transfer (Atlas region, Gemini 
    region), SCC needed?
L.3 Consumer protection: warranty terms match marketing site vs claim flow
L.4 Tax: VAT B2B invoices, withholding tax, e-Tax Invoice integration
L.5 Anti-fraud: distributor KYC, sanctions screening
L.6 Accessibility legal (TH disability law) gaps

──────────────────────────────────────────────────────────────────────────────
M) MONEY / FINANCE
──────────────────────────────────────────────────────────────────────────────
M.1 Atomic debt ops (Snippet 13 + B2F Snippet 7) race coverage
M.2 Slip verify: Slip2Go pull semantics, duplicate-submit race, fraud 
    (forged image, photoshopped amount, replay across PO)
M.3 Walk-in bank vs default bank: which slips verify which account
M.4 Manual Invoice exclusion in operational queues (V.34.4 lineage 
    re-grep coverage)
M.5 Refund: partial → debt math, re-bill after cancel
M.6 Currency snapshot immutability post-submitted (B2F)

──────────────────────────────────────────────────────────────────────────────
N) DEVELOPER EXPERIENCE
──────────────────────────────────────────────────────────────────────────────
N.1 Onboarding: new dev local env runnable? README missing?
N.2 Convention enforcement: linters, formatters, pre-commit hooks
N.3 Code duplication (DRY) — Snippet inline JS repetition
N.4 Naming consistency (b2b_/b2f_/dinoco_ prefix, camelCase vs snake_case)
N.5 Comments quality: outdated vs current code

═══════════════════════════════════════════════════════════════════════════════
PHASE 3 — SYNTHESIS + REMEDIATION PLAN
═══════════════════════════════════════════════════════════════════════════════

3.1 Findings Register (flat table, sortable) — outputs/03-register.md
3.2 Findings Detail grouped by severity → outputs/04-findings-detail.md
3.3 Workflow Dead-End Map per-journey sequence diagrams (Mermaid) → 
    outputs/05-workflows.md
3.4 UX Recommendations prioritized + before/after → outputs/06-ux.md
3.5 Doc Drift Register table + proposed edits → outputs/07-drift.md
3.6 Schema/Ops/Perf consolidated → outputs/08-ops.md
3.7 Remediation Plan phased:
    P0 ship-blockers (CRIT/production-down) — this week
    P1 next sprint (HIGH) — 2 weeks
    P2 backlog (MEDIUM) — quarter
    P3 nice-to-have (LOW) — opportunistic
    Per item: { id, title, severity, effort (S/M/L), deps, risk-if-not-fixed, 
    suggested-owner (BE/FE/Sec/UX/Ops) }
3.8 Top-10 highest-leverage fixes
3.9 Quick wins (≤1 hr each)

═══════════════════════════════════════════════════════════════════════════════
PHASE 4 — DOCUMENTATION + WIKI + SECOND BRAIN UPDATES (proposed diffs only)
═══════════════════════════════════════════════════════════════════════════════

4.1 CLAUDE.md edits (line-range diffs)
4.2 SYSTEM-REFERENCE.md / WORKFLOW-REFERENCE.md / FEATURE-SPECS.md edits
4.3 .second-brain/hot-cache.md refresh (≤500 words)
4.4 .second-brain/log.md new top entry per fix.template.md
4.5 New runbooks proposed (filename, outline, why)
4.6 Missing docs (README onboarding, architecture diagram, threat model) — 
    skeleton

ทุก edit แสดง diff รออนุมัติจาก user — ห้าม commit เอง

═══════════════════════════════════════════════════════════════════════════════
PHASE 5 — SELF-VERIFICATION
═══════════════════════════════════════════════════════════════════════════════

5.1 Re-open 10 random findings (3 CRIT, 4 HIGH, 3 MED) — confirm file:line
5.2 Re-grep 3 doc drift claims — confirm
5.3 List ASSUMED (not verified) items + reason
5.4 List files NOT read fully + reason
5.5 Confidence rating per domain (A-N) — high/medium/low + reason

═══════════════════════════════════════════════════════════════════════════════
DELIVERABLE
═══════════════════════════════════════════════════════════════════════════════

ONE master report saved to:
/Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/DEEP-REVIEW-2026-04-28.md

Sections:
  0. Executive Summary (1 หน้า ภาษาไทย) — top-10 risks, top-10 wins, posture
  1. Orientation Summary (Phase 0)
  2. Code Inventory (Phase 1) — table + per-domain digest
  3. Findings Register (flat sortable table)
  4. Findings Detail (CRIT → HIGH → MED → LOW)
  5. Workflow Dead-End Map (per journey)
  6. UX/UI Review (heuristic + a11y + i18n)
  7. Documentation Drift Register
  8. Schema + Operations + Performance Findings
  9. AI/Chatbot Audit (OpenClaw)
  10. RPi + Build/Deploy + Dependencies
  11. Compliance Posture (PDPA/GDPR)
  12. Remediation Plan (P0/P1/P2/P3) + Quick Wins + Top-10 Leverage
  13. Proposed Doc/Wiki/Second-Brain Edits (diffs)
  14. Self-Verification Log
  15. Appendix A: Files Read (full list, LOC)
  16. Appendix B: Files NOT Read (with reason)
  17. Appendix C: Tools/commands used during audit
  18. Appendix D: Glossary DINOCO-specific (DD-2/3/7, FSM names, flag names)

ความยาวที่คาด: 80-200 หน้า Markdown ตามขนาดระบบจริง 
ห้าม pad ห้ามบีบ — match ความลึกกับขนาด system

เริ่ม Phase -1 (warm-up) ตอนนี้ → Phase 0 → launch parallel agents Phase 1 
→ ต่อไปตามลำดับ พิมพ์ progress marker ระหว่าง phase ให้ user ตามทันได้

FINAL REMINDER
- Read-only audit
- ห้ามแก้ code, ห้าม commit doc, ห้าม flip flag
- แสดง diff รออนุมัติทุกการแก้ไข
- Memory hygiene บังคับตลอด (Phase -1.3)
- ถ้า context ใกล้เต็ม → เขียน partial output ลงไฟล์ outputs/ แล้ว spawn 
  agent ใหม่อ่านต่อจากจุดนั้น
```

---

## เปลี่ยนจากฉบับก่อนยังไง

- **Phase -1 ใหม่** — pre-load tools (4 ToolSearch parallel) + pre-load 18 skills + memory hygiene rules
- **Phase 1 เป็น parallel 7 sub-agents** — B2B / B2F / Admin / System / OpenClaw / RPi / CI ตัด context หลักไม่ให้บวม
- **outputs/<NN>-<name>.md** ทุก phase เขียน partial ลงไฟล์ก่อน → main thread ไม่กิน RAM
- **Memory hygiene** ครอบคลุม chunked Read + Grep head_limit + agent offload + เลี่ยง list_artifacts ซ้ำ
- **Read-only safety** เน้น 3 ที่ — ground rules, Phase 4 wait approval, Final Reminder

[เปิด prompt](computer:///Users/pavornthavornchan/Projects/DINOCO-SYSTEM-Front-End---Back-End/DEEP-REVIEW-PROMPT.md)