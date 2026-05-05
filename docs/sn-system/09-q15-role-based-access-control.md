# 🔐 Q15 — Backend UserAdmin Role-based Access Control

**Date**: 2026-05-05
**Source**: `docs/sn-system/07-boss-decisions-log.md` Q15 override
**Plan ref**: v2.13 §2.7 Approval Tier Matrix + §K.10 Permission Matrix

บอส override Q15: "ทำ Backend UserAdmin Role-based access control" — แทน hardcoded approver list (default 3 คน), ทำเป็นระบบ role admin มอบสิทธิ์ผ่าน UI จัดการได้

---

## 🎯 Goal

แก้ปัญหา 3 ข้อพร้อมกัน:

1. **No hardcoded approver list** — บอสไม่อยาก fix รายชื่อ 3 คนใน config (cumbersome)
2. **Per-action permission** — แอดมินคนละ role ทำได้ไม่เหมือนกัน (warehouse แค่รับเพลท / approver กดอนุมัติ swap / boss ดู PII ลูกค้า)
3. **Audit + delegate** — มี UI ระบุว่าใครเป็น approver, สลับสิทธิ์ได้, audit log การเปลี่ยน role

---

## 📐 Role Hierarchy (5 ระดับ)

ขึ้นบน WP `administrator` role (super admin = บอส)

| Role | WP Slug | Capabilities | Use Case |
|---|---|---|---|
| 👑 **Super Admin** | `administrator` | `manage_options` + ทุก cap | บอส (full control) |
| 🛡️ **S/N Approver** | `dinoco_sn_approver` | `dinoco_sn_approver` + view all SN data | คนกดอนุมัติ swap/void/recall (4-eyes) |
| 📦 **S/N Warehouse** | `dinoco_sn_warehouse` | `dinoco_sn_warehouse` + create batch + receive plates | คนคลัง — รับเพลท + scan |
| 🔍 **S/N View PII** | `dinoco_sn_view_pii` | `dinoco_sn_view_pii` (read-only PII access) | Service Center (ดูเบอร์/ชื่อลูกค้าเต็ม) |
| 👥 **S/N Read-only** | `dinoco_sn_readonly` | View dashboard + audit log (no PII, no actions) | Investigators / auditors |

**ข้อสำคัญ**: แต่ละ user มี **หลาย roles** ได้ (e.g. warehouse คนหนึ่งอาจมีทั้ง `dinoco_sn_warehouse` + `dinoco_sn_view_pii` — รับเพลทได้ + ดูข้อมูลลูกค้าได้)

---

## 🔑 Capabilities Map

```php
$dinoco_sn_caps = array(
    // === Warehouse caps (granted to dinoco_sn_warehouse + dinoco_sn_approver + administrator) ===
    'dinoco_sn_warehouse'           => 'รับเพลทจากโรงงาน + scan',

    // === Approver caps (granted to dinoco_sn_approver + administrator) ===
    'dinoco_sn_approver'            => 'อนุมัติ swap/void/recall (4-eyes)',
    'dinoco_sn_approve_swap'        => 'อนุมัติเฉพาะ swap',
    'dinoco_sn_approve_void'        => 'อนุมัติเฉพาะ void',
    'dinoco_sn_approve_recall'      => 'อนุมัติเฉพาะ recall',

    // === PII caps (granted to dinoco_sn_view_pii + administrator) ===
    'dinoco_sn_view_pii'            => 'ดู phone/email/full name ของลูกค้า',
    'dinoco_sn_view_pii_full'       => 'ดูที่อยู่ลูกค้า + ใบเสร็จ',
    'dinoco_sn_export_pii'          => 'export CSV ที่มี PII',

    // === Read-only caps (granted to all S/N roles + administrator) ===
    'dinoco_sn_view_dashboard'      => 'ดู dashboard + stats',
    'dinoco_sn_view_audit'          => 'ดู audit log',
    'dinoco_sn_view_inventory'      => 'ดู pool inventory',

    // === Admin caps (granted to administrator only) ===
    'dinoco_sn_manage_settings'     => 'แก้ settings + flags',
    'dinoco_sn_manage_users'        => 'แก้ user roles (Q15 admin UI)',
    'dinoco_sn_recall_initiate'     => 'เริ่ม recall workflow',
);
```

---

## 🛠 Implementation: NEW snippet `[Admin System] DINOCO User Role Manager`

**DB_ID**: pending (after first sync)
**Shortcode**: `[dinoco_admin_user_roles]`
**Section**: settings (ใน Module Registry)
**Phase**: NEW priority — should land Phase 2 W5 (alongside Tab 4 จัดการ S/N + 4-eyes approval implementation)

### Activation hook — register custom roles

```php
register_activation_hook( __FILE__, 'dinoco_sn_register_custom_roles' );
function dinoco_sn_register_custom_roles() {
    // Idempotent — safe to re-run
    add_role( 'dinoco_sn_approver', 'S/N Approver', array(
        'read' => true,
        'dinoco_sn_approver'        => true,
        'dinoco_sn_approve_swap'    => true,
        'dinoco_sn_approve_void'    => true,
        'dinoco_sn_approve_recall'  => true,
        'dinoco_sn_view_pii'        => true,
        'dinoco_sn_view_dashboard'  => true,
        'dinoco_sn_view_audit'      => true,
        'dinoco_sn_view_inventory'  => true,
    ) );

    add_role( 'dinoco_sn_warehouse', 'S/N Warehouse', array(
        'read' => true,
        'dinoco_sn_warehouse'       => true,
        'dinoco_sn_view_dashboard'  => true,
        'dinoco_sn_view_inventory'  => true,
    ) );

    add_role( 'dinoco_sn_view_pii', 'S/N View PII', array(
        'read' => true,
        'dinoco_sn_view_pii'        => true,
        'dinoco_sn_view_pii_full'   => true,
        'dinoco_sn_view_dashboard'  => true,
    ) );

    add_role( 'dinoco_sn_readonly', 'S/N Read-only', array(
        'read' => true,
        'dinoco_sn_view_dashboard'  => true,
        'dinoco_sn_view_audit'      => true,
        'dinoco_sn_view_inventory'  => true,
    ) );

    // Grant ALL caps to administrator (super admin = บอส)
    $admin = get_role( 'administrator' );
    if ( $admin ) {
        foreach ( array_keys( dinoco_sn_caps_list() ) as $cap ) {
            $admin->add_cap( $cap );
        }
    }
}
```

### Permission helper (replace bare `current_user_can('manage_options')`)

```php
/**
 * Check if user can perform S/N action.
 * Falls back to manage_options for legacy compat (Phase 1 SN snippets).
 */
function dinoco_sn_user_can( $cap, $user_id = null ) {
    if ( $user_id === null ) $user_id = get_current_user_id();
    if ( ! $user_id ) return false;

    // Super admin (administrator) = bypass
    if ( user_can( $user_id, 'manage_options' ) ) return true;

    // Specific S/N cap
    return user_can( $user_id, $cap );
}
```

### Admin UI mockup

```
┌── User Role Manager ────────────────────────────────────────┐
│  จัดการสิทธิ์ผู้ใช้งานในระบบ S/N                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Filter: [ทั้งหมด ▾]                              [+ เพิ่ม] │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ผู้ใช้                Roles                  Last login │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ บอส (admin)          👑 Super Admin           1 ชม.    │ │
│  │ คุณวิน                🛡️ Approver + 📦 Warehouse  3 ชม. │ │
│  │ คุณสมชาย              📦 Warehouse              5 ชม.   │ │
│  │ Service Team          🔍 View PII + 👥 Read     1 วัน  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Click row → modal แก้ roles + audit log                     │
└──────────────────────────────────────────────────────────────┘
```

### REST endpoints

`/wp-json/dinoco/v1/sn-roles/*` namespace:

- `GET /sn-roles/list` — list users with S/N roles
- `POST /sn-roles/assign` — body `{user_id, roles[]}` (replace user's S/N roles)
- `POST /sn-roles/revoke` — body `{user_id, role}` (remove single role)
- `GET /sn-roles/audit` — log of role changes (paginated)

All require `dinoco_sn_manage_users` cap (only super admin).

---

## 🔗 Integration with existing SN snippets

### `[Admin System] DINOCO Production SN Manager`

Replace `current_user_can('manage_options')` in 4-eyes endpoints:

```php
// BEFORE
if ( ! current_user_can( 'manage_options' ) ) {
    return new WP_Error( 'forbidden', '...', array( 'status' => 403 ) );
}

// AFTER (Phase 2 W5)
if ( ! dinoco_sn_user_can( 'dinoco_sn_approver' ) ) {
    return new WP_Error( 'forbidden', 'Need approver role', array( 'status' => 403 ) );
}
```

### Approval workflow

When admin requests swap/void/recall:
1. POST `/swap-request` with body
2. Backend insert pending request + `requires_approver_cap = 'dinoco_sn_approve_swap'`
3. Notify ALL users with that cap via LINE Flex
4. First user (≠ requester) to approve → execute. Self-approval blocked via `actor !== approver` check.

### SLA + Auto-escalation (per v2.13 §2.7)

If no approver responds in SLA window (1hr urgent / 24hr normal / 72hr low):
- Cron escalates to administrators (super admin)
- Telegram alert บอส
- Audit row "auto-escalated"

---

## 📋 Files to modify (Phase 2 W5 sprint — ~40h)

| File | Action | Effort |
|---|---|---|
| NEW `[Admin System] DINOCO User Role Manager` | Create snippet (4 endpoints + UI + activation hook + helpers) | 14h |
| `[Admin System] DINOCO Production SN Manager` | Replace 12+ `current_user_can('manage_options')` checks with `dinoco_sn_user_can($cap)` | 4h |
| `[System] DINOCO SN REST API` | Same replacement on REST permission_callbacks (15+ endpoints) | 6h |
| `[Admin System] DINOCO Public API Gateway` | Same replacement (4 endpoints) | 2h |
| Approval workflow (NEW REST + DB table) | `wp_dinoco_sn_approval_requests` + `/approve` endpoint + LINE Flex | 8h |
| Tests (PHPUnit + drift) | Role registration + permission helper + endpoint integration | 4h |
| Wiki + docs update | CLAUDE.md + docs/sn-system/* | 2h |
| **Total** | | **~40h** |

---

## ⚠️ Migration plan

### Phase 1 (current — backward compat)

- `dinoco_sn_user_can()` falls back to `manage_options` → existing super admin (administrator) works without changes
- New roles registered but **no users assigned yet**
- All endpoints continue working as Phase 1 baseline

### Phase 2 W5 (rollout)

1. NEW User Role Manager snippet deploys (registers roles via activation hook on first admin_init)
2. Boss assigns roles via UI to existing admin users (warehouse → `dinoco_sn_warehouse`, etc.)
3. Endpoints migrate one-by-one to specific caps (with `dinoco_sn_user_can()` helper)
4. Audit log every role change

### Phase 3+ — Strict mode

- Toggle flag `dinoco_sn_strict_role_check = 1`
- `dinoco_sn_user_can()` no longer falls back to `manage_options` — require specific cap
- Force every endpoint to declare which cap it needs

---

## ✅ Status

- **Now (Phase 1 W3 deployed)**: Design doc landed (this file). NO snippet creation yet (requires Phase 2 W5 cycle).
- **Phase 2 W5 kickoff**: Implement User Role Manager snippet + migrate SN snippets.
- **Phase 3 W8**: Toggle strict mode flag.

---

## 🔗 Cross-references

- `docs/sn-system/07-boss-decisions-log.md` Q15 override
- v2.13 §2.7 Approval Tier Matrix + §K.10 Permission Matrix
- WP Roles & Capabilities API: https://developer.wordpress.org/plugins/users/roles-and-capabilities/
- Existing `[Admin System] DINOCO User Management` (different — manages user data, NOT roles)
