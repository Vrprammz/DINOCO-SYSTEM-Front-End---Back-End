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
