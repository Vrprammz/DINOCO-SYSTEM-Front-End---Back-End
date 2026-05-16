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

SSH เข้า WP server แล้วรัน:

```bash
cd /var/www/dinoco.in.th    # adjust ตาม path จริงของบอส
composer require sentry/sentry
```

ถ้ายังไม่มี composer:
```bash
cd /var/www/dinoco.in.th
curl -sS https://getcomposer.org/installer | php
php composer.phar require sentry/sentry
```

Verify install:
```bash
ls -la vendor/sentry/sentry/
# ต้องเห็น folder + composer.json
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

**Test 1 — Trigger test event**:

สร้างไฟล์ test ชั่วคราว `/var/www/dinoco.in.th/wp-content/sentry-test.php`:

```php
<?php
require_once dirname(__DIR__) . '/wp-load.php';

if ( ! current_user_can( 'manage_options' ) ) {
    die( 'admin only' );
}

if ( function_exists( 'dinoco_obs_capture' ) ) {
    dinoco_obs_capture( 'error', 'Sentry test from boss — ' . current_time( 'mysql' ), array(
        'context' => 'manual_test',
        'ip'      => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    ) );
    echo 'Sent! Check Sentry dashboard ภายใน 1 นาที';
} else {
    echo 'ERROR: dinoco_obs_capture not found — Observability snippet ไม่ sync';
}
```

เปิด URL: `https://dinoco.in.th/wp-content/sentry-test.php` (login as admin first)

**Test 2 — เช็ค Sentry dashboard**:
- ไป https://sentry.io → project `dinoco-wp` → Issues
- ภายใน 30 วินาที จะเห็น event "Sentry test from boss — ..."

**Test 3 — เช็ค X-Request-ID header** (correlation):
```bash
curl -I https://dinoco.in.th/wp-json/dinoco-stock/v1/stock/list?per_page=1
# Response headers ต้องมี:  X-Request-ID: req_XXXXXXXX
```

**Test 4 — ลบไฟล์ test**:
```bash
rm /var/www/dinoco.in.th/wp-content/sentry-test.php
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
