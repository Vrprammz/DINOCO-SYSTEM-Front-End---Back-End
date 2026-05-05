# 🧪 Phase 1 W4 — Internal QA Acceptance Test (replace Pilot)

**Date**: 2026-05-05
**Source**: `docs/sn-system/07-boss-decisions-log.md` Q12 R2 — boss "B" (skip pilot)

แทน pilot 100 plates ที่แจกให้ดีลเลอร์ 5 ร้าน → รัน **internal QA test 50 cases** ด้วยทีม dev + บอส ก่อน flag flip

---

## 🎯 Acceptance Criteria

**Phase 1 W4 จะถือว่าผ่านเมื่อ**:

- ✅ ผ่าน 50/50 test cases (ทุก case ที่ระบุ)
- ✅ 0 critical bugs (ระบบใช้งานไม่ได้ / data corruption / security)
- ✅ ≤ 3 high bugs (UX issue / wrong message — ไม่ block flow)
- ✅ E2E flow ทำงานครบใน < 15 วินาที per activation
- ✅ Telegram alert ทำงาน (test alert ถึงบอส)
- ✅ Hard rollback ทดสอบแล้ว (flip OFF → existing flow ทำงานต่อ)

---

## 📋 50 Test Cases Matrix

### A. Batch Lifecycle (10 cases)

| # | Case | Expected |
|---|---|---|
| A1 | บอสสร้าง batch 100 plates → CSV download | CSV file มี 100 rows + format ถูก |
| A2 | บอสสร้าง batch + QR PDF download (chunked) | PDF เปิดได้ + 100 QR codes |
| A3 | บอสสร้าง batch ขนาดใหญ่ 10,000 plates | Status=draft + ใช้เวลา < 30s |
| A4 | สร้าง batch เปลี่ยน status → sent_to_factory | Audit log row ถูกต้อง |
| A5 | สร้าง batch แล้ว cancel | Plates revert ทั้งหมด status=cancelled_batch |
| A6 | สร้าง batch ซ้ำ (idempotency-key เดียว) | 2nd request return cached response |
| A7 | สร้าง batch ที่ prefix collision กับ batch อื่น | 409 error + rollback |
| A8 | Boss permission (`manage_options`) สร้าง batch | OK |
| A9 | Non-boss permission พยายามสร้าง batch | 403 forbidden |
| A10 | สร้าง batch ใน strict mode (F4) ทดสอบ | Need `dinoco_sn_create_batch` cap |

### B. Receive Plates (10 cases)

| # | Case | Expected |
|---|---|---|
| B1 | Warehouse scan plate 1 ใบ → POST /receive | Status=in_pool + linked_sku set |
| B2 | Bulk receive 100 plates ผ่าน Range mode | All 100 status=in_pool |
| B3 | Bulk receive 100 plates ผ่าน Paste mode | All 100 status=in_pool |
| B4 | Bulk receive 100 plates ผ่าน USB Scanner mode | All 100 status=in_pool |
| B5 | Receive plate ที่อยู่ batch อื่น | 404 sn_not_in_batch |
| B6 | Receive plate ที่ already in_pool | 409 already_received |
| B7 | Receive plate ที่ status=voided | 410 gone |
| B8 | 2 admin scan plate เดียวกันพร้อมกัน | 1 success + 1 conflict (race winner) |
| B9 | Receive ตอน network drop → retry | Idempotency wrapper replay correctly |
| B10 | Receive 1000 plates → check throughput | < 30s + no DB deadlock |

### C. Customer Activate (15 cases)

| # | Case | Expected |
|---|---|---|
| C1 | Customer scan QR → LINE OAuth login → activate | Warranty_registration created + LINE Flex received |
| C2 | Activate plate ที่ status=in_pool (normal) | Status flips registered + plate.registered_user_id set |
| C3 | Activate plate ที่ status=registered แล้ว (ของคนอื่น) | Show "เพลทนี้ลงทะเบียนแล้ว" + flow ขอโอนสิทธิ์ |
| C4 | Activate plate ที่ status=registered แล้ว (ของตัวเอง) | Show warranty status |
| C5 | Activate plate ที่ status=voided | Show "ติดต่อร้าน" + auto-create investigation |
| C6 | Activate plate ที่ status=recalled | Show "เพลทถูกเรียกคืน" + admin alert |
| C7 | Activate plate ที่ status=stolen | Show "เพลทรายงานหาย" + Telegram บอส |
| C8 | Activate ขณะ network drop → retry | Idempotency replay correctly (no duplicate warranty) |
| C9 | Activate ทาง LIFF mobile | UI works + camera scanner OK |
| C10 | Activate ทาง mobile browser (no LIFF) | LINE OAuth flow OK |
| C11 | Activate ขณะ user ยัง not logged-in | Redirect to LINE OAuth → continue |
| C12 | F#3 Auto-fill claim — ลูกค้าเปิดเคลม | 8 fields pre-filled correctly |
| C13 | Customer transfer warranty → ของลูกค้า B | Atomic flip + LINE notify ทั้ง 2 ฝ่าย |
| C14 | Activate plate ที่ SKU sn_required=0 | 422 not_required |
| C15 | Activate ตอน flag F1=OFF | 503 feature_disabled |

### D. Admin Operations (10 cases)

| # | Case | Expected |
|---|---|---|
| D1 | Admin search S/N (Tab 4) | Result + status timeline |
| D2 | Admin lookup customer ผ่าน S/N | PII shown ถ้ามี `dinoco_sn_view_pii` cap |
| D3 | Admin swap registered S/N (4-eyes) | Pending request + approver receives Flex |
| D4 | Approver กดอนุมัติ swap | Atomic execute + customer LINE notify |
| D5 | Approver กดปฏิเสธ swap | Request closed + actor notified |
| D6 | Self-approval (actor === approver) | 422 + audit incident |
| D7 | Admin void plate registered (4-eyes) | Pending → execute → audit row |
| D8 | Admin recall batch (>100 plates) | 4-eyes + bulk job queue |
| D9 | Admin export Audit CSV (Tab 5) | CSV download + UTF-8 BOM |
| D10 | Admin assign role ผ่าน Role Manager UI | Bulk save + audit log + LINE Flex notify |

### E. Cron Jobs + Notifications (5 cases)

| # | Case | Expected |
|---|---|---|
| E1 | F#1 Expiry cron — plate ใกล้หมด 30 วัน | LINE Flex received by customer |
| E2 | F#4 Anniversary cron — plate ครบ 1 ปี | LINE Flex received |
| E3 | F#10 Review request cron — plate ครบ 30 วัน | LINE Flex received |
| E4 | F#16 Demand forecast weekly cron → บอส | Flex report received |
| E5 | F#13 Gray market scan weekly → บอส | Flex alert received (or "ไม่พบ" report) |

---

## 🚨 Rollback Test (mandatory before flip)

| # | Action | Expected |
|---|---|---|
| R1 | `wp option update dinoco_sn_system_enabled 0` | All REST endpoints return 503 ภายใน < 5s |
| R2 | Customer scan QR ตอน flag OFF | Fallback ไป `[dinoco_gateway]` |
| R3 | Existing serial_code based warranty ทำงานปกติ | Service Center claim ใช้ได้ |
| R4 | `wp option update dinoco_sn_system_enabled 1` (re-enable) | Resume operations |
| R5 | Phase 2 W7 deploy strategy ถูกต้อง | 5-step atomic deploy ผ่าน |

---

## 📊 Test Execution Schedule (Phase 1 W4)

| Day | Activity | Hours |
|---|---|---|
| Day 1 (Mon) | Setup test environment + create test batch 100 plates + assign roles | 4h |
| Day 2 (Tue) | Run A1-A10 (Batch) + B1-B10 (Receive) | 8h |
| Day 3 (Wed) | Run C1-C15 (Customer Activate) | 8h |
| Day 4 (Thu) | Run D1-D10 (Admin) + E1-E5 (Cron) | 8h |
| Day 5 (Fri) | Run R1-R5 (Rollback) + bug fix + retest failures | 8h |
| **Total** | | **36h** |

**Pass criteria**: 50/50 cases ผ่าน + 0 critical bugs → ✅ Phase 1 W4 done → kick off Phase 2 W5

---

## 🛠 Test Tools

- **PHPUnit** — backend logic tests (existing 1217 tests + add scenario-based)
- **Jest** — drift detection (existing 1493 tests)
- **Manual QA matrix** — บอส + dev team ทดสอบ end-to-end (50 cases checklist)
- **Postman / curl** — REST endpoint manual verification
- **LINE Developers Console** — Flex Message Simulator ทดสอบ template
- **Browser DevTools** — Network tab ตรวจ API request/response

---

## 📝 Bug Tracking

ทุก bug ที่เจอใน W4 → log ใน:

```
docs/sn-system/12-phase1-w4-bug-log.md
```

Format:
```text
## BUG-W4-001
- **Severity**: Critical / High / Medium / Low
- **Case**: A3 (Batch 10K plates)
- **Description**: ...
- **Repro steps**: ...
- **Expected vs Actual**: ...
- **Fix commit**: <hash>
- **Status**: Open / Fixed / Verified
```

---

## 🚀 Post-W4 Flag Flip Sequence (after acceptance test passes)

1. **Phase 1 W4 Day 5 EOD** — Acceptance test 50/50 ✅
2. **Phase 2 W5-W7** — Operations + Member Dashboard + integration (3 wk)
3. **Phase 2 W7 Day 5** — Final smoke test
4. **Phase 2 W7 Day 5 EOD** — `wp option update dinoco_sn_system_enabled 1` (F1 flip)
5. **Phase 2 W7 +1 wk** — Monitor 24/7 + Telegram alert active
6. **Phase 3 W8** — F3 (4-eyes flip) ON
7. **Phase 3 W9** — F2 (block legacy) ON

**Total time from now to F1 flip**: ~5-7 weeks (vs original plan 4 wk pilot — slightly longer because skip pilot = need stronger internal test)

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` Q12 R2 — Pilot B decision
- `docs/sn-system/10-go-live-gate-checklist.md` — F1-F5 flip criteria
- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.13 §Phase 1 W4 (modified)
- Hard rollback: `[Admin System] DINOCO Production SN Manager` line ~860 kill switch
