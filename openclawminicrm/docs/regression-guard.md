# DINOCO Chatbot Regression Guard — V.1.0

ระบบป้องกัน bug เก่ากลับมาเวลาแก้ feature ใหม่.
Block deploy ถ้า critical regression scenarios fail.

> สร้างขึ้นเพราะแต่ละครั้งที่แก้ bot ใหม่ มักทำให้ bug เก่ากลับมา — ต้องมี safety net อัตโนมัติ

---

## 1. ภาพรวม

| Layer | หน้าที่ | ต้นทุน |
|------|---------|--------|
| 1. Regex patterns | ตรวจ forbidden / required ใน reply | 0 tokens (ฟรี) |
| 2. Tool call check | ตรวจว่า AI เรียก tool ที่คาดหวัง / ไม่เรียกที่ห้าม | 0 tokens |
| 3. Gemini semantic judge | ตัดสิน expect_behavior เมื่อ hard rules ผ่าน | ~400 tokens / scenario |

**กติกา:** ถ้า Layer 1 หรือ 2 ล้มเหลว → ไม่ต้องเสียเงิน Layer 3 (fail fast)

---

## 2. Components

### 2.1 CLI Runner — `scripts/regression.js`
- อ่าน scenarios จาก MongoDB (`regression_scenarios`)
- รัน sequential พร้อม 2s delay (Gemini free tier: 15 RPM)
- Validate 3 layers
- เขียน run log ไป `regression_runs`
- Exit code: `0` = pass, `1` = gate failed (critical fail)

**Usage:**
```bash
node scripts/regression.js                                  # report mode
node scripts/regression.js --mode=gate --severity=critical  # gate on critical
node scripts/regression.js --bug-id=REG-001                 # one scenario
node scripts/regression.js --category=product_knowledge
```

### 2.2 Seeder — `scripts/seed-regression.js`
- Seed 15 scenarios จาก `docs/chatbot-rules.md` §11 Fix History
- Idempotent (upsert by `bug_id`)
- `--force` → drop + reinsert (danger)

```bash
node scripts/seed-regression.js
```

### 2.3 Test Mode Guard — `proxy/modules/dinoco-tools.js`
Tools ที่มี side effects ถูก mock เมื่อ `sourceId` ขึ้นต้นด้วย `reg_`:
- `dinoco_create_lead` → returns `[TEST MODE] สร้าง lead จำลอง...`
- `dinoco_create_claim` → returns `[TEST MODE] เปิดเคลมจำลอง...`
- `dinoco_claim_status` → returns mocked status

**เหตุผล:** ป้องกัน MongoDB pollution + ป้องกัน LINE Flex card ไปหา dealer/admin จริง

### 2.4 REST API — `/api/regression/*`
| Endpoint | Method | หน้าที่ |
|----------|--------|---------|
| `/scenarios` | GET | list (filter: category, severity, active, search) |
| `/scenarios/:bug_id` | GET | detail |
| `/scenarios` | POST | create |
| `/scenarios/:bug_id` | PATCH | update |
| `/scenarios/:bug_id` | DELETE | soft delete (active=false) |
| `/run` | POST | trigger runner — body: `{bug_ids?, severity?, category?, mode?}` |
| `/runs` | GET | history |
| `/runs/:runId` | GET | detail |
| `/stats` | GET | dashboard cards (total, critical, last_run, pass_rate_7d) |
| `/auto-mine` | POST | Phase 4: Gemini suggest from training_logs fails |
| `/cleanup` | POST | purge stale `reg_*` sourceIds |

ทุก endpoint ใช้ `requireAuth` (header `x-api-key`)

### 2.5 Dashboard UI — `smltrackdashboard/src/app/train/`
- Tab ใหม่ "ระบบกันถอย" (🛡️) ใน `/dashboard/train`
- Stats cards: Total / Critical / Pass rate 7d / Last run
- Actions: Add / Run All / Run Critical / Export JSON / Refresh
- Filter: category + severity + search
- Table: Bug ID / Title / Category / Severity / Last run / 7d
- Detail modal: turns + assertions + last run → Re-run / Edit / Delete
- Form modal: Quick (form) + Advanced (JSON editor)

### 2.6 Deploy Gates
| Gate | File | Triggers |
|------|------|----------|
| Pre-push hook | `scripts/git-hooks/pre-push` | Local push (chatbot files changed) → critical gate |
| GitHub Actions | `.github/workflows/regression-guard.yml` | Push to main (chatbot paths) → critical+high gate |
| Deploy script | `scripts/deploy.sh` Step 0 | Pre-deploy → critical gate |

**Override** (emergency only):
- Local: `git push --no-verify`
- Deploy: `SKIP_REGRESSION=1 ./scripts/deploy.sh`

---

## 3. Schema

### 3.1 `regression_scenarios`
```javascript
{
  bug_id: "REG-001",                    // unique
  title: "H2C ห้ามขึ้นใน DINOCO Edition NX500",
  category: "product_knowledge",        // product_knowledge|tone|flow|intent|anti_hallucination|tool_calling
  severity: "critical",                 // critical|high|medium
  platform: "any",                      // any|line|facebook|instagram
  bug_context: "ลูกค้าถามตัวแต่งจากศูนย์...",
  fix_commit: "10c218c",
  fix_date: "2026-04-07",
  source: "fix_history",                // fix_history|admin_manual|auto_mined
  turns: [
    { role: "user", message: "nx500 กล่อง 3 ใบเท่าไหร่" },
    { role: "user", message: "ตัวแต่งจากศูนย์ครับ" }
  ],
  assertions: {
    forbidden_patterns: [
      { pattern: "H2C|h2c", flags: "i", reason: "ห้ามเอ่ยชื่อแบรนด์คู่แข่ง" }
    ],
    required_patterns: [
      { pattern: "DINOCO Edition", flags: "i", reason: "ต้องพูดถึง Edition" }
    ],
    expected_tools: ["dinoco_create_lead"],
    forbidden_tools: [],
    expect_behavior: "AI ต้องแนะนำ DINOCO Edition (SKU DNCGND37LSPROS)",
    must_not_do: ["ห้ามเอ่ย H2C", "ห้ามเสนอสีดำ"]
  },
  context_setup: {
    prior_messages: []   // optional pre-seed conversation history
  },
  timeout_ms: 45000,
  retry_on_flaky: 1,     // 1 = retry once if semantic layer fails
  active: true,
  pass_rate_7d: 0.95,    // updated nightly 03:00
  last_run: {
    status: "pass",
    timestamp: ISODate,
    violations_count: 0
  },
  created_at: ISODate,
  updated_at: ISODate
}
```

### 3.2 `regression_runs`
```javascript
{
  _id: ObjectId,
  triggered_by: "pre-push",     // pre-push|ci|deploy|manual|cron|dashboard
  mode: "gate",                  // gate|report
  filter: { severity, category, bug_ids },
  scenarios_run: 15,
  pass: 14,
  fail: 1,
  error: 0,
  pass_rate: 93,
  results: [
    {
      bug_id, title, severity, category,
      status: "pass|fail|error",
      duration_ms: 3421,
      violations: [{layer, reason, pattern?, tool?}],
      semantic: { verdict, reason, retried? },
      error?: string
    }
  ],
  created_at: ISODate
}
```

---

## 4. Phase 4 — Auto-mine + Drift Detection

### 4.1 Auto-mine (`POST /api/regression/auto-mine`)
- Scan `training_logs` fails (last 30d) + `messages` handoff triggers
- Gemini Flash สกัด draft scenarios
- Returns suggestions — **not auto-inserted** (boss approves via UI)

### 4.2 Nightly Cron (in `proxy/index.js` startup)
| Time | Action |
|------|--------|
| every minute | hourly cleanup of `reg_*` sourceIds >1h |
| 03:00 | update `pass_rate_7d` for all active scenarios |
| 03:00 | drift alert (Telegram `regression_drift`) if rate <0.9 × ≥3 runs |
| 03:30 | cleanup stale test sessions |
| Sunday 04:00 | archive inactive scenarios >90d |

### 4.3 Telegram Alerts (in `modules/telegram-alert.js`)
- `regression_drift` — scenario เคย pass แต่เริ่ม fail
- `regression_fail_gate` — deploy blocked

---

## 5. Initial 15 Scenarios (from Fix History)

| ID | Title | Category | Severity |
|----|-------|----------|----------|
| REG-001 | H2C ห้ามขึ้นใน NX500 Edition | product_knowledge | critical |
| REG-002 | วัสดุกันล้มต้องสแตนเลส ไม่รวมอลู | product_knowledge | critical |
| REG-003 | Side Rack ≠ มือจับ | product_knowledge | high |
| REG-004 | Claude review text ห้ามหลุด | anti_hallucination | critical |
| REG-005 | Dealer inquiry + auto-lead | flow | critical |
| REG-006 | X Travel Pro เลิกขาย | product_knowledge | medium |
| REG-007 | ADV160 ไม่มีสินค้า | product_knowledge | medium |
| REG-008 | ADV350/Forza350 ไม่มีกล่องข้าง | product_knowledge | medium |
| REG-009 | ห้าม ดิฉัน/พี่/น้อง | tone | high |
| REG-010 | ห้ามเผยเป็น AI | anti_hallucination | critical |
| REG-011 | ห้ามบอกราคาซ้ำเมื่อถามร้าน | flow | critical |
| REG-012 | DINOCO Edition = SKU silver only | product_knowledge | critical |
| REG-013 | PII masking ไม่ crash AI | anti_hallucination | critical |
| REG-014 | FB Image URL ไม่เป็น text | flow | high |
| REG-015 | Output-based dealer coordination | flow | high |

---

## 6. Workflow

### 6.1 เพิ่ม scenario ใหม่เมื่อแก้ bug
1. แก้ bug + commit
2. ไป `/dashboard/train` → tab "ระบบกันถอย"
3. คลิก "+ เพิ่ม Scenario"
4. **Quick mode:** กรอก bug_id, title, test message, forbidden pattern, expect_behavior
5. คลิก "สร้าง" — ถูก insert ทันที
6. คลิก row → "Re-run" เพื่อ verify pass
7. Commit scenario (มันอยู่ใน MongoDB ไม่ต้อง commit code — แต่ควร update `chatbot-rules.md` Fix History พร้อม REG-NNN)

### 6.2 รัน regression ก่อน push
```bash
# Manual
node scripts/regression.js --mode=gate --severity=critical

# Auto (pre-push hook)
./openclawminicrm/scripts/install-hooks.sh  # one-time
git push                                     # runs automatically
```

### 6.3 Gate fail → แก้
1. อ่าน violations ใน terminal
2. แก้ bot logic / prompt / KB
3. Commit
4. `git push` อีกครั้ง (hook run อัตโนมัติ)

### 6.4 Override (emergency)
```bash
git push --no-verify
```
**ต้อง** แจ้งบอสทันทีและแก้ scenario ให้ pass ใน commit ต่อไป

---

## 7. Install + First Run

```bash
# 1. Seed initial 15 scenarios
docker exec smltrack-agent node /app/scripts/seed-regression.js

# 2. Run once to verify
docker exec smltrack-agent node /app/scripts/regression.js --mode=report

# 3. Install pre-push hook
./openclawminicrm/scripts/install-hooks.sh

# 4. Verify in dashboard
# เปิด https://ai.dinoco.in.th/dashboard/train → tab "ระบบกันถอย"
```

---

## 8. Constraints / Gotchas

- **Gemini free tier** — 15 RPM → sequential + 2s delay. Parallel จะโดน rate limit
- **sourceId cleanup** — ต้องมี cron hourly ไม่งั้น MongoDB บวม
- **Test Mode Guard** — ถ้าเพิ่ม tool ใหม่ที่มี side effects ต้องเพิ่มใน `SIDE_EFFECT_TOOLS` set
- **Dashboard API proxy** — ต้องใช้ path `/dashboard/api/regression/*` (มี basePath)
- **Semantic judge fallback** — ถ้า Gemini error จะ PASS (ไม่ fail on tool error)
- **Retry on flaky** — ใช้เฉพาะ semantic layer, ไม่ retry layer 1/2 (hard rules ไม่ควร flaky)
- **CI agent startup** — GitHub Actions ต้อง wait for `/health` endpoint ก่อนรัน gate

---

## 9. Reference

- **CLI:** `openclawminicrm/scripts/regression.js`
- **Seeder:** `openclawminicrm/scripts/seed-regression.js`
- **REST handlers:** `openclawminicrm/proxy/index.js` (search `/api/regression/`)
- **Test mode guard:** `openclawminicrm/proxy/modules/dinoco-tools.js` V.5.1 (`SIDE_EFFECT_TOOLS`)
- **Crons:** `openclawminicrm/proxy/index.js` startup block (`Regression Guard Crons`)
- **Pre-push hook:** `openclawminicrm/scripts/git-hooks/pre-push`
- **CI workflow:** `.github/workflows/regression-guard.yml`
- **Dashboard tab:** `openclawminicrm/smltrackdashboard/src/app/train/components/RegressionTab.tsx`
- **Fix History:** `openclawminicrm/docs/chatbot-rules.md` §11 (REG-NNN column)

---

## 10. B2F V.7.0 Order Intent Regression Scenarios (API/DB, non-chatbot)

> 8 scenarios ตรวจ backend API + DB invariants ของ B2F V.7.0 — รันก่อน flip feature flag `b2f_flag_order_intent`. ไม่ใช่ chatbot conversation test — เป็น HTTP/SQL assertion.

### Seed location (pending)

- ใช้ `scripts/regression.js --category=b2f_order_intent` (กำหนดใหม่)
- Scenario fixture ใน MongoDB `regression_scenarios` category=`b2f_order_intent`, severity=critical
- HTTP driver ใช้ WordPress REST API (`/wp-json/b2f/v1/*` + `/wp-json/dinoco-b2f-audit/v1/*`) + admin token

### 10.1 Scenarios

| ID | Scenario | Expected | Severity |
| --- | --- | --- | --- |
| REG-B2F-V7-01 | `POST /create-po` with `order_mode=full_set` on SKU with `production_mode=single` | HTTP 400 `invalid_order_mode` | critical |
| REG-B2F-V7-02 | `POST /po-undo-submit` 31 วินาทีหลัง submit | HTTP 410 `undo_window_expired` | critical |
| REG-B2F-V7-03 | `POST /junction-bulk-update-display` กับ 201 SKUs | HTTP 400 `bulk_limit_exceeded` | high |
| REG-B2F-V7-04 | CHECK constraint `production_mode=single + admin_display_mode=as_parts` (MySQL 8.0.16+) OR PHP validator (all versions) | HTTP 422 `check_constraint_violation` | critical |
| REG-B2F-V7-05 | Flag `b2f_flag_v11_explicit_mode=OFF` → `GET /maker-products/{id}` response | 200 with V.10.5-compatible shape (no new fields) | high |
| REG-B2F-V7-06 | Concurrent toggle `admin_display_mode` + `create-po` on same SKU | FOR UPDATE prevents stale write — second request retries cleanly | high |
| REG-B2F-V7-07 | Legacy PO without `poi_order_mode` → PO Ticket view | UI displays "—" (no DB infer per Decision #9) | medium |
| REG-B2F-V7-08 | `intent_notes` with 201 characters → create-po | Stored 200 chars + log warning `intent_notes_truncated` | medium |

### 10.2 Execution

```bash
# Dry-run API tests against staging
node scripts/regression.js --category=b2f_order_intent --mode=report

# Gate before flipping flag (requires all pass)
node scripts/regression.js --category=b2f_order_intent --mode=gate --severity=critical,high
```

### 10.3 PII-Aware Assertions

REG-B2F-V7-05 ต้อง assert response body ไม่มี `production_mode` / `confirmation_status` / `admin_display_mode` / `missing_leaves` / `maker_profile.stats` เมื่อ flag OFF (V.10.5 backward compat).

REG-B2F-V7-07 ต้อง assert `poi_intent_notes` + `poi_production_mode_snapshot` + `order_intent_summary` ถูก strip สำหรับ non-admin token (callback-level PII gate ใน `b2f_format_po_detail()`).

### 10.4 Reference

- **Plan:** `.claude/plans/sunny-spinning-quill.md` §Regression Scenarios
- **FEATURE-SPECS:** §1.17.16 V.7.0 Regression Scenarios
- **Error codes:** Snippet 1 V.7.0 lines 3489-3499 (8 constants)
- **Deploy gate:** เพิ่ม `SKIP_B2F_V7_GATE=1` env override สำหรับ emergency rollout
