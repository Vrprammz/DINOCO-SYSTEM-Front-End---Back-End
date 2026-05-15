> ⚠️ **SUPERSEDED 2026-05-15** by [35-boss-final-decisions-2026-05-15.md](../35-boss-final-decisions-2026-05-15.md). Boss seeds 2 admins himself via Role Manager matrix UI — no 10-user UAT script needed.

# 🎭 Q15 R2 Role Matrix UAT Plan

**Version**: 1.0 (2026-05-07)
**Boss decision (Q15 R2)**: บอสจะตั้ง role เอง — Role Manager V.0.2 = Matrix UI
**Plan**: v2.13 Phase 2 W5 prerequisite

---

## 🎯 Goal

User Acceptance Testing for Role Manager V.0.2 (Matrix User × 4 Role checkbox UI). บอสจะใช้ระบบนี้กำหนด permissions ทั้งหมด ดังนั้น UAT ต้องครอบคลุม:

1. UI matrix usable by non-technical user (บอส)
2. Bulk save without race conditions
3. 4-eyes refund threshold ฿5K enforced (Q20 R2)
4. Self-approval block (REG-086)
5. Permission cascade ลงไปถึง REST endpoint level

---

## 👥 4 Roles + Capabilities

| Role | Cap key | Description |
|---|---|---|
| **Warehouse** | `dinoco_sn_warehouse` | Receive plates + scan + view in_pool |
| **Approver Tier 1** | `dinoco_sn_approver_t1` | Approve refunds < ฿5K, voids 2-eyes |
| **Approver Tier 2 (4-eyes)** | `dinoco_sn_approver_t2` | Approve refunds ≥ ฿5K, recall 4-eyes |
| **PII Viewer** | `dinoco_sn_view_pii` | Service Center: view phone/address in audit context |

User can have multiple roles simultaneously (checkbox matrix).

---

## 🧪 UAT Scenarios

### S1 — Matrix UI usability (บอส test)
**Steps**:
1. บอส logs in as super-admin
2. Opens `/wp-admin/admin.php?page=dinoco_sn_role_manager`
3. Sees table: rows=users (paginated 50/page), columns=4 role checkboxes + Save
4. Toggle checkbox for User A → Warehouse role
5. Click "บันทึก" button

**Expected**:
- Toast confirms "บันทึกแล้ว"
- User A's wp_capabilities row updated
- Audit log row inserted (`event_type=role_assigned`)
- No page reload needed (AJAX save)

### S2 — Bulk save 50 users
**Steps**:
1. Toggle 50 users in single page (mix of roles)
2. Click "บันทึกทั้งหมด"

**Expected**:
- Single REST call `POST /sn-roles/bulk-assign`
- All 50 users updated atomically (transaction)
- One audit row per user (50 total)
- Response time < 5 sec

### S3 — Self-approval blocked
**Steps**:
1. User A (Approver T1) creates refund request ฿3,000
2. User A attempts to approve own request

**Expected**:
- HTTP 422 + message "ไม่สามารถอนุมัติคำขอของตัวเองได้"
- REG-086 logic triggered

### S4 — 4-eyes threshold ฿5K
**Steps**:
1. User A (Approver T1) creates refund ฿7,500
2. Check approver dropdown — must show only T2 approvers
3. Submit → User B (T2) receives notification

**Expected**:
- T1 approvers NOT eligible for ฿7,500 request
- Audit row marks `tier=t2_required`

### S5 — Permission cascade to REST
**Steps**:
1. User C has only `dinoco_sn_warehouse` role
2. User C calls `POST /dinoco-sn/v1/refund/approve` directly

**Expected**:
- HTTP 403 — capability check fails
- Audit log row `event_type=permission_denied`

### S6 — PII viewer access
**Steps**:
1. Service Center staff logged in (cap: `dinoco_sn_view_pii`)
2. Open audit log viewer

**Expected**:
- Phone numbers shown unmasked
- Without cap → masked `***-***-5678`

### S7 — Role removal
**Steps**:
1. Toggle OFF Warehouse role for User A
2. Save

**Expected**:
- WordPress role removed
- Audit row `event_type=role_removed`
- Existing in-flight bulk receive sessions: completed but new attempts 403

### S8 — Concurrent edit race
**Steps**:
1. Admin 1 + Admin 2 both open Role Manager same page
2. Admin 1 toggles User A's roles + saves
3. Admin 2 (with stale page) toggles same user differently + saves

**Expected**:
- Optimistic concurrency check (lock_version) → 409 to Admin 2
- Toast: "ข้อมูลเปลี่ยนแปลงแล้ว — โหลดหน้าใหม่"
- Admin 2 reloads + sees Admin 1's changes

### S9 — Audit trail completeness
**Steps**:
1. Make 5 role changes for various users
2. Open `[Admin System] DINOCO Flag Audit Log`

**Expected**:
- 5 rows visible with delta details
- Filter by user_id works
- CSV export works

### S10 — Default role on new user
**Steps**:
1. Create new WP user via standard wp-admin
2. Check Role Manager

**Expected**:
- New user has NO S/N roles by default
- Must be explicitly granted

---

## 📋 UAT Checklist (บอส signs off)

- [ ] S1 — Usability test passed (บอส used UI without help)
- [ ] S2 — Bulk save 50 users successful
- [ ] S3 — Self-approval blocked
- [ ] S4 — 4-eyes threshold enforced
- [ ] S5 — Permission cascade to REST verified
- [ ] S6 — PII viewer access scoped correctly
- [ ] S7 — Role removal clean
- [ ] S8 — Concurrent edit safe
- [ ] S9 — Audit trail complete
- [ ] S10 — Default permissions safe (deny by default)

---

## 🔒 Pre-flip rollout

ก่อน flip F3 (`dinoco_sn_require_2sig_for_swap`):
1. บอสกำหนด approver list ในระบบ Role Manager (ผ่าน UAT scenarios)
2. ทดสอบ 4-eyes flow ใน staging
3. Sign off ที่ section นี้

---

## 📚 Related

- `docs/sn-system/09-q15-role-based-access-control.md` — RBAC base spec
- `tests/helpers/SnApprovalEscalationTest.php` — REG-086 SLA + self-approval logic
- `docs/sn-system/15-q20-manual-refund-sop.md` — refund SOP referencing 4-eyes

---

**Sign-off**:
- [ ] Tech Lead — UAT scripts authored
- [ ] บอส — UAT executed + signed
- [ ] Customer Service Lead — PII viewer scope reviewed
- [ ] Date signed: __________

---

## 🌱 Initial Role Seeding (R3 BLOCKER)

**Source**: Plan v2.13 §Phase 1 W4 R3 BLOCKER + Q15 R2 Backend UserAdmin RBAC
**Owner**: บอส (boss) — โดยตรง (per Q15 R2 decision: "บอสจะตั้ง role เอง")
**Pre-flight**: Role Manager V.0.2+ deployed, Matrix UI live in Backend

ขั้นตอนการ seed roles ครั้งแรกหลัง deploy:

### Step 1 — Identify users + assign roles (template)

ใช้ table นี้เป็น input — ฟัด wp-cli command ใน Step 2:

| User Login | Email | Roles ที่ assign | หมายเหตุ |
|---|---|---|---|
| boss | boss@dinoco.in.th | Admin + Approver + PII Viewer + Warehouse | Master account — ทุกสิทธิ์ |
| tech_lead | techlead@dinoco.in.th | Admin + Approver | ไม่ต้อง Warehouse (ไม่ scan) |
| tech_lead_deputy | deputy@dinoco.in.th | Admin | Read-only review |
| cs_lead | cs@dinoco.in.th | PII Viewer | สำหรับ refund flow ดู PII |
| cs_rep_1 | cs1@dinoco.in.th | (none) | Default — no S/N permissions |
| accounting_lead | acct@dinoco.in.th | (none) | ใช้ CSV export endpoint อย่างเดียว |
| warehouse_lead | wh@dinoco.in.th | Warehouse + Admin | ดูแล receive flow |
| warehouse_rep_1 | wh1@dinoco.in.th | Warehouse | Scan-only |
| warehouse_rep_2 | wh2@dinoco.in.th | Warehouse | Scan-only |
| approver_2 | appr2@dinoco.in.th | Approver | Backup สำหรับ 4-eyes when boss/tech_lead unavailable |

### Step 2 — wp-cli commands (run on production WP)

```bash
# Boss — Master account (4 roles)
wp user add-cap boss dinoco_sn_admin
wp user add-cap boss dinoco_sn_approver
wp user add-cap boss dinoco_sn_view_pii
wp user add-cap boss dinoco_sn_warehouse

# Tech Lead — Admin + Approver
wp user add-cap tech_lead dinoco_sn_admin
wp user add-cap tech_lead dinoco_sn_approver

# Tech Lead Deputy — Admin only
wp user add-cap tech_lead_deputy dinoco_sn_admin

# CS Lead — PII Viewer (refund flow needs customer name+phone)
wp user add-cap cs_lead dinoco_sn_view_pii

# Warehouse Lead — Warehouse + Admin
wp user add-cap warehouse_lead dinoco_sn_warehouse
wp user add-cap warehouse_lead dinoco_sn_admin

# Warehouse Reps — Warehouse only
wp user add-cap warehouse_rep_1 dinoco_sn_warehouse
wp user add-cap warehouse_rep_2 dinoco_sn_warehouse

# Approver #2 — backup for 4-eyes
wp user add-cap approver_2 dinoco_sn_approver
```

### Step 3 — Verify via Backend Matrix UI

1. Login as boss → เข้า `/wp-admin/admin.php?page=dinoco-sn-roles`
2. ตรวจ Matrix แสดง:
   - boss = ✅ ทุก checkbox (4)
   - tech_lead = ✅ Admin + Approver
   - cs_rep_1 = ☐ ทุกอัน (default deny)
3. Audit log row `event_type=role_seeded_initial` มี admin_user_id = boss

### Step 4 — Approver delegation chain (for 4-eyes)

ใช้ wp-option เพื่อกำหนดลำดับ approver fallback:
```bash
# Define delegation order (T+1 → T+2 → T+3 → escalate to boss)
wp option update dinoco_sn_approver_delegation '[
  "tech_lead",
  "approver_2",
  "tech_lead_deputy",
  "boss"
]' --format=json
```

หาก Tech Lead unavailable > 1 hr (urgent SLA) → auto-route ไป approver_2 ฯลฯ.

### Step 5 — Self-approval block test

ทดสอบ self-approval block ตาม REG-086:
1. Login as `tech_lead`
2. Trigger refund > ฿5,000
3. Backend แสดง 4-eyes prompt — ต้องเลือก approver อื่น
4. ลองเลือก `tech_lead` (self) → ระบบ block + toast: "ไม่อนุญาต self-approval"
5. เลือก `approver_2` → OK, refund pending L4 review

### Step 6 — Audit log verification

```bash
wp option get dinoco_sn_audit | grep -i 'role_assigned\|role_seeded' | head -20
```

ต้องเห็น 10 rows (1 per user × 1 row per assigned role aggregated).

---

## 📋 Initial Seed Sign-off

- [ ] Step 1 — User list reviewed + approved by บอส
- [ ] Step 2 — wp-cli commands executed (boss + Tech Lead present)
- [ ] Step 3 — Matrix UI verification matches table
- [ ] Step 4 — Delegation chain configured + tested via simulated escalation
- [ ] Step 5 — Self-approval block confirmed working
- [ ] Step 6 — Audit log shows seed events
- [ ] บอส — sign-off date: __________

---

## 🔄 Ongoing role changes

หลัง initial seed → role changes ผ่าน Backend Matrix UI **เท่านั้น** (boss-only):
- Toggle checkbox + Save → 1-eye if same-day, 4-eyes if > 1 user changed at once
- Audit log row per change (delta details)
- LINE alert บอส on every change (defensive — prevent insider abuse)

ห้าม run wp-cli `add-cap` หลัง initial seed — bypass audit + alert chain.