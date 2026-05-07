# 📈 LINE Quota Stress Test Plan

**Version**: 1.0 (2026-05-07)
**Boss decision (Q11)**: LINE Premium ฿1,500/mo activated 2026-05-05 R2
**Plan**: v2.13 — F#1 + F#4 + F#10 cron concurrent firing risk mitigation

---

## 🎯 Goal

Verify ระบบไม่ทำ LINE Push API quota ตันเมื่อ **3 cron พร้อมกัน fire ตอน 09:00 ICT ทุกวัน**:

- F#1 Expiry Reminder — push to plates `warranty_until` ใกล้หมด 30/14/7 วัน
- F#4 Anniversary CTA — push to plates 1 ปี/2 ปี post-activation
- F#10 Review Request — push to claims with `completed_at` 7 วันที่แล้ว

ที่ peak (สิ้นปี 1 — projected 50K active plates) อาจมีลูกค้า 2-5K คน receive push ในเวลาเดียวกัน → ต้อง batch + rate-limit เพื่อไม่ให้ LINE return 429

---

## 📊 LINE Premium tier limits

| Tier | Push messages/month | Rate limit | Cost |
|---|---|---|---|
| Free | 1,000 | 100/min | ฿0 |
| **Premium** ⭐ | **Unlimited** | **2,000/min** | **฿1,500/mo** |
| Light | 15,000 | 500/min | ฿900/mo |
| Standard | 45,000 | 1,500/min | ฿1,500/mo |

บอส paid Premium → unlimited monthly volume แต่ rate limit 2,000/min ยังบังคับใช้

---

## 🧮 Capacity math

### Worst case (Year 1 end)
- 50K active plates total
- F#1: 30/14/7 day reminders → 5% trigger any given day = 2,500
- F#4: 1y/2y anniversary → < 1% any given day = ~500
- F#10: claims completed 7 days ago → ~50/day
- **Peak concurrent push at 09:00**: ~3,050 messages

### Rate budget
- 2,000 messages/min Premium limit
- 3,050 / 2,000 = **1.5 minutes** of fully saturated push
- Without batching/staggering = quota burst → LINE 429 → message lost

### Year 3 projection
- 200K plates × 5% = 10,000 daily F#1 push
- 200K × 1% = 2,000 F#4 push
- ~12,500 / 2,000 = **6+ minutes** saturation
- **Without smart scheduler**: customer experiences delays + drops

---

## 🛠️ Batch Scheduler Design

### Architecture

```
┌─────────────────────────────────────┐
│ wp_cron @ 09:00 ICT                 │
│ - F#1 cron: enqueues 2500 jobs      │
│ - F#4 cron: enqueues 500 jobs       │
│ - F#10 cron: enqueues 50 jobs       │
└─────────────────────────────────────┘
              ↓ all writes to
┌─────────────────────────────────────┐
│ wp_dinoco_sn_push_queue (NEW)       │
│ id, sn, user_id, flex_payload_json, │
│ priority, scheduled_at, status      │
└─────────────────────────────────────┘
              ↓ consumed by
┌─────────────────────────────────────┐
│ Push worker cron (every 1 min)      │
│ - Batch size: 1500 (75% of 2000)    │
│ - Send via LINE Push API            │
│ - On 429: backoff exponential       │
│ - On success: status=sent           │
└─────────────────────────────────────┘
```

### Schema

```sql
CREATE TABLE wp_dinoco_sn_push_queue (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  feature_code VARCHAR(20) NOT NULL,  -- 'F1' | 'F4' | 'F10'
  sn VARCHAR(64) COLLATE utf8mb4_bin,
  user_id BIGINT UNSIGNED,
  line_uid VARCHAR(64),
  flex_payload_json LONGTEXT,
  priority TINYINT UNSIGNED DEFAULT 5,  -- 1=highest, 9=lowest
  scheduled_at DATETIME NOT NULL,
  status ENUM('pending','sent','failed','cancelled') DEFAULT 'pending',
  attempt_count TINYINT UNSIGNED DEFAULT 0,
  last_error VARCHAR(255),
  sent_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status_scheduled (status, scheduled_at),
  KEY idx_feature_priority (feature_code, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Priority assignment

| Feature | Priority | Reasoning |
|---|---|---|
| F#10 Review Request | 1 | claim closed yesterday — very fresh, high engagement value |
| F#1 7-day reminder | 2 | warranty about to expire — urgent CTA |
| F#1 14-day reminder | 4 | medium urgency |
| F#4 anniversary | 5 | nice-to-have, can slip 30 min |
| F#1 30-day reminder | 6 | gentle reminder |

Worker consumes queue ORDER BY priority ASC, scheduled_at ASC LIMIT 1500.

---

## 🔁 Circuit Breaker

ถ้า LINE API return 429 ติดกัน 3 ครั้ง:
1. Set wp_option `dinoco_sn_push_circuit_open=1`
2. Worker pause 5 min
3. Telegram alert ถึง tech lead
4. Auto-retry หลัง pause; ถ้า OK → reset; ถ้า fail อีก → 10 min pause + escalate

ถ้า circuit open > 1 hr → manual intervention (อาจต้อง upgrade tier หรือ reduce volume)

---

## 🧪 Stress Test Plan

### Phase A — Internal load test (pre-flip)
- Seed 5,000 fake plates `wp_dinoco_sn_pool` (warranty_until = today+30 days)
- Trigger F#1 cron manually
- Observe queue size + worker throughput
- Verify rate limit = ~1,500/min observed
- Verify no 429 from LINE

### Phase B — Production canary (post-flip T+1 wk)
- Real F#1 cron fires for first time with real customer data
- Telegram alert each batch sent
- Manual review queue depth at 09:01, 09:05, 09:10
- Sentry watches for 429 + LINE-side errors

### Phase C — Year 1 sustained test (T+90 days)
- Load test framework: simulate 10K daily push events
- Observe queue clearance time (should be < 10 min)
- Check DB connection pool not saturated

---

## 🛡️ Fallback (queue overflow)

If queue size > 50,000 pending:
1. Reduce batch size by 50% (worker becomes 750/min)
2. Telegram + Sentry alert
3. Defer F#4 (priority 5) to next 09:00 cycle
4. If still overflowing 12 hr later → suspend F#4 + F#1 30-day until cleared

---

## ✅ Acceptance Criteria

- [ ] Schema deployed via `dbDelta` lazy install
- [ ] 3 cron jobs emit to queue (not direct LINE push)
- [ ] Worker cron runs every 1 min, processes ≤ 1500 messages
- [ ] Phase A internal test passes: 5K push in < 4 min, 0 errors
- [ ] Sentry alert configured for `LINE_QUOTA_BREACH`
- [ ] Telegram alert configured for circuit-breaker trigger
- [ ] Documented in `WORKFLOW-REFERENCE.md` (queue architecture diagram)

---

## 📚 Related

- `docs/sn-system/07-boss-decisions-log.md` — Q11 LINE Premium decision
- `openclawminicrm/docs/telegram-gung-spec.md` — น้องกุ้ง alert framework
- `WORKFLOW-REFERENCE.md` — needs new "Push Queue" section

---

**Sign-off**:
- [ ] Tech Lead — schema + worker design
- [ ] บอส — accept circuit-breaker fallback (some F#4 delay possible at peak)
- [ ] On-call — alert routing confirmed
