[← back to runbooks/](./)

# Week-Long Sprint Deploy Plan (2026-04-29)

**Status**: Days 2-4 production deploys requiring user confirmation
**Owner**: User (boss) — assistant prepared all artifacts + verification queries
**Prerequisite**: Day 1 changes deployed via webhook (commits `357852a`, `ae60b47`, etc. — already pushed)

## Sprint Summary

หลัง Flash V.42 deep audit จบ + Day 1 quick wins commits → ระบบ stable. Days 2-5:

| Day | Work | Risk | User action |
|---|---|---|---|
| 2 | Sentry activation | LOW (additive) | composer install + flag flip |
| 3 | B2F CPT final drop | DESTRUCTIVE | observation verify + DROP TABLE |
| 4 | Vite LIFF migration | MEDIUM (UX impact) | staging QA + canary flag flip |
| 5 | GDPR Phase 6 design | NONE | review draft, decide scope |

**Day 5 = `docs/compliance/GDPR-PHASE-6-DESIGN.md`** (already drafted by assistant — review + decide ฯ้on scope before implementation begins)

---

## Day 2: Sentry Activation

### Pre-flight verification

```bash
# 1. Confirm snippet ready
wp eval 'echo function_exists("dinoco_obs_init_sentry") ? "OK\n" : "MISSING\n";'
# Expected: OK (V.1.1+ from Phase 5)

# 2. Check current flag state
wp option get dinoco_obs_sentry_enabled
wp option get dinoco_obs_correlation_enabled
wp option get dinoco_obs_structured_log
# Expected: 0, 0, 0 (all OFF)

# 3. Verify Sentry SDK NOT yet installed
ls -la /path/to/wp/composer.json
grep -i "sentry" /path/to/wp/composer.json
# Expected: no sentry/sentry entry yet
```

### Activation steps

```bash
# Step 1: Install Sentry PHP SDK
cd /path/to/wp
composer require sentry/sentry

# Step 2: Add DSN to wp-config.php
# Get DSN from Sentry account: https://sentry.io/settings/{org}/projects/{project}/keys/
echo "define('DINOCO_SENTRY_DSN', 'https://...@sentry.io/...');" >> wp-config.php
echo "define('DINOCO_SENTRY_ENV', 'production');" >> wp-config.php
echo "define('DINOCO_SENTRY_SAMPLE_RATE', '0.1');" >> wp-config.php

# Step 3: Activate flags (Sentry only first — leave correlation + structured for week 2)
wp option update dinoco_obs_sentry_enabled '1'

# Step 4: Test by triggering a known error
wp eval 'try { throw new Exception("[GAS-TEST] Sentry activation smoke"); } catch (\Throwable $e) { dinoco_obs_capture($e, ["env" => "test"]); }'
# Verify event arrives in Sentry within 30s

# Step 5: Monitor for 24h
# Watch Sentry dashboard for noise spike — should be < 100 events/day baseline.
# If spike — disable: wp option update dinoco_obs_sentry_enabled '0'
```

### OpenClaw proxy Sentry (parallel — separate process)

```bash
# Step 1: Add Sentry to OpenClaw npm
cd /path/to/openclawminicrm/proxy
npm install @sentry/node

# Step 2: Add SENTRY_DSN to .env (same DSN or separate project)
echo "SENTRY_DSN=https://...@sentry.io/..." >> .env

# Step 3: Restart proxy (Docker or systemd)
docker compose -f docker-compose.prod.yml restart agent
# OR
sudo systemctl restart openclaw-agent

# Step 4: Test
curl -X POST https://agent.dinoco.in.th/api/sentry-test
# Should appear in Sentry dashboard
```

### Rollback

```bash
wp option update dinoco_obs_sentry_enabled '0'
# Snippet defensively checks flag before init — instant revert.
# composer remove sentry/sentry  (only if confirmed not needed)
```

### Expected outcome

- WP errors auto-flow to Sentry (with PII redaction via `dinoco_obs_redact_context()`)
- OpenClaw proxy errors flow to same project (cross-stack correlation)
- 0.1 sample rate = ~100MB/month Sentry quota (free tier compatible)

---

## Day 3: B2F CPT Final Drop

### Context

Phase 4 of Option F migration EXECUTED 2026-04-18 (121 rows migrated to junction). Today = 2026-04-29 = **day 11/14** of observation window.

**Wait until 2026-05-02 (day 14)** before executing this — keep monitoring observations table drift rate first.

### Pre-flight verification

```sql
-- 1. Verify observation period meets criteria
SELECT
  DATEDIFF(NOW(), MIN(observed_at)) AS days_observed,
  COUNT(*) AS total_obs,
  SUM(diff_detected) AS total_diffs,
  ROUND(SUM(diff_detected) / COUNT(*) * 100, 4) AS diff_rate_pct
FROM wp_dinoco_maker_product_observations
WHERE observed_at > '2026-04-18';
-- Expected: days_observed >= 14, diff_rate_pct < 0.1%

-- 2. Verify junction table is read source (not CPT)
SELECT option_value FROM wp_options WHERE option_name = 'b2f_flag_read_from_junction';
-- Expected: '1' or true

-- 3. Verify zero CPT-only readers in last 24h (no fallback fires)
SELECT source, COUNT(*) FROM wp_dinoco_maker_product_observations
WHERE observed_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY source;
-- Expected: junction-dominant, very few/zero cpt source rows

-- 4. Backup CPT table BEFORE drop
mysqldump -u root -p wordpress_db wp_posts \
  --where="post_type='b2f_maker_product'" > /backup/b2f_maker_product_$(date +%Y%m%d).sql
mysqldump -u root -p wordpress_db wp_postmeta \
  --where="post_id IN (SELECT ID FROM wp_posts WHERE post_type='b2f_maker_product')" \
  > /backup/b2f_maker_product_meta_$(date +%Y%m%d).sql
ls -la /backup/b2f_maker_product_*.sql
# Expected: 2 files, sizes > 0

# 5. Audit final junction count vs original CPT
mysql> SELECT COUNT(*) FROM wp_posts WHERE post_type='b2f_maker_product' AND post_status='publish';
# Note count
mysql> SELECT COUNT(*) FROM wp_dinoco_product_makers WHERE deleted_at IS NULL;
# Expected: ≥ original CPT count (orphans were added during backfill)
```

### Drop steps (DESTRUCTIVE — execute only after all verifications pass)

```sql
-- Phase A: Trash CPT posts (reversible — undo via wp post untrash)
UPDATE wp_posts SET post_status = 'trash'
WHERE post_type = 'b2f_maker_product' AND post_status = 'publish';
-- 24-72h soak: verify no admin tools error, no LIFF read failures

-- Phase B: Permanently delete (irreversible — backup must exist)
DELETE FROM wp_postmeta
WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type='b2f_maker_product');
DELETE FROM wp_posts WHERE post_type='b2f_maker_product';

-- Phase C: Verify cleanup + index health
mysql> ANALYZE TABLE wp_posts, wp_postmeta;
mysql> SELECT index_name, cardinality FROM information_schema.statistics
       WHERE table_name = 'wp_posts' AND table_schema = DATABASE();
```

### Post-drop verification

```bash
# 1. Smoke test admin Makers tab
# Navigate to /b2f-admin → Makers → confirm products list renders
# (reads junction now, no CPT fallback)

# 2. Smoke test LIFF E-Catalog
# Open LIFF B2F catalog as known maker → verify SETs + products visible

# 3. Check for "ghost" CPT readers (any error logs)
tail -100 wp-content/debug.log | grep -i "b2f_maker_product"
# Expected: empty (no code path expects CPT anymore)
```

### Rollback (if soak phase reveals issue)

```bash
# From backup created in pre-flight step 4
mysql -u root -p wordpress_db < /backup/b2f_maker_product_2026-XX-XX.sql
mysql -u root -p wordpress_db < /backup/b2f_maker_product_meta_2026-XX-XX.sql

# Then re-flag CPT-first read mode
wp option update b2f_flag_read_from_junction '0'
```

---

## Day 4: Vite LIFF Production Migration

### Foundation status (verified)

```
dist/liff/
├── b2b-catalog.rz6-oO8J.js  + .map
├── b2f-catalog.B-_dyOXH.js  + .map
├── b2f-maker.B0CJRU4C.js    + .map
└── liff-ai.Cp_q31vg.js      + .map
```

4 entrypoints built. E2E tests pass (Phase 7 V.0.5). Manifest emit committed in `546c1f1`.

### Staging flip first

```bash
# Step 1: Identify staging WP install (likely staging.dinoco.in.th or local Docker)
# Step 2: Activate Vite mode for staging only
wp option update dinoco_liff_use_vite_b2b 'true' --url=staging.dinoco.in.th
wp option update dinoco_liff_use_vite_b2f 'true' --url=staging.dinoco.in.th

# Step 3: Manual smoke test
# Open https://staging.dinoco.in.th/b2b-catalog/ in iOS Safari + Android Chrome
# Verify:
#   - LIFF init succeeds
#   - Catalog loads (network tab shows .js bundle from /dist/liff/)
#   - Cart works (add → submit)
#   - No console errors

# Step 4: Run E2E test against staging
cd /path/to/repo
PLAYWRIGHT_BASE_URL=https://staging.dinoco.in.th npm run test:e2e:smoke
# Expected: 22 tests × 4 browsers = 88 runs pass
```

### Production canary (10% → 100%)

```bash
# Step 1: Enable for 10% of distributors first (LIFF AI canary already implements this pattern)
wp option update dinoco_liff_use_vite_b2b 'canary'
wp option update dinoco_liff_canary_distributors '1,5,12,17,22'  # 5 trusted distributors

# Step 2: Monitor for 24h
# - Sentry errors in liff-* prefix
# - LIFF audit log (sessions started + completed)
# - User-reported issues via support@dinoco.in.th

# Step 3: If clean, expand to 50%
# Step 4: If clean for another 24h, expand to 100% (= 'true')
wp option update dinoco_liff_use_vite_b2b 'true'

# Step 5: Monitor 7-day budget — bundle hash should stay stable, no 404s on dist/ paths
```

### Rollback

```bash
wp option update dinoco_liff_use_vite_b2b 'false'
# Snippet 4 falls back to inline render (V.32.x path).
# No regression because inline path is preserved (REG-029 byte-identical guarantee).
```

### Expected outcome

- B2B LIFF page weight: 155KB inline → ~3.5KB shell + ~50KB cached bundle
- TTI improvement: ~800ms → ~300ms (Phase 7 V.0.4 mobile-safari benchmark)
- Bundle reuse across distributors → CDN cache hit rate ~95%

---

## Day 5: GDPR Phase 6 Design Review

**Already drafted**: `docs/compliance/GDPR-PHASE-6-DESIGN.md`

### Action items

1. Read draft → flag any decisions to revise
2. Send to legal counsel for §17 retention vs PDPA §31 portability conflicts review
3. Decide on **7 open questions** at end of design doc (tax retention / warranty preservation / etc.)
4. Schedule Phase 6.1 implementation (worker + queue) — estimated 1.5 days dev

**No code changes today** — design phase only.

---

## Verification Schedule (post all 4 days)

| Day | Time | Check | Pass criteria |
|---|---|---|---|
| Day 2 +24h | next day | Sentry event count | < 200 events / day |
| Day 3 +72h | day 6 | LIFF + Admin smoke | 0 errors, all flows work |
| Day 4 +24h | day 5 | Sentry liff-* errors | 0 net new errors vs baseline |
| Day 4 +7d | day 12 | Bundle hit rate | > 90% CDN cache hit |
| Day 5 | external | Legal counsel response | sign-off on scope |

## Emergency Rollback Quick-Reference

| Issue | Command |
|---|---|
| Sentry noise/spam | `wp option update dinoco_obs_sentry_enabled '0'` |
| CPT drop broke Admin | restore backup + `wp option update b2f_flag_read_from_junction '0'` |
| Vite breaks on iOS | `wp option update dinoco_liff_use_vite_b2b 'false'` |
| All Phase 5 toggles | each independent — no cross-dependency |

## Contacts

- Code review issues: `code-reviewer` agent
- Sentry tuning: `[Admin System] DINOCO Observability` snippet header
- B2F audit: `[Admin System] B2F Migration Audit` snippet
- Legal/Compliance: TBD external counsel
