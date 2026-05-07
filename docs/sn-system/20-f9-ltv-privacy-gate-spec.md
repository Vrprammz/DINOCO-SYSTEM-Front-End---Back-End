# 🔐 F#9 LTV Dashboard Privacy Gate Spec (Backend Cap Enforcement)

**Version**: 1.0 (2026-05-07)
**Plan**: v2.13 Phase 4 W14
**Boss**: F#9 LTV Dashboard in scope (Q22 R2)

---

## 🎯 Goal

F#9 LTV (Lifetime Value) Dashboard exposes per-customer revenue + claim history. **มี PII risk สูง** — ต้องบังคับ privacy gate ที่ **backend** (ไม่ใช่ JS/CSS hide เท่านั้น) เพื่อ:

1. ป้องกัน data exfiltration ผ่าน DevTools
2. PDPA Section 30 lawful basis (legitimate interest only for view-pii role)
3. รัฐ DPA ตรวจสอบได้ (audit log per access)

---

## 🛡️ 3-Tier Visibility Model

### Tier A — Aggregate (anyone with `manage_options`)
- View total LTV by tier (Gold/Silver/Bronze cohort)
- Bucketed counts (e.g., "23 Gold customers, ₿3.5M total LTV")
- **No** individual customer data
- **No** PII

### Tier B — Individual aggregate (`dinoco_sn_view_pii` cap required)
- View per-customer LTV total
- Customer name + masked phone (`***-***-5678`)
- **No** SN list / claim list / address
- For Service Center staff use case

### Tier C — Full detail (`dinoco_sn_admin` cap + 4-eyes for export)
- Per-customer SN list
- Claim history with notes
- Full address
- Export to CSV: requires 4-eyes approval if > 100 rows
- For accounting / boss / legal counsel use case

---

## 🔒 Backend Enforcement Points

### REST endpoint level

```php
// GET /dinoco-sn/v1/ltv/aggregate (Tier A)
// permission_callback: current_user_can('manage_options')

// GET /dinoco-sn/v1/ltv/customer/{user_id} (Tier B)
// permission_callback: current_user_can('dinoco_sn_view_pii') || current_user_can('manage_options')

// GET /dinoco-sn/v1/ltv/customer/{user_id}/full (Tier C)
// permission_callback: current_user_can('dinoco_sn_admin')

// POST /dinoco-sn/v1/ltv/export?format=csv (Tier C, 4-eyes)
// permission_callback: current_user_can('dinoco_sn_admin') &&
//                      $row_count <= 100 || $approval_signed
```

### Response shaping (Tier B example)

```php
function dinoco_sn_ltv_shape_for_tier_b($row) {
    return [
        'user_id' => $row->user_id,
        'name' => $row->display_name,
        'phone_masked' => dinoco_sn_pdpa_anonymize_mirror(['phone' => $row->phone])['phone'],
        'total_ltv_thb' => (float) $row->total_ltv,
        'cohort' => $row->cohort,
        // explicitly DO NOT include:
        // 'sns' => [...],            // -> Tier C
        // 'claims' => [...],          // -> Tier C
        // 'address' => '...',         // -> Tier C
    ];
}
```

### CSV export safeguard

```php
function dinoco_sn_ltv_export_guard($row_count, $current_user_id) {
    $cap = (int) get_option('dinoco_sn_ltv_export_max_rows', 100);
    if ($row_count <= $cap) return ['ok' => true];

    // Above cap → 4-eyes approval required
    $approval_id = $_REQUEST['approval_id'] ?? 0;
    if (!$approval_id) {
        return ['ok' => false, 'http' => 403,
                'message' => 'Export > 100 rows requires 4-eyes approval'];
    }
    $approval = dinoco_sn_get_approval($approval_id);
    if (!$approval || $approval['status'] !== 'approved' ||
        $approval['actor_user_id'] === $current_user_id) {
        return ['ok' => false, 'http' => 403,
                'message' => 'Invalid or self-approved request'];
    }
    return ['ok' => true];
}
```

---

## 📋 Audit Log

ทุก access ต้อง audit:

```sql
INSERT INTO wp_dinoco_sn_audit (
  event_type, actor_user_id, target_user_id, tier, row_count, ip_address,
  context_json, created_at
) VALUES (
  'ltv_view',     -- or 'ltv_export'
  ?, ?, 'B',      -- tier accessed
  ?,              -- rows returned
  ?, ?, NOW()
);
```

Retention: 5 yr (sensitive financial event per REG-087).

---

## 🚫 Anti-Patterns (DO NOT)

### ❌ JS/CSS hide
```javascript
// WRONG — DevTools can re-show
if (!user.canViewPII) {
  $('.phone').css('display', 'none');
}
```

### ❌ Frontend filtering
```javascript
// WRONG — full payload sent to client
const filtered = response.data.filter(r => r.phone_masked);
```

### ❌ JWT cap claim only
```javascript
// WRONG — JWT can be replayed; backend must re-verify
if (decodedJWT.caps.includes('view_pii')) showPhone();
```

### ✅ Correct pattern
Backend response shape determined per-call by `current_user_can()` check:
- Tier A request → response excludes PII fields entirely
- Tier B request → response includes masked phone only
- Tier C request → full payload but rate-limited + audited + 4-eyes for bulk

---

## 🧪 Test Plan

| Test | Cap | Expected |
|---|---|---|
| `manage_options` only requests Tier C | manage_options | 403 (insufficient) |
| `view_pii` requests Tier C | view_pii | 403 |
| `sn_admin` requests Tier C single | sn_admin | 200 |
| `sn_admin` requests CSV 50 rows | sn_admin | 200 |
| `sn_admin` requests CSV 200 rows w/o approval | sn_admin | 403 |
| `sn_admin` requests CSV 200 rows w/ self-signed approval | sn_admin | 403 |
| `sn_admin` requests CSV 200 rows w/ B's approval | sn_admin | 200 |
| Tier B response inspected via DevTools | view_pii | NO `address` / `sns[]` keys present |

Add to `tests/helpers/SnLtvTierTest.php` (existing — extend with privacy gate tests).

---

## 🎨 UI Hint (transparent UX)

When user lacks Tier C cap:
- Customer detail card shows phone masked + "ดูรายละเอียดเพิ่ม → ติดต่อ Admin"
- Don't render empty placeholders for hidden fields (avoid "you can't see X" hints that leak existence)
- Export button hidden entirely (not just disabled)

---

## ✅ Acceptance Criteria

- [ ] 3 REST endpoints with explicit permission callbacks
- [ ] Response shaping enforced server-side
- [ ] CSV export 4-eyes for > 100 rows
- [ ] Every access audit-logged (5y retention)
- [ ] No PII fields leaked in Tier A/B responses (DevTools verified)
- [ ] UI hides export button when no cap (not just disabled)
- [ ] Test suite covers all 8 scenarios

---

## 📚 Related

- `tests/helpers/SnLtvTierTest.php` — existing tier tests
- `tests/helpers/SnPdpaExportScopeTest.php` — REG-087 PDPA scope
- `docs/sn-system/19-q15-role-matrix-uat-plan.md` — Role Manager UAT
- `docs/compliance/PDPA-BASICS.md` — PDPA Section 30 + 39 reference

---

**Sign-off**:
- [ ] Tech Lead — privacy gate design reviewed
- [ ] Legal counsel — PDPA compliance review
- [ ] บอส — accept tier model + 4-eyes export gate
