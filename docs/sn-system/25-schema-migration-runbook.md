# 25 — SN Schema Migration Runbook

[← Back to SN system index](README.md)

**Closes**: R4 BLOCKER #2 (database-expert P0-3)
**Pairs with**: `scripts/sn-system/migrate-schema.php` · `scripts/sn-system/rollback-schema.sql`
**Related**: [12 — Phase 2 W7 deploy runbook](12-phase2-w7-deploy-runbook.md) · [15 — atomic deploy strategy](15-phase2-w7-atomic-deploy-strategy.md)

---

## Summary

Schema 1.1 → 1.2 ALTERs (uniq_dedup → uq_dedup reshape + 3 PERF indexes) on
the `wp_dinoco_sn_pool` and `wp_dinoco_sn_notifications` tables rebuild the
table on MariaDB and MySQL < 8.0.16 (no INSTANT ALTER). At 1M rows this can
lock writes for **30–60 minutes** — long enough that any admin loading the
WP backend during that window will see the page hang.

R4 audit verdict (database-expert P0-3):

> Pre-deploy WP-CLI + maintenance window 02:00-04:00 ICT OR
> pt-online-schema-change MANDATORY.

This runbook is the operating procedure for both paths.

---

## Capability matrix — which path runs which migration?

| Path | Dataset size | Lock window | When to use |
|------|--------------|-------------|-------------|
| **Web `admin_init` auto-installer** | < 100K rows | seconds | Dev, staging, fresh prod |
| **CLI `--execute` direct ALTER** | any size | minutes-hours | Maintenance window 02:00-04:00 ICT |
| **CLI `--execute --online`** (pt-osc) | any size | seconds (per chunk) | Production zero-downtime |
| **CLI `--dry-run`** | any size | none | Pre-flight, no DB writes |

The Manager's `dinoco_sn_schema_install()` already refuses to run in web
context when pool > 100K (V.0.40 — emits admin notice). This runbook covers
what to do **after** that block fires.

---

## Pre-deploy checklist (T-24h)

Complete the day before the maintenance window:

- [ ] **DBA on-call rotation confirmed** — primary + secondary contacts
      reachable via Telegram + LINE for the 2-hour window.
- [ ] **Snapshot space verified** — `df -h /var/www/html/wp-content/`
      shows ≥ 2× the current `wp_dinoco_sn_pool.ibd` size free.
- [ ] **MySQL/MariaDB version checked** — record output of `SELECT VERSION();`.
      MySQL 8.0.16+ reduces ADD COLUMN to seconds via INSTANT ALTER.
- [ ] **Buffer pool sized** — `SHOW VARIABLES LIKE 'innodb_buffer_pool_size';`
      should be ≥ 1GB on production. Smaller buffers force on-disk sort
      during ALTER and multiply duration.
- [ ] **pt-online-schema-change installed** (if `--online` chosen):
      `which pt-online-schema-change`. Install via `apt install
      percona-toolkit` if missing.
- [ ] **Dry-run executed** on staging from production replica:
      ```bash
      wp dinoco-sn migrate-schema --version=1.2 --dry-run
      ```
      Verify: zero collisions, expected ALTER plan, estimated duration.
- [ ] **Maintenance page** prepared. Customer LIFF /warranty/activate
      gracefully degrades to "ระบบกำลังปรับปรุง — กรุณาลองใหม่ภายหลัง"
      when `dinoco_sn_system_enabled=0`. Confirm flip toggle works.
- [ ] **Rollback rehearsed** — restore the most recent staging snapshot,
      apply rollback-schema.sql, verify `dinoco_sn_schema_version=1.1`.
- [ ] **Telegram alert channel** confirmed receiving heartbeats (น้องกุ้ง).
- [ ] **Boss approved window** + recorded in
      [10-go-live-gate-checklist.md](10-go-live-gate-checklist.md).

---

## Maintenance window scheduling

### Default: 02:00–04:00 ICT (UTC+7)

Why this window:

- LINE bot traffic at minimum — verified by reviewing
  `wp_dinoco_b2b_audit` hourly histogram across last 14 days.
- Factory China timezone CST (UTC+8) is also off-peak (03:00–05:00 CST).
- Dealers asleep — virtually zero `POST /b2b/v1/place-order`.

Reschedule conditions:

- Cron jobs at 03:00 (audit retention + LTV recompute) — pause via
  `wp option update dinoco_sn_cron_paused 1` for the window.
- DBA primary unavailable → reschedule, do NOT run with secondary alone
  for first migration.

### Communication

- **T-7d**: post in #dinoco-ops Telegram + LINE bot dev channel.
- **T-24h**: re-confirm window, re-confirm DBA on-call.
- **T-1h**: pause customer-facing crons, set maintenance flag.
- **T+0**: start.
- **T+window**: post-incident summary in same channels.

---

## pt-online-schema-change installation guide

### Why pt-osc?

In-place ALTER on InnoDB rebuilds the table when the operation is not
supported as INSTANT (most index changes, all UNIQUE reshapes). For 1M
rows this is single-digit minutes minimum, often longer. pt-osc creates
a shadow table, copies in chunks (default 1000 rows/chunk), keeps both
in sync via triggers, then atomically renames — write blocks reduce to
sub-second per chunk.

### Install (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install percona-toolkit
which pt-online-schema-change
# /usr/bin/pt-online-schema-change
pt-online-schema-change --version
```

### Install (CentOS/RHEL)

```bash
sudo yum install https://repo.percona.com/yum/percona-release-latest.noarch.rpm
sudo yum install percona-toolkit
```

### Permissions check

The DB user used by WP must have:

- `ALTER`, `CREATE`, `DROP`, `INDEX` on the target tables
- `CREATE`, `DROP` for the temporary `_sn_pool_new` shadow tables
- `TRIGGER` for the sync triggers
- `INSERT`, `UPDATE`, `DELETE` for the chunk copy

```sql
-- Verify:
SHOW GRANTS FOR CURRENT_USER();
-- Look for: ALTER, CREATE, DROP, INDEX, TRIGGER, INSERT, UPDATE, DELETE
```

---

## Step-by-step migration walkthrough

### Phase 1 — Pre-flight (15 min)

```bash
# 1. SSH to production
ssh dinoco@prod.dinoco.in.th

# 2. cd to WP root
cd /var/www/html/dinoco

# 3. Pull latest
git pull origin main

# 4. Run dry-run — confirms plan + collision detection
wp dinoco-sn migrate-schema --version=1.2 --dry-run
```

Expected dry-run output:

```
======================================================================
DINOCO SN Schema Migration → v1.2 (DRY-RUN mode)
======================================================================

[1/6] Pre-flight checks…
  Current: v1.1 → Target: v1.2
  Pool: 850,000 rows · Audit: 4,200,000 · Notifications: 120,000
  DB: 8.0.32 · INSTANT ALTER: YES (MySQL 8.0.16+) · Buffer pool: 4096 MB

[2/6] Detecting UNIQUE collision risks…
Success: No UNIQUE collision risks detected.

[3/6] Snapshot…
  (skipped — dry-run)

[4/6] ALTER plan:
  1) ALTER TABLE wp_dinoco_sn_notifications DROP INDEX uniq_dedup
  2) ALTER TABLE wp_dinoco_sn_notifications ADD UNIQUE KEY uq_dedup (...)
  3) ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_lookup (...)
  4) ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_status_created (...)
  5) ALTER TABLE wp_dinoco_sn_audit ADD INDEX idx_audit_sn_time (...)

Success: Dry-run complete. No DB writes performed.
```

If the dry-run reports collisions, **STOP**. Run the cleanup query in
`rollback-schema.sql` § 3b first, then re-run dry-run until clean.

### Phase 2 — Maintenance flag (1 min)

```bash
# 5. Pause customer activations + crons
wp option update dinoco_sn_cron_paused 1
wp option update dinoco_sn_maintenance_message "ระบบกำลังปรับปรุง 02:00-04:00 น."

# 6. Verify customer LIFF returns 503
curl -sI https://dinoco.in.th/warranty/activate?sn=DNCSSTEST123 | head -5
# Expect: HTTP/1.1 503 Service Unavailable
```

### Phase 3 — Snapshot (5–15 min depending on DB size)

The CLI handles this automatically as step 3/6. To preview manually:

```bash
mysqldump --single-transaction --quick --skip-lock-tables \
  -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  wp_dinoco_sn_pool wp_dinoco_sn_audit wp_dinoco_sn_notifications \
  > /var/www/html/dinoco/wp-content/dinoco-sn-snapshots/manual-pre-1.2.sql

ls -lh /var/www/html/dinoco/wp-content/dinoco-sn-snapshots/
```

### Phase 4 — Execute (Path A: in-place, MySQL 8.0.16+)

```bash
# 7. In-place ALTER (INSTANT for ADD COLUMN, fast for index ops on 8.0.16+)
wp dinoco-sn migrate-schema --version=1.2 --execute
```

Expected duration on MySQL 8.0+ with 1M rows:

- DROP INDEX uniq_dedup: ~5s
- ADD UNIQUE uq_dedup: 30-90s (rebuilds index)
- ADD INDEX idx_lookup: 30-60s
- ADD INDEX idx_status_created: 30-60s
- ADD INDEX idx_audit_sn_time: 60-120s (audit table is largest)

**Total: 3–6 min**

### Phase 4 — Execute (Path B: pt-online-schema-change)

```bash
# 7. Online migration — slower wall-clock but no extended write blocks
wp dinoco-sn migrate-schema --version=1.2 --execute --online
```

Expected duration on MariaDB or MySQL < 8.0.16 with 1M rows:

- 5–15 min wall clock
- Each chunk: < 100ms write block
- Replication lag: monitored, will pause if > 1s on replica

### Phase 5 — Verify (2 min)

The CLI runs verification automatically as step 6/6. Manual checks:

```bash
# 8. Confirm version flag flipped
wp option get dinoco_sn_schema_version
# Expect: 1.2

# 9. Confirm new indexes
wp db query "SHOW INDEX FROM wp_dinoco_sn_pool WHERE Key_name IN ('idx_lookup', 'idx_status_created')"
# Expect: 2+ rows

wp db query "SHOW INDEX FROM wp_dinoco_sn_audit WHERE Key_name = 'idx_audit_sn_time'"
# Expect: 2 rows (sn + created_at)

# 10. Confirm legacy uniq_dedup gone
wp db query "SHOW INDEX FROM wp_dinoco_sn_notifications WHERE Key_name = 'uniq_dedup'"
# Expect: 0 rows

# 11. Confirm new uq_dedup present
wp db query "SHOW INDEX FROM wp_dinoco_sn_notifications WHERE Key_name = 'uq_dedup'"
# Expect: 4 rows (notification_type, user_id, sn, scheduled_at)
```

### Phase 6 — Smoke test (5 min)

```bash
# 12. Fastest-path REST endpoint smoke
curl -s "https://dinoco.in.th/wp-json/dinoco-sn/v1/version"
# Expect: { "schema_version": "1.2", "manager_version": "V.0.43" }

# 13. Lookup a known plate (read-only — safe)
curl -s "https://dinoco.in.th/wp-json/dinoco-sn/v1/lookup/DNCSSTEST123"

# 14. Insert a test notification (writes — confirm UNIQUE works)
wp eval '
$wpdb = $GLOBALS["wpdb"];
$wpdb->insert("wp_dinoco_sn_notifications", [
  "notification_type" => "smoke_test",
  "user_id" => 1,
  "sn" => "DNCSSSMOKE01",
  "scheduled_at" => current_time("mysql"),
  "status" => "pending",
]);
echo $wpdb->insert_id;
'

# 15. Try inserting duplicate — must fail with UNIQUE violation
wp eval '
$wpdb = $GLOBALS["wpdb"];
$ok = $wpdb->insert("wp_dinoco_sn_notifications", [
  "notification_type" => "smoke_test",
  "user_id" => 1,
  "sn" => "DNCSSSMOKE01",
  "scheduled_at" => current_time("mysql"),  // Same scheduled_at — should collide
  "status" => "pending",
]);
echo $ok === false ? "OK: UNIQUE blocked duplicate" : "FAIL: duplicate was inserted";
'
# Expect: OK: UNIQUE blocked duplicate

# 16. Cleanup smoke test rows
wp db query "DELETE FROM wp_dinoco_sn_notifications WHERE notification_type = 'smoke_test'"
```

### Phase 7 — Resume operations (1 min)

```bash
# 17. Re-enable crons + clear maintenance message
wp option update dinoco_sn_cron_paused 0
wp option delete dinoco_sn_maintenance_message

# 18. Verify customer LIFF responsive
curl -sI https://dinoco.in.th/warranty/activate?sn=DNCSSTEST123 | head -5
# Expect: HTTP/1.1 200 OK (or proper error if SN doesn't exist)
```

### Phase 8 — Post-window monitoring (24h)

- Watch Telegram alerts for `sn_schema_install_*` exceptions.
- Sentry dashboard: filter by `context = sn_schema_install` — should be empty.
- Query plan check: pick 5 hot REST endpoints (lookup, member-plates, audit-search)
  and `EXPLAIN` their main queries — verify new indexes are used (`Using index`).

---

## Rollback procedure

### When to roll back

- Phase 5 verification reports failures.
- Phase 6 smoke test fails (UNIQUE not enforced, lookup returns wrong rows).
- Post-window monitoring (Phase 8) shows errors > 5/min for > 10 min.

### Path A: snapshot restore (preferred — atomic)

```bash
# 1. Pause crons + maintenance message (re-enable from Phase 2)
wp option update dinoco_sn_cron_paused 1

# 2. Restore from snapshot (5-15 min depending on size)
SNAPSHOT=/var/www/html/dinoco/wp-content/dinoco-sn-snapshots/pre-1.2-YYYYMMDDHHMMSS.sql
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SNAPSHOT"

# 3. Reset version flag
wp option update dinoco_sn_schema_version 1.1

# 4. Resume
wp option update dinoco_sn_cron_paused 0
```

### Path B: manual DDL rollback

If snapshot restore is not possible (snapshot too large to fit, or partial
data loss must be preserved), apply `rollback-schema.sql`:

```bash
# 1. Pause
wp option update dinoco_sn_cron_paused 1

# 2. Apply rollback DDL
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < /var/www/html/dinoco/scripts/sn-system/rollback-schema.sql

# 3. Verify rollback
wp db query "SHOW INDEX FROM wp_dinoco_sn_notifications WHERE Key_name IN ('uniq_dedup', 'uq_dedup')"
# Expect: uniq_dedup present (3 rows), uq_dedup absent (0 rows)

# 4. Resume
wp option update dinoco_sn_cron_paused 0
```

---

## Common issues + troubleshooting

### Issue: `ERROR 1062 (23000): Duplicate entry`

**Cause**: Existing rows violate the new uq_dedup UNIQUE constraint
(scheduled_at column was previously NULL, now non-NULL with same other
columns).

**Resolution**: dry-run reports collisions in step 2/6. Run cleanup:

```sql
-- Preview collisions
SELECT notification_type, user_id, sn, scheduled_at, COUNT(*) c
  FROM wp_dinoco_sn_notifications
  GROUP BY notification_type, user_id, sn, scheduled_at HAVING c > 1
  LIMIT 50;

-- Cleanup (keep newest, delete older)
DELETE n1 FROM wp_dinoco_sn_notifications n1
INNER JOIN wp_dinoco_sn_notifications n2
  WHERE n1.id < n2.id
    AND n1.notification_type = n2.notification_type
    AND n1.user_id = n2.user_id
    AND n1.sn = n2.sn
    AND COALESCE(n1.scheduled_at, '1900-01-01') = COALESCE(n2.scheduled_at, '1900-01-01');
```

Then re-run dry-run. Repeat until clean.

### Issue: pt-online-schema-change "Cannot connect to MySQL"

**Cause**: pt-osc opens its own MySQL connection. wp-config.php DB_HOST may
be a Unix socket path that pt-osc can't parse.

**Resolution**: pass `h=127.0.0.1,P=3306` explicitly to the CLI script via
custom socket override (edit `pt_online_schema_change()` in
`migrate-schema.php` if your environment uses sockets).

### Issue: `ERROR 1071 (42000): Specified key was too long`

**Cause**: utf8mb4 columns + index width > 767 bytes (old InnoDB
DYNAMIC row format limit).

**Resolution**: ensure target tables use ROW_FORMAT=DYNAMIC and
`innodb_large_prefix=ON`. Pre-existing tables likely already do — if not:

```sql
ALTER TABLE wp_dinoco_sn_pool ROW_FORMAT=DYNAMIC;
```

### Issue: ALTER hung > expected duration

**Symptoms**: process running > 2× the dry-run estimate.

**Resolution**:

```sql
-- Find the running ALTER
SHOW PROCESSLIST;

-- If safe to abort (no triggers running, no replication lag concerns):
KILL <connection_id>;

-- Then resume via pt-osc which is interruptible:
wp dinoco-sn migrate-schema --version=1.2 --execute --online
```

### Issue: snapshot fails — disk full

**Resolution**: snapshot is taken before any ALTER, so if it fails, no harm
done. Free space (`du -sh wp-content/dinoco-sn-snapshots/*` to find old
snapshots → delete after 30 days), then re-run with `--execute`.

### Issue: post-migration LIFF activate returns 500

**Cause**: Manager `dinoco_sn_install_schema()` may try to ALTER again at
the next admin_init because the lock file or version flag wasn't updated.

**Resolution**:

```bash
wp option get dinoco_sn_schema_version  # Verify '1.2'
# If wrong, set manually:
wp option update dinoco_sn_schema_version 1.2

# Clear admin-notice flags (V.0.40 skip path)
wp option delete dinoco_sn_schema_alter_blocked_at
wp option delete dinoco_sn_schema_alter_blocked_rowcount
```

---

## Post-migration smoke tests

Run all 16 checks listed in **Phase 6** above. If any fail, follow
rollback procedure.

Additional sanity SQL:

```sql
-- 1. Index usage on hot path
EXPLAIN SELECT sn, status FROM wp_dinoco_sn_pool
 WHERE linked_sku = 'DNCSETNX500EIRNB' AND status = 'in_pool'
 ORDER BY registered_at DESC LIMIT 100;
-- Expect: key = idx_lookup, type = ref, Extra = Using where; Using index

-- 2. Audit lookup uses idx_audit_sn_time
EXPLAIN SELECT * FROM wp_dinoco_sn_audit
 WHERE sn = 'DNCSSDEMO01' ORDER BY created_at DESC LIMIT 20;
-- Expect: key = idx_audit_sn_time

-- 3. Row count sanity (should match pre-migration ± few seconds of activity)
SELECT (SELECT COUNT(*) FROM wp_dinoco_sn_pool) AS pool,
       (SELECT COUNT(*) FROM wp_dinoco_sn_audit) AS audit,
       (SELECT COUNT(*) FROM wp_dinoco_sn_notifications) AS notif;
```

---

## Appendix: estimated migration duration table

| Pool rows | MySQL 8.0.16+ direct | MariaDB / MySQL 5.7 direct | pt-osc |
|-----------|----------------------|------------------------------|--------|
| 10K       | < 5s                 | ~30s                         | ~1m    |
| 100K      | ~30s                 | ~5m                          | ~2m    |
| 500K      | ~2m                  | ~30m                         | ~8m    |
| 1M        | ~5m                  | ~60m                         | ~15m   |
| 5M        | ~25m                 | ~6h                          | ~75m   |

Heuristic only — actual depends on buffer pool size, disk IOPS, write
load on other tables, replication lag.

---

## Sign-off checklist

After successful migration:

- [ ] Phase 5 verification: ALL indexes present + ALL legacy indexes gone
- [ ] Phase 6 smoke: 16/16 checks passed
- [ ] Phase 7 resume: customer LIFF returns 200
- [ ] Phase 8 monitoring: 24h Sentry/Telegram clean
- [ ] Update `[Admin System] DINOCO Production SN Manager` schema version
      flag in CLAUDE.md "Production S/N Management System" entry
- [ ] Append to `docs/sn-system/07-boss-decisions-log.md` (date, version,
      DBA primary on duty, total duration)
- [ ] Notify channels: post completion summary
