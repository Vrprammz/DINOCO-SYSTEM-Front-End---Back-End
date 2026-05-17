# SN Customer Notifications — Flag Flip + Smoke Test Guide

[← Runbooks index](../)

> **Status**: Ready · Boss decision approved 2026-05-16 (#5 = "เปิดเลย เทสเลย")
> **Pre-req**: WP admin access · SN Manager V.0.62+ + Lifecycle Notifier shipped
> **Time to complete**: ~20-30 นาที (flip + smoke test)
> **Risk**: ปานกลาง — เปิด flag → customer LINE จะเริ่มได้ Flex push **ทันที**
> **Revision history**: V.2 (2026-05-16) — corrected after audit found wrong flag/cron/table names

---

## ⚠️ คำเตือนสำคัญ (อ่านก่อนรัน)

ระบบ SN notifications **ไม่มี per-feature flags แยก** (F1/F3/F4/F6/F10) แบบที่ runbook V.1 เคยอ้าง. ของจริง:

| Layer | Flag / mechanism | Effect |
|---|---|---|
| **Master kill switch** | `dinoco_sn_system_enabled` (default `'0'`) | ปิดทั้งระบบ SN — cron unschedule, REST 503 |
| **Send gate** | `dinoco_sn_notification_send_enabled` (default `'0'`) | ปิด LINE push ทุกประเภท แต่ cron ยัง enqueue → log บันทึก dry-run |
| **Per-user opt-out** | `dinoco_sn_should_send_to_user($uid, $type)` | ลูกค้าปิดต่อประเภทผ่าน Member Dashboard preferences |
| **Per-type** (built-in always-on) | `expiry_30d` / `anniversary_2y` / `review_request` / `service_reminder` | ไม่มี toggle ระดับ type — ต้อง code change ถ้าจะ disable เฉพาะ type |

**ดังนั้น flow flip จะมี 2 ตัวเลือก**:
- **Option A — เปิดทุกอย่าง** (recommended for "เปิดเลย เทสเลย")
- **Option B — เปิดระบบแต่ disable send** (cron run + log only, ไม่ push ลูกค้า — สำหรับ debug)

## Pre-flight check (ทำก่อน flip)

### Check 1 — Snippet versions

```sql
SELECT id, name, LEFT(code, 200) as header
FROM wp_snippets
WHERE name IN (
    '[Admin System] DINOCO Production SN Manager',
    '[Admin System] DINOCO Warranty Lifecycle Notifier',
    '[System] DINOCO SN REST API'
);
```

→ ต้องเห็น SN Manager V.0.62+, Warranty Lifecycle Notifier shipped

### Check 2 — Cron heartbeat (ดูว่า cron ทำงานจริง)

```sql
SELECT option_name, option_value
FROM wp_options
WHERE option_name LIKE 'dinoco_cron_dinoco_sn_%_last_run'
ORDER BY option_name;
```

→ heartbeat ทุกตัวต้องไม่เก่ากว่า 24-25 ชม. (ก่อน flag ON cron register แบบ flag-aware → จะ unregister ถ้า `dinoco_sn_system_enabled=0`. ถ้าเพิ่งเปิดครั้งแรก = หาไม่เจอ heartbeat = ปกติ — heartbeat จะเริ่มเขียนหลังเปิด)

### Check 3 — Notification preference defaults

```sql
SELECT option_name, option_value
FROM wp_options
WHERE option_name LIKE 'dinoco_sn_notif_default_%';
```

→ ลูกค้ามี opt-out ผ่าน Member Dashboard. Default = ON ทุกประเภท

### Check 4 — LINE quota

LINE Official Account dashboard:
- Monthly push quota = ?
- ใช้ไปแล้วเดือนนี้ = ?
- Expiry + Anniversary cron จะใช้ ~150-300 push/วัน (ขึ้นกับจำนวน SN active)

ถ้า quota เหลือ < 30% → consider Option B (cron run + log, ไม่ push) ก่อน scale

### Check 5 — Notification table exists

```sql
SHOW TABLES LIKE 'wp_dinoco_sn_notifications';
-- Expected: 1 row
```

→ table จะ lazy install ตอน flip flag (admin_init). ถ้าไม่มี = SN Manager snippet ยังไม่ activate

## Option A — Flip ทุกอย่าง (recommended)

### Step 1 — เปิด master kill switch

```bash
# WP CLI (เร็วสุด)
wp option update dinoco_sn_system_enabled '1'
```

หรือ SQL:
```sql
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_sn_system_enabled', '1', 'no')
ON DUPLICATE KEY UPDATE option_value = '1';
```

**ผลทันที**:
- Flag-aware cron จะ re-register บน `update_option_dinoco_sn_system_enabled` hook
- REST endpoints `/dinoco-sn/v1/*` เริ่มตอบ (จาก 503 → 200)
- Marketplace + customer warranty register ใช้งานได้

### Step 2 — เปิด send gate (LINE push)

```bash
wp option update dinoco_sn_notification_send_enabled '1'
```

หรือ SQL: replace `dinoco_sn_system_enabled` ด้วย `dinoco_sn_notification_send_enabled`

**ผลทันที**:
- รอบ cron ถัดไปจะ push LINE Flex จริง
- ก่อนหน้านี้ (gate=0) cron enqueue + write `wp_dinoco_sn_notifications` แต่ skip การ push

### Step 3 — Verify cron scheduled

```bash
wp cron event list | grep dinoco_sn_
```

Expected output (ขั้นต่ำ):
- `dinoco_sn_expiry_schedule_cron` — daily 02:00 ICT
- `dinoco_sn_anniversary_schedule_cron` — daily 02:05 ICT
- `dinoco_sn_notification_send` — every 5 min (worker that drains queue)
- + อื่นๆ (geo/heatmap/retention)

ถ้าไม่เห็น → trigger reschedule:
```bash
wp dinoco-sn reevaluate-flag-aware-crons   # ถ้ามี CLI command
# หรือ
wp eval 'if(function_exists("dinoco_sn_reevaluate_flag_aware_crons")) dinoco_sn_reevaluate_flag_aware_crons();'
```

### Step 4 — Smoke test (เร่งดู, ไม่ต้องรอ cron 02:00)

**ทาง A — Trigger via WP CLI**:
```bash
# Run schedule crons manually (will enqueue notifications)
wp cron event run dinoco_sn_expiry_schedule_cron
wp cron event run dinoco_sn_anniversary_schedule_cron

# Run worker to actually send LINE pushes
wp cron event run dinoco_sn_notification_send
```

**ทาง B — wp eval** (ถ้า CLI ไม่ support `cron event run`):
```bash
wp eval '
if (function_exists("dinoco_sn_run_expiry_schedule"))
    dinoco_sn_run_expiry_schedule();
if (function_exists("dinoco_sn_run_anniversary_schedule"))
    dinoco_sn_run_anniversary_schedule();
if (function_exists("dinoco_sn_run_notification_send"))
    dinoco_sn_run_notification_send();
echo "Done — check wp_dinoco_sn_notifications";
'
```

### Step 5 — Verify entries in notifications table

```sql
SELECT created_at, sn, notification_type, channel, status, sent_at
FROM wp_dinoco_sn_notifications
ORDER BY id DESC
LIMIT 20;
```

→ ต้องเห็น entries ใหม่. Status:
- `'queued'` = enqueued by schedule cron, waiting worker
- `'sent'` = worker pushed LINE Flex สำเร็จ
- `'failed'` = error ใน push (ดู `error_message` col)
- `'skipped'` = `dinoco_sn_should_send_to_user()` คืน false (user opted out)

## Option B — เปิดระบบ แต่ disable send (debug mode)

```bash
wp option update dinoco_sn_system_enabled '1'
# ไม่เปิด dinoco_sn_notification_send_enabled
```

ผล:
- Cron ทำงาน + enqueue notifications ใน `wp_dinoco_sn_notifications` ปกติ
- Worker (`dinoco_sn_run_notification_send`) เช็ค gate → skip LINE push
- Status = `'queued'` ตลอด (ไม่กลายเป็น `sent`)

ใช้เพื่อ:
- ดูว่า cron + scheduler ทำงานถูกไหม
- ตรวจดู volume ก่อนเปิด send จริง
- Debug template / Flex generation โดย dump payload ใน `metadata` JSON col

หลัง verify ผ่าน → flip `dinoco_sn_notification_send_enabled='1'` → worker จะ drain queue

## Manual test แบบเฉพาะเจาะจง

### Trigger 1 SN เฉพาะ (ไม่ scan ทั้งหมด)

```bash
wp eval '
if (function_exists("dinoco_sn_enqueue_notification")) {
    dinoco_sn_enqueue_notification(
        "DNCSS-TEST-001",     // SN
        12,                   // user_id (ของบอส/admin)
        "expiry_30d",         // notification_type
        array("test" => true) // metadata
    );
    echo "Enqueued. Run worker: wp cron event run dinoco_sn_notification_send";
}
'
```

### Test review_request hook (post-claim)

หา claim ที่เพิ่ง close หรือ manually trigger:
```bash
wp eval '
do_action("dinoco_claim_status_changed", 123, "in_progress", "closed");
// ดู notification ที่เกิด:
echo "Check: SELECT * FROM wp_dinoco_sn_notifications WHERE notification_type=\"review_request\" ORDER BY id DESC LIMIT 1;";
'
```

## Monitoring (3 วันแรก)

### Daily ดู
- LINE OA dashboard: push count, opt-out rate, message engagement
- Customer Service feedback: ลูกค้าบ่นเรื่อง spam ไหม
- Sentry (ถ้า activate) → SN-related errors
- `wp_dinoco_sn_notifications` count per day per type:

```sql
SELECT
  DATE(created_at) as day,
  notification_type,
  status,
  COUNT(*) as cnt
FROM wp_dinoco_sn_notifications
WHERE created_at >= CURDATE() - INTERVAL 3 DAY
GROUP BY day, notification_type, status
ORDER BY day DESC, notification_type;
```

### KPI ต้องดู
- LINE Flex open rate — Industry baseline ~40-60%
- Click rate ปุ่ม CTA ใน Flex — > 5% = ดี
- Opt-out rate — < 2% ใน 7 วันแรก = ดี (> 5% = ปรับ frequency)
- `status='failed'` rate — ควร < 1% (สูงกว่านี้ = ปัญหา LINE token / quota)

## Rollback (instant)

ปิดทั้งระบบ instant:
```bash
wp option update dinoco_sn_system_enabled '0'
```

ผล:
- `update_option_dinoco_sn_system_enabled` hook → flag-aware cron auto-unschedule
- REST endpoints คืน 503
- ระบบ "ปิดสนิท" จนกว่าจะเปิดอีกครั้ง

ปิดเฉพาะ LINE push (รักษา cron + queue):
```bash
wp option update dinoco_sn_notification_send_enabled '0'
```

ผล:
- Cron ทำงานต่อ + enqueue ปกติ
- Worker skip การ push → status คงที่ `queued`
- ของในคิว resume ส่งเมื่อ flag ON อีกครั้ง

## Customer-side toggles (per-user opt-out)

ลูกค้าควบคุมเองผ่าน Member Dashboard → Settings → "การแจ้งเตือน":
- ✅/❌ แจ้งเตือนก่อนประกันหมด (expiry_30d)
- ✅/❌ ฉลองครบรอบประกัน (anniversary_2y)
- ✅/❌ ขอรีวิวหลังเคลม (review_request)
- ✅/❌ ทิปดูแลสินค้า (service_reminder)

เก็บใน user_meta `dinoco_sn_notif_pref_{type}` = 'on' / 'off'. Default = 'on' ถ้า key ไม่มี.

`dinoco_sn_should_send_to_user($uid, $type)` อ่าน meta นี้.

## Per-feature flags (F1/F3/F4/F6/F10) — ต้อง dev เพิ่มก่อนใช้

ถ้าต้องการแยก flip ทีละ feature (เช่น เปิดแค่ F1 expiry, ปิด F4 anniversary ก่อน):
- ต้องเพิ่ม schema 5 flags + register ใน Config Layer
- ต้อง wire เข้า cron handler + send worker ที่แต่ละจุด
- Effort: ~6-8 ชม. dev + test
- Boss ตัดสินใจ — ถ้าต้องการ → spec ใหม่

ขณะนี้ใช้ master switch + send gate รวมเท่านั้น

## Related files

- [`[Admin System] DINOCO Production SN Manager`](../../%5BAdmin%20System%5D%20DINOCO%20Production%20SN%20Manager) V.0.62+
- [`[Admin System] DINOCO Warranty Lifecycle Notifier`](../../%5BAdmin%20System%5D%20DINOCO%20Warranty%20Lifecycle%20Notifier) (worker + scheduler)
- [`docs/sn-system/10-go-live-gate-checklist.md`](../sn-system/10-go-live-gate-checklist.md) — original gate criteria
- [`docs/sn-system/34-phase6-backlog-tracker.md`](../sn-system/34-phase6-backlog-tracker.md) — Phase 6 status

## Audit notes

This runbook was **rewritten V.2 (2026-05-16)** after audit found V.1 referenced:
- ❌ Per-feature flags that don't exist (`dinoco_sn_flag_expiry_reminder` etc.)
- ❌ Wrong table name (`wp_dinoco_sn_notif_log` → actual `wp_dinoco_sn_notifications`)
- ❌ Wrong cron names (`*_reminder_cron` → actual `*_schedule_cron`)
- ❌ Wrong column (`warranty_expires_at` ไม่มี — ใช้ `DATE_ADD(registered_at, INTERVAL 1 YEAR)`)

V.2 corrected to actual schema + flags + cron names. Verified via grep against `[Admin System] DINOCO Production SN Manager` + `[Admin System] DINOCO Warranty Lifecycle Notifier` snippets.
