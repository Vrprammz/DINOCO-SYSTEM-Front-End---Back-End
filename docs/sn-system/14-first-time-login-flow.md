# 🔐 First-Time Login Flow — Customer QR Scan → Activate

**Date**: 2026-05-07
**Source**: Boss decision Round 3 — "B แต่มันก็ต้อง ถ้าเข้าครั้งแรกก็ต้องไป flow login ก่อนนะออกแบบระบบให้ดีๆ"
**Plan ref**: v2.13 §D11 LINE OAuth + WP session + Round 3 Factory QR

---

## ✅ Boss decisions confirmed

1. **QR Content format = B** — URL เต็ม `https://dinoco.in.th/warranty/activate?sn=DNCSS0001234`
2. **First-time login required** — ถ้าลูกค้ายังไม่ login → ต้อง login LINE ก่อนค่อย activate
3. **ออกแบบระบบให้ดี** — flow ต้อง smooth + ไม่มี dead-end

---

## 🎯 End-to-end flow

```
┌──────────────────────────────────────────────────────────────────┐
│  Step 1: ลูกค้าได้เพลทจริง + scan QR ด้วยกล้องมือถือ                  │
│  (iPhone Camera / Android Camera / LINE in-app browser ก็ได้)     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 2: เปิดหน้า dinoco.in.th/warranty/activate?sn=DNCSS0001234│
│  WP page รัน [dinoco_warranty_activate] shortcode                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                    is_user_logged_in() ?
                    ┌─────────┴─────────┐
                    NO                 YES
                    ↓                   ↓
        ┌───────────────────────┐    ┌──────────────────────────┐
        │ Step 3a (FIRST TIME): │    │ Step 3b (RETURNING):     │
        │ Show LINE Login button │    │ Show activation form     │
        │ + sn embedded in state │    │ pre-filled with profile  │
        │ token (10min TTL)      │    └──────────────────────────┘
        └───────────────────────┘                  ↓
                    ↓                              ↓
        ┌───────────────────────┐                  │
        │ Step 4: Click button →│                  │
        │ access.line.me OAuth  │                  │
        │ ?state=<token>        │                  │
        │ &intent=WARRANTY_     │                  │
        │   ACTIVATE_SN         │                  │
        │ &serial=DNCSS...      │                  │
        └───────────────────────┘                  │
                    ↓                              │
        ┌───────────────────────┐                  │
        │ Step 5: LINE OAuth → │                  │
        │ user authorizes →    │                  │
        │ redirect_uri =       │                  │
        │ /callback-login      │                  │
        │ ?code=<auth>         │                  │
        │ &state=<token>       │                  │
        └───────────────────────┘                  │
                    ↓                              │
        ┌───────────────────────────────────────┐  │
        │ Step 6: [System] LINE Callback V.30.9 │  │
        │ - Verify state token (single-use)     │  │
        │ - Read intent = WARRANTY_ACTIVATE_SN  │  │
        │ - Exchange code → LINE token          │  │
        │ - Get LINE profile → match WP user    │  │
        │ - Create WP user if new               │  │
        │ - wp_set_current_user($user_id)       │  │
        │ - wp_send_json_success({redirect})    │  │
        └───────────────────────────────────────┘  │
                    ↓                              │
        ┌───────────────────────┐                  │
        │ Step 7: JS redirect →│                  │
        │ /warranty/activate/  │                  │
        │ ?sn=DNCSS0001234     │                  │
        │ &welcome=new|back    │                  │
        └───────────────────────┘                  │
                    ↓                              ↓
                    └──────────────┬───────────────┘
                                   ↓
        ┌─────────────────────────────────────────────────────┐
        │  Step 8: Activation form (logged in path)           │
        │  - Show product image + top_set name                │
        │  - Pre-fill mobile if first-time + profile saved    │
        │  - Form: moto brand/model + purchase date + receipt │
        │  - Submit → POST /dinoco-sn/v1/activate             │
        └─────────────────────────────────────────────────────┘
                                   ↓
        ┌─────────────────────────────────────────────────────┐
        │  Step 9: Backend atomic flip                        │
        │  - SELECT FOR UPDATE on sn_pool                     │
        │  - status: in_pool → registered                     │
        │  - Create warranty_registration CPT                 │
        │  - Mirror serial_code ACF (backward compat)         │
        │  - LINE Flex push success card                      │
        │  - dinoco_sn_obs_capture('activate_attempt')        │
        └─────────────────────────────────────────────────────┘
                                   ↓
                              ✅ Done
```

---

## 🔑 Implementation summary (committed)

### `[System] DINOCO Warranty Activation LIFF` V.0.3

**Changed login button code** (replaced `wp_login_url($return_url)`):

```php
// V.0.3 — Use LINE OAuth state-token system (not generic wp_login_url)
$state_token = wp_generate_password( 32, false, false );
set_transient(
    'dinoco_line_state_' . $state_token,
    array(
        'serial'  => $sn,                    // preserved across OAuth round-trip
        'intent'  => 'WARRANTY_ACTIVATE_SN', // V.30.9 callback handler
        'created' => time(),
    ),
    600  // 10 min — covers slow LINE OAuth on weak networks
);

$line_login_url = 'https://access.line.me/oauth2/v2.1/authorize'
    . '?response_type=code'
    . '&client_id=' . urlencode( DINOCO_LINE_CHANNEL_ID )
    . '&redirect_uri=' . urlencode( DINOCO_LINE_REDIRECT_URI )
    . '&state=' . urlencode( $state_token )
    . '&scope=profile%20openid'
    . '&bot_prompt=aggressive';
```

**Why state-token system (not redirect_uri query)**:
- LINE OAuth strips/normalizes `redirect_uri` — query params on it ไม่ปลอดภัย
- State token = random 32-char + transient stored server-side (10min TTL) — single-use
- Survives LINE OAuth round-trip without leaking to URL

**UX improvements**:
- Big green LINE-branded button (#06C755) with LINE logo SVG inline
- Touch target 48px (≥ WCAG 44px minimum)
- Helper text "ครั้งแรกที่ใช้ระบบ ลูกค้าต้อง login ด้วย LINE ก่อน — ระบบจะจำเข้ามาทุกครั้งหลังจากนี้"
- Pre-confirmation footer "หลัง login จะกลับมาหน้านี้อัตโนมัติ + ลงทะเบียน S/N: DNCSS0001234"
- Defensive guard: ถ้า LINE constants ไม่ตั้ง → red error banner (instead of broken button)

### `[System] LINE Callback` V.30.8 → V.30.9

**Added intent routing** (after WP login success):

```php
// V.30.9 — S/N v2.13 system intent routing.
if ( is_array( $state_payload )
     && isset( $state_payload['intent'] )
     && $state_payload['intent'] === 'WARRANTY_ACTIVATE_SN'
     && ! empty( $state_payload['serial'] ) ) {
    // Target activate page with sn preserved — bypass member-dashboard
    $activate_params = array(
        'sn'      => $state_payload['serial'],
        'welcome' => $is_new_user ? 'new' : 'back',
    );
    $redirect_to = add_query_arg( $activate_params, home_url( '/warranty/activate/' ) );
    wp_send_json_success( array( 'redirect' => $redirect_to ) );
    return;  // bypass legacy member-dashboard fallthrough
}
```

**Backward compat**: existing `WARRANTY_REGISTER` / `WARRANTY_PAGE` intents still work — only NEW `WARRANTY_ACTIVATE_SN` triggers new redirect path.

---

## ⚙️ Deployment requirements

1. **WP page exists** — admin creates page:
   - Title: `Warranty Activate`
   - Slug: `warranty/activate` (path = `/warranty/activate/`)
   - Content: `[dinoco_warranty_activate]` shortcode only
   - Status: Published

2. **Constants set** — `wp-config.php`:
   - `DINOCO_LINE_CHANNEL_ID` — LINE Login channel (existing for B2B)
   - `DINOCO_LINE_REDIRECT_URI` — `https://www.dinoco.in.th/callback-login`
   - `DINOCO_LINE_CHANNEL_SECRET` — for token exchange

3. **LINE Developers Console**:
   - Callback URL whitelist must include `https://www.dinoco.in.th/callback-login`
   - Should already be configured for existing Gateway flow — verify

---

## 🧪 QA test cases (Phase 1 W4 acceptance)

| # | Scenario | Expected |
|---|---|---|
| L1 | iPhone Camera scan QR (URL form B) → Safari opens activate page | Show LINE Login button + sn shown |
| L2 | First-time customer clicks LINE Login | Redirect to access.line.me OAuth + state token created |
| L3 | OAuth approval → redirect back | New WP user created + redirect to /warranty/activate/?sn=...&welcome=new |
| L4 | Returning customer scans QR (already logged in) | Skip login → directly show activation form |
| L5 | Returning customer scans QR (logged in, different LINE acc) | Skip login (current WP session valid) — admin investigate fraud later |
| L6 | Scan QR ในไลน์ in-app browser | Same flow works (LIFF SDK detects LINE env) |
| L7 | Scan QR ใน Android Chrome | LINE Login web flow works (no LINE app needed) |
| L8 | State token expired (>10min) | Callback shows /warranty/?login_error=no_state |
| L9 | LINE OAuth user denies authorization | Callback shows /warranty/?login_error=denied |
| L10 | DINOCO_LINE_CHANNEL_ID not set | Activate page shows red error banner (no broken button) |
| L11 | Network drop mid-OAuth | LINE retry button + state token still valid (10min TTL) |
| L12 | Activate flow completed → LINE Flex push received | Push includes warranty period + S/N |
| L13 | Customer scans different SN's QR (not theirs) | Activate fails 403 (sn already registered to other user) |
| L14 | Re-scan after activation success | Show "ของคุณลงทะเบียนแล้ว" + member dashboard link |

---

## 🔒 Security considerations

1. **State token single-use** — `delete_transient` after verify (prevents replay)
2. **State token TTL 10 min** — covers slow networks but forces re-auth on stale
3. **Strict format check** — `WARRANTY_ACTIVATE_SN` intent validated upstream (line 285-307)
4. **No serial in URL fragment** — sent via `state` token only (server-side)
5. **CSRF protection** — `wp_create_nonce('wp_rest')` on activate POST
6. **Rate limit** — `b2b_rate_limit()` on activate endpoint (prevent enumeration)
7. **PII protection** — phone/email never in URL (only display via authenticated WP session)

---

## 📊 Status

✅ **Implemented** (this commit pending agents):
- LINE Callback V.30.9 — WARRANTY_ACTIVATE_SN intent routing
- LIFF Activation V.0.3 — proper LINE OAuth state-token system
- Defensive constants check
- Big LINE-branded login button (UX upgrade)
- Pre-confirmation copy "หลัง login จะกลับมาหน้านี้อัตโนมัติ"

⏸️ **Deferred** (Phase 2 W7 atomic deploy):
- WP page `/warranty/activate/` creation (admin manual or migration script)
- Test cases L1-L14 manual QA
- LINE bot menu link → activate flow integration

---

## 🔗 Cross-references

- `docs/sn-system/13-factory-qr-generation-update.md` — QR Content format B confirmed
- `docs/sn-system/07-boss-decisions-log.md` — Round 3 boss answers
- `[System] DINOCO Gateway` — original LINE OAuth state-token pattern (reused)
- `[System] LINE Callback` V.30.9 — intent routing (extended)
- `[System] DINOCO Warranty Activation LIFF` V.0.3 — login button (rewritten)
