# Sentry Activation — Boss Guide (WP Sentry Integration Plugin Path)

[← Runbooks index](../)

> **Status**: Ready · Boss installed **WP Sentry Integration** plugin already (verified 2026-05-18 screenshot)
> **Revision**: V.4 (2026-05-18) — matches actual plugin UI ที่บอสเปิด `/wp-admin/tools.php?page=wp-sentry`
> **Time to complete**: ~10-15 นาที (ทั้งหมดผ่าน WP admin + Code Snippets)
> **Risk**: ต่ำ — plugin auto-load, ปิดได้ตลอด

---

## สถานะปัจจุบัน (จาก screenshot)

บอสเปิด WP Sentry Integration plugin settings แล้ว เห็น:

- ✅ Plugin installed + Sentry SDK for PHP `4.18.1` loaded
- ✅ Browser SDK `8.55.0` loaded
- ❌ **Integration** = Disabled (ทุก toggle ปิดอยู่)
- ❌ `WP_SENTRY_PHP_DSN` constant ไม่ได้ตั้ง
- ❌ `WP_SENTRY_BROWSER_DSN` constant ไม่ได้ตั้ง
- ❌ "Send PHP test event" + "Send PHP test exception" buttons disabled (ต้อง enable integration ก่อน)

ต้องทำ 3 ขั้น: ตั้ง DSN constants → enable integration → test → wire DINOCO Observability

---

## Step 1 — ตั้ง DSN constants ผ่าน Code Snippets (no-SSH, ~3 นาที)

WP Sentry Integration plugin อ่าน DSN จาก PHP constants (`WP_SENTRY_PHP_DSN` + `WP_SENTRY_BROWSER_DSN`). ปกติตั้งใน `wp-config.php` แต่บอส SSH ไม่ได้ → ใช้ Code Snippets แทน (โหลดเป็น must-use plugin → fire ก่อน Sentry plugin init)

1. WP admin → **Snippets → Add New**
2. ตั้งชื่อ: `🔬 Set Sentry DSN constants`
3. Type: **PHP Snippet**
4. Run: **Everywhere** (สำคัญ — ต้อง run ตลอดทุก request, ไม่ใช่ run once)
5. Paste โค้ดนี้ (แทน `YOUR_DSN_HERE` ด้วย DSN ที่บอสได้จาก Sentry):

```php
// Set DSN constants for WP Sentry Integration plugin
// Same DSN ใช้ทั้ง PHP + Browser (Sentry แยก project แต่ DINOCO ใช้รวม)
if ( ! defined( 'WP_SENTRY_PHP_DSN' ) ) {
    define( 'WP_SENTRY_PHP_DSN', 'YOUR_DSN_HERE' );
}
if ( ! defined( 'WP_SENTRY_BROWSER_DSN' ) ) {
    define( 'WP_SENTRY_BROWSER_DSN', 'YOUR_DSN_HERE' );
}
// Optional — Send PII (user info attached to errors — useful for debug)
if ( ! defined( 'WP_SENTRY_SEND_DEFAULT_PII' ) ) {
    define( 'WP_SENTRY_SEND_DEFAULT_PII', true );
}
// Optional — Traces sample rate (0.1 = 10% transactions for performance monitoring)
if ( ! defined( 'WP_SENTRY_TRACES_SAMPLE_RATE' ) ) {
    define( 'WP_SENTRY_TRACES_SAMPLE_RATE', 0.1 );
}
```

6. กด **Save Changes and Activate**

**ห้าม Run Once** — ต้อง snippet active ตลอด (define constant ทุก request)

### Verify constants ตั้งสำเร็จ

1. กลับไปที่ **Tools → Sentry** (หน้าเดิมที่บอสเปิด screenshot)
2. Refresh หน้า (Cmd+R)
3. ดูที่ **PHP integration** section → ตรง "WP_SENTRY_PHP_DSN contains a valid DSN" — ข้อความจะหายไป (เพราะ DSN valid แล้ว)
4. ดูที่ **Browser integration** — เหมือนกัน ข้อความ DSN warning หายไป

ถ้ายังเห็น warning → snippet save ไม่สำเร็จ หรือ "Run Everywhere" ไม่ได้เลือก

---

## Step 2 — Enable Integration toggles (~1 นาที)

ที่หน้า **Tools → Sentry**:

1. Section **PHP integration** → คลิก ✅ Enabled checkbox
2. Section **Browser integration** → คลิก ✅ Enabled checkbox
3. (Optional) Section **Tracing** → ✅ Enabled (สำหรับ performance monitoring)
4. (Optional) Section **Identify Users** → ✅ Enabled (attach user info to errors — useful)
5. Save (อาจ auto-save แล้วแต่ plugin version)

---

## Step 3 — Test ว่า Sentry รับ event (~2 นาที)

**Test A — ปุ่มในหน้า plugin** (เร็วสุด):

1. ที่หน้า **Tools → Sentry** → scroll หา "Test PHP integration" section
2. กดปุ่ม **"Send PHP test event"** (จะ enable ได้แล้วหลัง Step 2)
3. กดปุ่ม **"Send PHP test exception"**
4. ภายใน 30 วินาที → ไปดู Sentry dashboard → **Issues** tab → ต้องเห็น 2 events

**Test B — ผ่าน Code Snippets** (ทดสอบ DINOCO function):

1. Snippets → Add New → ชื่อ `🧪 Sentry test DINOCO capture`
2. Type: PHP Snippet, Run: **Only run once**
3. Paste:

```php
if ( function_exists( 'dinoco_obs_capture' ) ) {
    dinoco_obs_capture(
        'error',
        'DINOCO Sentry test from boss — ' . current_time( 'mysql' ),
        array( 'context' => 'manual_test', 'source' => 'code_snippets' )
    );
    echo '✅ Sent! Check Sentry dashboard ภายใน 30 วินาที';
} else {
    echo '❌ ERROR: dinoco_obs_capture() not found — DINOCO Observability snippet ไม่ active';
}
```

4. กด **Run Once**
5. ดู Sentry dashboard

✅ ถ้าเห็น 3 events (PHP test + exception test + DINOCO capture) = setup สำเร็จครบ

ลบ snippet "🧪 Sentry test" หลังเทสเสร็จ

---

## Step 4 — Activate DINOCO Observability flag (~1 นาที)

ตอนนี้ WP Sentry plugin ทำงานแล้ว แต่ DINOCO Observability snippet ยัง flag OFF — ต้อง flip flag เพื่อให้ `dinoco_obs_capture()` calls ส่งเข้า Sentry จริง

Snippets → Add New → ชื่อ `🔬 Activate DINOCO Observability flags`
Type: PHP Snippet, Run: **Only run once**

```php
update_option( 'dinoco_obs_sentry_enabled', '1', false );
update_option( 'dinoco_obs_correlation_enabled', '1', false );
// Bust alloptions cache (V.1.2 H7 fix)
wp_cache_delete( 'alloptions', 'options' );
echo '✅ DINOCO Sentry + Correlation IDs ON';
```

กด **Run Once** → ลบ snippet

หลังจากนี้:

- DINOCO snippets เรียก `dinoco_obs_capture()` → ส่ง event เข้า Sentry
- REST response มี `X-Request-ID: req_XXX` header (ตามได้ใน log)

---

## Step 5 — Verify end-to-end (~1 นาที)

DevTools → Network tab → refresh `/admin-command-center/`:

- หา REST request ใดก็ได้ → Response Headers → ต้องมี `X-Request-ID: req_XXXXXXXX`

ถ้ามี = correlation working ✅

---

## Troubleshooting

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| Step 1 — Constants ไม่ถูกตั้ง (refresh แล้วยังเห็น warning) | Snippet save ไม่สำเร็จ หรือ Run scope ไม่ใช่ Everywhere | กลับไปแก้ snippet → ตั้ง Run = Everywhere → Save again |
| Step 3A — Test buttons ยัง disabled | Integration toggles ยังไม่ Enabled (Step 2) | re-check Step 2 toggles |
| Step 3 — Test event ส่งแล้ว Sentry ไม่เห็น | DSN ผิด หรือ network block | (1) ตรวจ DSN ใน Sentry project settings ว่าตรง (2) curl test: `curl -sv https://[ingest_host]/api/...` (3) Sentry dashboard → Project Settings → Inbound Filters: ตรวจไม่มี filter ที่ block |
| Step 5 — ไม่มี X-Request-ID header | Step 4 flag ยังไม่ flip | re-run Step 4 snippet |
| Sentry dashboard มี duplicate events | Both WP plugin + DINOCO snippet capture event เดียวกัน | OK ไม่ใช่บัค — DINOCO `dinoco_obs_capture()` ส่ง event เพิ่มจาก WP plugin auto-capture. ถ้าอยาก dedupe → ใช้ Sentry fingerprint rules ใน dashboard |

## Rollback (instant — no SSH)

Snippets → Add New → ชื่อ `🛑 Rollback Sentry`:

```php
update_option( 'dinoco_obs_sentry_enabled', '0', false );
update_option( 'dinoco_obs_correlation_enabled', '0', false );
echo '✅ Rolled back';
```

Run Once → ลบ snippet

ปิด integration ทั้งหมด:

1. Tools → Sentry → uncheck Enabled toggles
2. Plugins → WP Sentry Integration → Deactivate (เก็บได้ ใช้ทีหลัง — หรือ Delete ถ้าไม่ใช้)
3. Snippets → deactivate "🔬 Set Sentry DSN constants"

**ผลของ rollback**:

- DINOCO `dinoco_obs_capture()` กลายเป็น no-op
- `X-Request-ID` header หยุด emit
- WP Sentry plugin ก็ปิด → ไม่ส่ง event อะไรทั้งสิ้น

## Monitoring after launch

- วันแรก: ดู Sentry dashboard ทุก 2-3 ชม. ดูว่ามี error storm ไหม
- สัปดาห์แรก: ดู daily — focus top 3 issues
- หลังจากนั้น: Sentry ส่ง weekly digest email อัตโนมัติ
- ถ้า events > 5K/เดือน → consider upgrade Team plan ($26/mo)
- ถ้า top issues = noise (bot scan 404) → set "Inbound Filters" ใน Sentry project settings

## Related files

- [`[Admin System] DINOCO Observability`](../../%5BAdmin%20System%5D%20DINOCO%20Observability) V.1.2+ (H7-safe)
- WP Sentry Integration plugin: <https://wordpress.org/plugins/wp-sentry-integration/>
- [`docs/compliance/PDPA-BASICS.md`](../compliance/PDPA-BASICS.md) (PII redact rules — `dinoco_obs_redact_context()`)

## Audit notes

V.4 (2026-05-18) — boss installed WP Sentry Integration plugin successfully (verified screenshot) แต่ยังไม่ได้ตั้ง DSN constants หรือ enable toggles. Runbook V.3 (general WP plugin install) replaced with V.4 (specific to actual plugin บอสใช้)

V.3 → V.4 changes:

- Step 1 specifies exact constants `WP_SENTRY_PHP_DSN` + `WP_SENTRY_BROWSER_DSN` (จาก plugin UI screenshot)
- Step 2 added Enable Integration toggles step (plugin defaults to disabled)
- Step 3 uses plugin's built-in "Send PHP test event" + "Send PHP test exception" buttons + DINOCO capture function for triple verification
- All steps use Code Snippets (no SSH needed throughout)
- Rollback path documented ทุก layer (plugin / constants / DINOCO flags)
