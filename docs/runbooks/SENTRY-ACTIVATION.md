# Sentry Activation Runbook

**Status**: Scaffold deployed (Observability V.1.0) — flags default OFF, zero behavior change until activated.

**Use this runbook when ready to turn on error monitoring in production.**

---

## Prerequisites

1. Sentry account + project (free tier: 5K events/month)
   - Sign up: https://sentry.io/signup/
   - Create project → pick "PHP" + "Node.js"
   - Copy DSN strings (one per project)

2. SSH access to production servers:
   - WordPress host (for `composer require`)
   - Hetzner VPS 5.223.95.236 (for OpenClaw `npm install`)

---

## Part A — WordPress Sentry Setup

### Step 1 — Install Sentry PHP SDK

```bash
# SSH to WP host → composer require in WP root
cd /path/to/wordpress
composer require sentry/sentry:^4.0
```

### Step 2 — Add DSN to wp-config.php

```php
// Add near other DINOCO_* constants
define( 'DINOCO_SENTRY_DSN', 'https://xxxxx@xxxx.ingest.sentry.io/PROJECT_ID' );
define( 'DINOCO_SENTRY_ENV', 'production' );
define( 'DINOCO_SENTRY_SAMPLE_RATE', '0.1' ); // 10% sample
```

### Step 3 — Flip flag ON (via phpMyAdmin / SQL)

```sql
-- Enable Sentry error capture
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_obs_sentry_enabled', '1', 'yes')
ON DUPLICATE KEY UPDATE option_value = '1';

-- Enable correlation ID in REST responses
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_obs_correlation_enabled', '1', 'yes')
ON DUPLICATE KEY UPDATE option_value = '1';

-- Enable JSON structured log (optional)
INSERT INTO wp_options (option_name, option_value, autoload)
VALUES ('dinoco_obs_structured_log', '1', 'yes')
ON DUPLICATE KEY UPDATE option_value = '1';
```

### Step 4 — Verify

- Trigger test error: visit `wp-admin` → intentional action that throws → check Sentry dashboard for event
- Or add one-time `error_log('[Obs test] ' . uniqid());` somewhere → tail WP debug log → confirm structured JSON format

### Rollback

```sql
UPDATE wp_options SET option_value = '0' WHERE option_name = 'dinoco_obs_sentry_enabled';
```

---

## Part B — OpenClaw Sentry Setup

### Step 1 — Install Node SDK

```bash
ssh root@5.223.95.236
cd /opt/dinoco/openclawminicrm/proxy
npm install @sentry/node
```

### Step 2 — Add env vars to `.env` (production)

```bash
cd /opt/dinoco/openclawminicrm
nano .env
# Add:
SENTRY_DSN=https://yyyyy@yyyy.ingest.sentry.io/NODE_PROJECT_ID
SENTRY_ENV=production
SENTRY_SAMPLE_RATE=0.1
```

### Step 3 — Rebuild + restart

```bash
docker compose -f docker-compose.prod.yml up -d --build agent
sleep 5
docker logs smltrack-agent --tail 20
# Should see: [Obs] Sentry initialized
```

### Step 4 — Verify

Trigger error via chatbot test (e.g., send malformed webhook) → check Sentry dashboard

### Rollback

```bash
# Remove SENTRY_DSN from .env + restart
docker compose -f docker-compose.prod.yml restart agent
# defensive check: if (process.env.SENTRY_DSN) → skipped when empty
```

---

## Monitoring checklist (first 7 days after activation)

- Daily: check Sentry events volume — should spike briefly then stabilize
- Week 1: review top 10 issues → decide fix priority
- Week 2: tune `SAMPLE_RATE` up/down based on budget vs signal
- Set up Sentry alerts → Telegram / email for critical errors

---

## Budget

- **Free tier**: 5,000 events/month per project → suitable for canary
- **Team tier** ($26/mo): 100K events/month
- Event volume depends on `SAMPLE_RATE` + actual error rate

For DINOCO expected traffic: `SAMPLE_RATE=0.1` (10%) should stay well under 5K/month free tier

---

## Files reference

- `[Admin System] DINOCO Observability` V.1.0 — WP Sentry wrapper
- `openclawminicrm/proxy/index.js` V.2.1 — Node Sentry init (defensive require)
- `.env.example` lines 51-58 — WP env vars reference
- `openclawminicrm/.env.example` — Node env vars reference
