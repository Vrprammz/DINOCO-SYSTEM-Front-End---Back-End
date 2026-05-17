# Sentry Activation — Boss Step-by-Step Guide

[← Runbooks index](../) · [← Original setup runbook](./SENTRY-ACTIVATION.md)

> **Status**: Ready to execute · Boss decision approved 2026-05-16 (#2 = "ใช้")
> **Pre-req**: SSH access to WP server + WP admin
> **Time to complete**: ~15-20 นาที (รวมเปิดบัญชี Sentry)
> **Risk**: ต่ำ — flag default OFF, ทุก call site guarded by `class_exists('\Sentry\Client')`

---

## ทำไมต้องใช้ Sentry

- เวลา PHP fatal/exception เกิดบน production → ส่ง stack trace + ลูกค้าคนไหนเจอ + URL อะไร → dashboard
- ปัจจุบันใช้แค่ `error_log` → ดูได้บน server console เท่านั้น + ไม่มี aggregation
- Sentry = aggregator + alert + trends + release tracking
- Free tier: 5,000 events/month — เพียงพอสำหรับ DINOCO ขนาดปัจจุบัน

## ขั้นตอน 5 step

### Step 1 — เปิดบัญชี Sentry (5 นาที)

1. ไป https://sentry.io/signup/
2. Sign up ฟรี (เลือก "I'm using PHP")
3. สร้าง project ใหม่ — เลือก platform **PHP** (ไม่ใช่ Laravel/Symfony)
4. ตั้งชื่อ project: `dinoco-wp`
5. Copy **DSN URL** (รูป `https://abc123@oXXXXX.ingest.sentry.io/YYYYY`)
6. (Optional) สร้าง slack notification ใน Sentry Settings → Integrations

### Step 2 — Install Sentry PHP SDK บน WP server (5 นาที)

⚠️ **สำคัญ**: WordPress install ไม่มี `composer.json` ที่ root โดย default → ติดตั้ง composer require ที่ root อาจจะสร้าง `composer.json` + `vendor/` ใหม่ที่ WP root ซึ่ง autoload จะไม่ถูกพิจารณาเว้นแต่จะ require ตรง.

**Observability snippet V.1.2 มี `require_once vendor/autoload.php` แล้ว** (line ~104-107 ของ snippet — explicit `file_exists` guard + load) — รองรับ 2 path:

1. `wp-content/vendor/autoload.php` (recommended location)
2. `wp-content/plugins/sentry/vendor/autoload.php` (alternative)

**Option A — Install ที่ `wp-content/` (recommended — ตรงกับ snippet expectation)**:

SSH เข้า WP server แล้วรัน:

```bash
cd /var/www/dinoco.in.th/wp-content   # ปรับ path ถ้าต่าง

# ติดตั้ง composer ถ้ายังไม่มี
if ! command -v composer &>/dev/null; then
    curl -sS https://getcomposer.org/installer | php
    mv composer.phar /usr/local/bin/composer
    chmod +x /usr/local/bin/composer
fi

# ติดตั้ง Sentry SDK
composer require sentry/sentry

# Verify autoload + class loaded
php -r "require 'vendor/autoload.php'; echo class_exists('\\Sentry\\Client') ? 'OK\\n' : 'FAIL\\n';"
# Expected: OK
```

**Option B — Install เป็น mu-plugin (alternative)**:

```bash
mkdir -p /var/www/dinoco.in.th/wp-content/mu-plugins/sentry-bootstrap
cd /var/www/dinoco.in.th/wp-content/mu-plugins/sentry-bootstrap
composer require sentry/sentry
# จากนั้นเพิ่มไฟล์ loader.php ที่ require '../wp-content/mu-plugins/sentry-bootstrap/vendor/autoload.php';
```

(Option A เร็วและตรงกับ snippet code path ปัจจุบัน — แนะนำ unless มี constraint ที่ใส่ที่ `wp-content/vendor/` ไม่ได้)

**Verify ก่อนไป Step 3**:

```bash
# Check class exists from WP context (loads wp-config.php + plugins)
wp --path=/var/www/dinoco.in.th eval 'echo class_exists("\\Sentry\\Client") ? "OK" : "FAIL — vendor autoload path mismatch";'
# Expected: OK

# Check Observability snippet has proper autoload code
wp --path=/var/www/dinoco.in.th eval 'echo function_exists("dinoco_obs_capture") ? "OK" : "FAIL — Observability snippet not active";'
# Expected: OK
```

### Step 3 — เพิ่ม DSN constant ใน wp-config.php (2 นาที)

แก้ไฟล์ `wp-config.php`:

```bash
sudo nano /var/www/dinoco.in.th/wp-config.php
```

เพิ่ม **ก่อน** บรรทัด `/* That's all, stop editing! */`:

```php
// ========== Sentry Error Tracking ==========
define( 'DINOCO_SENTRY_DSN', 'https://abc123@oXXXXX.ingest.sentry.io/YYYYY' );
define( 'DINOCO_SENTRY_ENV', 'production' );            // 'staging' ถ้า test ก่อน
define( 'DINOCO_SENTRY_SAMPLE_RATE', 0.1 );             // 10% transactions
```

แทนที่ DSN ด้วยอันจริงจาก Step 1.5

### Step 4 — Flip flag ON (1 นาที)

ทางใดทางหนึ่ง:

**ทาง A — WP CLI** (เร็วสุด):
```bash
wp option update dinoco_obs_sentry_enabled '1'
wp option update dinoco_obs_correlation_enabled '1'    # bonus — X-Request-ID headers
```

**ทาง B — phpMyAdmin** (ถ้าไม่มี WP CLI):
```sql
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_obs_sentry_enabled', '1', 'no')
ON DUPLICATE KEY UPDATE option_value = '1';

INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_obs_correlation_enabled', '1', 'no')
ON DUPLICATE KEY UPDATE option_value = '1';
```

**ทาง C — Admin Command Center** (ถ้าหน้า Config Layer Viewer พร้อม):
- `/admin-command-center/#config`
- หา `obs.sentry_enabled` → toggle ON
- หา `obs.correlation_enabled` → toggle ON

### Step 5 — Verify (5 นาที)

**Test 1 — Trigger test event via WP CLI** (ไม่ต้องสร้างไฟล์ — ปลอดภัยกว่า):

```bash
# Run จาก SSH session
wp --path=/var/www/dinoco.in.th eval '
if ( function_exists( "dinoco_obs_capture" ) ) {
    dinoco_obs_capture( "error", "Sentry test " . current_time( "mysql" ), array( "context" => "boss_manual_test" ) );
    echo "Sent! Check Sentry dashboard ภายใน 1 นาที\\n";
} else {
    echo "ERROR: dinoco_obs_capture not found — Observability snippet ไม่ sync\\n";
}
'
```

✅ Pattern นี้ปลอดภัยกว่า "drop test PHP file ใน wp-content" เพราะ:

- ไม่มี publicly-accessible file ค้าง (race condition กับ bot scan)
- ไม่มี risk ของ wp-load.php path สมมุติผิด (multisite / Bedrock / hardened install)
- WP CLI โหลด full WP context ครบ + ไม่ต้องลบไฟล์ทีหลัง

**Test 2 — เช็ค Sentry dashboard**:

- ไป <https://sentry.io> → project `dinoco-wp` → Issues
- ภายใน 30 วินาที จะเห็น event "Sentry test ..."

**Test 3 — เช็ค X-Request-ID header** (correlation):

```bash
# Test ทั้ง authenticated + unauthenticated paths
# Unauthenticated (จะคืน 401 — แต่ header X-Request-ID ก็ต้อง emit):
curl -I https://dinoco.in.th/wp-json/dinoco-stock/v1/stock/list?per_page=1

# Authenticated (ต้อง pass nonce + cookie):
curl -I -H "Cookie: wordpress_logged_in_XXX=..." \
     -H "X-WP-Nonce: ..." \
     https://dinoco.in.th/wp-json/dinoco-stock/v1/stock/list?per_page=1

# Response headers ต้องมี:  X-Request-ID: req_XXXXXXXX
# Header นี้ emit ผ่าน rest_post_dispatch filter ใน Observability snippet
# — fire บน ทั้ง 200 และ 401/403/4xx responses
```

**หมายเหตุ cache layer**: หลัง flip flag `dinoco_obs_correlation_enabled='1'` Observability snippet V.1.2 มี H7 alloptions cache bust (static guard) — แต่ถ้า WordPress cache plugin มี aggressive caching ที่ stale value → flush manually:

```bash
wp --path=/var/www/dinoco.in.th cache flush
```

## Troubleshooting

| Symptom | สาเหตุ | แก้ |
|---|---|---|
| Test 1 echo "ERROR: dinoco_obs_capture not found" | Observability snippet (V.1.2+) ไม่อยู่ใน WP | ตรวจ Sync Dashboard ว่า snippet sync แล้ว |
| Test 1 echo "Sent!" แต่ Sentry ไม่มี event | DSN ผิด หรือ network block | ดู error_log: `tail -f /var/log/php-fpm/error.log` หา `[DINOCO_OBS]` |
| Test 3 ไม่มี `X-Request-ID` header | flag `obs.correlation_enabled` ยังเป็น `'0'` | re-run Step 4 ทาง B |
| Sentry dashboard มี event แต่ stack trace empty | normal สำหรับ manual capture | จะมี stack เต็มเฉพาะ exception ที่เกิดจริง |
| Event count กระโดด >100/วัน | ระบบ broken บางจุด — ดู top events | แก้ root cause ก่อน เพราะ Sentry free tier 5K/เดือน |

## Rollback (ถ้าเกิดปัญหา)

ปิด instant ทาง WP CLI:
```bash
wp option update dinoco_obs_sentry_enabled '0'
wp option update dinoco_obs_correlation_enabled '0'
```

หรือ phpMyAdmin: `UPDATE wp_options SET option_value='0' WHERE option_name IN ('dinoco_obs_sentry_enabled', 'dinoco_obs_correlation_enabled');`

**ผลของ rollback**:
- `dinoco_obs_capture()` กลายเป็น no-op (skip Sentry SDK call)
- `X-Request-ID` header หยุด emit
- ระบบทำงานเหมือนเดิม (ก่อน activate)

## Monitoring after launch

วันแรก: ดู Sentry dashboard ทุก 2-3 ชม. ดูว่ามี error storm หรือไม่
สัปดาห์แรก: ดู daily — focus top 3 issues
หลังจากนั้น: Sentry จะส่ง weekly digest email

## Boss decision pending

หลัง 1 สัปดาห์ใช้งาน:
- ถ้า event < 500/วัน → free tier เพียงพอ ตลอด
- ถ้า event > 1000/วัน → upgrade Team plan ($26/mo) เพิ่ม retention + integrations
- ถ้า top issues = noise (เช่น bot scan 404) → filter rules ใน Sentry

## Related files

- [`[Admin System] DINOCO Observability`](../../%5BAdmin%20System%5D%20DINOCO%20Observability) V.1.2+ (H7-safe)
- [Original setup runbook](./SENTRY-ACTIVATION.md) (more technical detail)
- [`docs/compliance/PDPA-BASICS.md`](../compliance/PDPA-BASICS.md) (PII redact rules — already wired in `dinoco_obs_redact_context()`)

## Audit notes

This runbook was **revised V.2 (2026-05-17)** after audit found V.1 had:

- ⚠️ Vague composer install location (assumed WP root has `composer.json` — most installs don't) → V.2 specifies `wp-content/vendor/` ตรงกับ Observability snippet expectation + Option B alternative
- ⚠️ Test file drop in `wp-content/sentry-test.php` posed security risk (publicly-accessible PHP, race condition with bot scans, wp-load.php path assumption) → V.2 uses `wp cli eval` instead (no file artifact, full WP context, no cleanup needed)
- ⚠️ Missing pre-Step 3 verify (class_exists + function_exists check) → V.2 adds `wp eval` smoke test after install
- ⚠️ Missing cache flush note after flag flip (alloptions cache may serve stale '0') → V.2 adds `wp cache flush` step
- ⚠️ Test 3 curl assumed authenticated but didn't pass nonce → V.2 documents both auth + unauth paths (header should emit on both)

V.2 corrected to safer install pattern + WP CLI testing + cache flush awareness. Verified Observability snippet V.1.2 autoload code path (line ~104-107 file_exists guard) + H7 alloptions bust (line ~58-60 static guard).
