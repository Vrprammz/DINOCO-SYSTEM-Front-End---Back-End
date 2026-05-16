# SN Customer Notifications — Flag Flip + Smoke Test Guide

[← Runbooks index](../)

> **Status**: Ready · Boss decision approved 2026-05-16 (#5 = "เปิดเลย เทสเลย")
> **Pre-req**: WP admin access · SN Manager V.0.62+ synced
> **Time to complete**: ~20-30 นาที (flip + smoke test 5 flags)
> **Risk**: ปานกลาง — เปิด flag → customer LINE จะเริ่มได้ Flex push **ทันที**

---

## Flags ที่จะเปิด (5 ตัว)

| Flag | ฟีเจอร์ | Trigger | Frequency cap |
|---|---|---|---|
| `dinoco_sn_flag_expiry_reminder` (F1) | แจ้งเตือนก่อน warranty หมด | Cron daily 02:00 ICT | 1/SN/lifecycle |
| `dinoco_sn_flag_auto_fill_claim` (F3) | Auto-fill Claim form จาก S/N | Customer click "เคลม" → URL prefilled | per click |
| `dinoco_sn_flag_anniversary` (F4) | Anniversary push (ครบ 1y / 2y / 3y) | Cron daily 02:05 ICT | 1/year/SN |
| `dinoco_sn_flag_click_to_call_dealer` (F6) | ปุ่ม โทรหาตัวแทน บน Asset Card | UI render | always-on |
| `dinoco_sn_flag_review_request` (F10) | Review request หลังเคลมจบ | Hook `dinoco_claim_status_changed` → 'closed' | 1/claim |

## Pre-flight check (ทำก่อน flip)

### Check 1 — Snippet versions

```sql
-- ดู version ของ snippet ที่เกี่ยว
SELECT id, name, LEFT(code, 200) as header
FROM wp_snippets
WHERE name IN (
    '[Admin System] DINOCO Production SN Manager',
    '[Admin System] DINOCO SN Lifecycle Notifier',
    '[System] DINOCO SN REST API',
    '[Admin System] DINOCO SN Notifier'
);
-- ต้องเห็น V.0.62+ ใน SN Manager
```

### Check 2 — Cron heartbeat (ดูว่า cron ทำงานจริง)

```sql
SELECT option_name, option_value
FROM wp_options
WHERE option_name LIKE 'dinoco_cron_sn_%_last_run'
ORDER BY option_name;
```

→ ทุก cron heartbeat ต้องไม่เก่ากว่า 24 ชม. (ถ้าเก่ากว่านี้ = cron ไม่ทำงาน — แก้ก่อน flip)

### Check 3 — Notification preference defaults

```sql
SELECT option_name, option_value
FROM wp_options
WHERE option_name LIKE 'dinoco_sn_notif_default_%';
```

→ ลูกค้ามี opt-out ผ่าน Member Dashboard. Default = ON ทุกประเภท

### Check 4 — LINE quota

ดู LINE Official Account dashboard:
- Monthly push quota = ?
- ใช้ไปแล้วเดือนนี้ = ?
- F1 + F4 cron จะใช้ ~150-300 push/วัน (ขึ้นกับจำนวน SN active)

ถ้า quota เหลือ < 30% → ปรึกษาก่อน flip F1/F4

## Flip order (เปิดทีละตัว ไม่พร้อมกัน — กัน flood)

### Day 1 — Low-volume flags (ไม่มี cron, no LINE quota burn)

**F3 + F6** เปิดก่อน — UI-driven เท่านั้น ไม่มี cron, ไม่มี push

```bash
# WP CLI
wp option update dinoco_sn_flag_auto_fill_claim '1'
wp option update dinoco_sn_flag_click_to_call_dealer '1'
```

หรือ SQL:
```sql
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES
  ('dinoco_sn_flag_auto_fill_claim', '1', 'no'),
  ('dinoco_sn_flag_click_to_call_dealer', '1', 'no')
ON DUPLICATE KEY UPDATE option_value = '1';
```

**Verify**:
1. เปิด Member Dashboard ดู Asset Card → ต้องเห็นปุ่ม "📞 โทรร้าน" (F6)
2. คลิก "เคลม" บน Asset Card → URL ต้องมี `?sn=DNCXXX&prefill=1` (F3)

→ ถ้า OK → ไป Day 2

### Day 2 — F10 (event-driven, low volume)

F10 = trigger เมื่อ claim status เปลี่ยนเป็น 'closed' → 1-2 push/วันเฉลี่ย

```bash
wp option update dinoco_sn_flag_review_request '1'
```

**Verify**:
1. หา claim ที่เพิ่ง close หรือ manually close test claim
2. รอ ~1 นาที → check LINE customer
3. ต้องได้ Flex card "💬 รีวิวการเคลม"

→ ถ้า OK → ไป Day 3

### Day 3 — F1 + F4 (cron-driven, larger volume)

⚠️ **High-impact** — cron จะ scan SN ทั้งหมด + ส่ง Flex push หลายสิบ/หลายร้อยตัวในรอบเดียว

ก่อน flip — ดู count คาดการณ์:

```sql
-- F1: SN ที่จะหมดประกันใน 30 วัน + ยังไม่เคยส่ง reminder
SELECT COUNT(*) AS f1_eligible
FROM wp_dinoco_sn_pool sp
LEFT JOIN wp_dinoco_sn_notif_log nl
    ON nl.sn_id = sp.id AND nl.notification_type = 'expiry_reminder'
WHERE sp.status IN ('registered', 'claimed')
  AND sp.warranty_expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
  AND nl.id IS NULL;

-- F4: SN ที่ครบรอบปี (1y/2y/3y) วันนี้
SELECT COUNT(*) AS f4_eligible
FROM wp_dinoco_sn_pool sp
WHERE sp.status IN ('registered', 'claimed')
  AND (
    DATE(sp.registered_at) = DATE_SUB(CURDATE(), INTERVAL 1 YEAR) OR
    DATE(sp.registered_at) = DATE_SUB(CURDATE(), INTERVAL 2 YEAR) OR
    DATE(sp.registered_at) = DATE_SUB(CURDATE(), INTERVAL 3 YEAR)
  );
```

ถ้า F1 > 500 หรือ F4 > 100 → consider rate-limit เปิดทีละ batch (โดย LIMIT ใน cron)

Flip:
```bash
wp option update dinoco_sn_flag_expiry_reminder '1'
wp option update dinoco_sn_flag_anniversary '1'
```

**Verify** (รอ cron รอบถัดไป 02:00 / 02:05 ICT):

```sql
-- ดู notification log entries ใหม่
SELECT created_at, sn_id, notification_type, channel, status
FROM wp_dinoco_sn_notif_log
WHERE notification_type IN ('expiry_reminder', 'anniversary')
ORDER BY id DESC
LIMIT 20;
```

→ ต้องเห็น entries ใหม่ + status = 'sent'

## Manual smoke test (เร่งดู — ไม่ต้องรอ cron)

ถ้าอยาก trigger cron manually ก่อน:

```bash
# WP CLI
wp cron event run dinoco_sn_expiry_reminder_cron
wp cron event run dinoco_sn_anniversary_cron
wp cron event run dinoco_sn_lifecycle_run_service_reminder_schedule
```

หรือสร้างไฟล์ test ชั่วคราว `/var/www/dinoco.in.th/wp-content/sn-cron-test.php`:

```php
<?php
require_once dirname(__DIR__) . '/wp-load.php';
if ( ! current_user_can( 'manage_options' ) ) die( 'admin only' );

do_action( 'dinoco_sn_expiry_reminder_cron' );
do_action( 'dinoco_sn_anniversary_cron' );

echo 'Triggered. Check wp_dinoco_sn_notif_log ภายใน 30 วินาที';
```

เปิด URL: `https://dinoco.in.th/wp-content/sn-cron-test.php` (login admin first)

ลบหลัง test:
```bash
rm /var/www/dinoco.in.th/wp-content/sn-cron-test.php
```

## Monitoring (3 วันแรก)

### Daily ดู
- Sentry (ถ้า activate แล้ว) → SN-related errors
- `wp_dinoco_sn_notif_log` count per day per type
- LINE OA dashboard: push count, opt-out rate
- Customer Service feedback: ลูกค้าบ่นเรื่อง spam ไหม

### KPI ต้องดู
- Open rate (LINE Flex) — Industry baseline ~40-60%
- Click rate ปุ่ม CTA ใน Flex — > 5% = ดี
- Opt-out rate — < 2% ใน 7 วันแรก = ดี (> 5% = ปรับ frequency)

## Rollback (instant)

ถ้าเกิด spam complaint หรือ system overload:

```bash
# ปิดทั้งหมด instant
wp option update dinoco_sn_flag_expiry_reminder '0'
wp option update dinoco_sn_flag_anniversary '0'
wp option update dinoco_sn_flag_review_request '0'
wp option update dinoco_sn_flag_auto_fill_claim '0'
wp option update dinoco_sn_flag_click_to_call_dealer '0'
```

หรือ SQL:
```sql
UPDATE wp_options
SET option_value = '0'
WHERE option_name LIKE 'dinoco_sn_flag_%'
  AND option_name IN (
    'dinoco_sn_flag_expiry_reminder',
    'dinoco_sn_flag_anniversary',
    'dinoco_sn_flag_review_request',
    'dinoco_sn_flag_auto_fill_claim',
    'dinoco_sn_flag_click_to_call_dealer'
  );
```

**ผล**:
- F3/F6 instant off (UI ไม่ render ปุ่ม + URL prefill stop)
- F1/F4 cron จะ check flag ก่อน loop → skip ทั้งหมด
- F10 listener ถูก guard → ไม่ส่ง

## Related files

- [`[Admin System] DINOCO Production SN Manager`](../../%5BAdmin%20System%5D%20DINOCO%20Production%20SN%20Manager) V.0.62+
- [`[Admin System] DINOCO SN Lifecycle Notifier`](../../%5BAdmin%20System%5D%20DINOCO%20SN%20Lifecycle%20Notifier)
- [`docs/sn-system/10-go-live-gate-checklist.md`](../sn-system/10-go-live-gate-checklist.md) — original gate criteria
- [`docs/sn-system/34-phase6-backlog-tracker.md`](../sn-system/34-phase6-backlog-tracker.md) — Phase 6 status
