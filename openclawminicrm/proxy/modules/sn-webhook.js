/**
 * sn-webhook.js — WP→Agent webhook listener for sn_pool state changes
 * V.1.1 — R4 HIGH-2 fix: Redis-backed sliding window rate limit for multi-worker
 *         scaling. In-process Map sliding window (V.1.0) leaked counters across
 *         PM2 cluster workers — N workers = N×RATE_LIMIT_MAX effective cap. Now
 *         uses ioredis INCR + EXPIRE atomic counter with graceful degradation
 *         to in-process when Redis unavailable.
 * V.1.0 — Phase 4 W14.5 Round 3 (chatbot-rules.md §15.10 / §15.14.4 / R3 Gap 1):
 *         Promoted from W14.5 → W6 NOW (R3 BLOCKER).
 *         Endpoint: POST /webhook/sn-event
 *           - Auth: bearer token LIFF_AI_AGENT_KEY (env)
 *           - Payload: { sn, old_status, new_status, ts, source }
 *           - Action: invalidateSnCache(sn) + log MongoDB sn_event_log
 *         Rate limit: 1000/min (cache invalidation = high-volume read-side mutation, OK to be loose)
 *         Defensive: try/catch every step, never break agent (returns success even on partial failure
 *                    so WP doesn't retry-storm).
 *
 * WP integration spec (Agent A — separate task):
 *   1. Existing WP snippets fire `do_action('dinoco_sn_pool_status_changed', $sn, $old, $new)`
 *   2. NEW WP listener (in MCP Bridge V.3.1 or dedicated [System] DINOCO SN Webhook Forwarder):
 *      - Hook into `dinoco_sn_pool_status_changed` action
 *      - Build payload: { sn, old_status, new_status, ts: gmdate('c'), source: 'wp' }
 *      - POST to OPENCLAW_AGENT_URL + '/webhook/sn-event' with Authorization: Bearer LIFF_AI_AGENT_KEY
 *      - Async / fire-and-forget (don't block sn_pool transaction)
 *      - 5s timeout; failure → log + 1 retry; never throw
 *
 * Backward compat: cache invalidation falls back to 60s TTL (§15.14.4) if webhook missed.
 */

const { invalidateSnCache, invalidateAllSnCache, getCachedSnLookup } = require("./dinoco-cache");

// ============================================================================
// V.1.1 R4 HIGH-2 — Redis-backed rate limit (multi-worker scaling)
// ============================================================================
// 1000 requests/min global cap, atomic via Redis INCR + EXPIRE. Falls back to
// in-process sliding window if Redis unavailable (graceful degradation —
// cluster cap becomes per-worker × N, but webhook still functional).
//
// Cache invalidation events are high-volume (each plate state flip fires one)
// — budget allows ~16 events/sec which is well above realistic peak (large
// recall batch ≈ 100-500 plates/run, throttled WP-side by
// `wp_schedule_single_event`).
const RATE_LIMIT_MAX = 1000;
const RATE_LIMIT_WINDOW_SEC = 60;

// Try optional Redis client (ioredis). Fall back to Map-based in-process window
// when Redis driver unavailable or connection fails.
let _redisClient = null;
let _redisInitTried = false;
function _initRedis() {
  if (_redisInitTried) return _redisClient;
  _redisInitTried = true;
  try {
    // eslint-disable-next-line global-require
    const Redis = require("ioredis");
    _redisClient = new Redis({
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      // Defensive: 1 retry, fail fast — falls back to in-process if down.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    _redisClient.on("error", (err) => {
      // Don't spam — log once per minute window worth of errors
      if (!_redisClient._lastErrorLog || Date.now() - _redisClient._lastErrorLog > 60000) {
        console.warn("[SN-Webhook] Redis error (falling back to in-process RL):", err.message);
        _redisClient._lastErrorLog = Date.now();
      }
    });
    // Trigger lazy connect (async — failures handled via error event above).
    _redisClient.connect().catch(() => {
      /* fallback to in-process — no-op */
    });
    console.log("[SN-Webhook] Redis client initialized for rate limiting");
  } catch (e) {
    console.warn("[SN-Webhook] ioredis not installed — using in-process rate limit:", e.message);
    _redisClient = null;
  }
  return _redisClient;
}

// In-process fallback (per-instance — same as V.1.0 behavior).
let rateLimitWindowStart = Date.now();
let rateLimitCount = 0;
function _inProcessRateLimit() {
  const now = Date.now();
  if (now - rateLimitWindowStart >= RATE_LIMIT_WINDOW_SEC * 1000) {
    rateLimitWindowStart = now;
    rateLimitCount = 0;
  }
  rateLimitCount++;
  return { allowed: rateLimitCount <= RATE_LIMIT_MAX, count: rateLimitCount, source: "in-process" };
}

/**
 * Async rate-limit check — Redis preferred, in-process fallback.
 *
 * Window key bucket: `sn-webhook:rl:<floor(epoch_sec/60)>` — sliding 60s with
 * minute-aligned reset (acceptable approximation for high-volume cache-bust
 * events; tighter sliding window not required for invalidation traffic).
 *
 * @returns {Promise<{allowed: boolean, count: number, source: string}>}
 */
async function _checkRateLimit() {
  const redis = _initRedis();
  if (redis && redis.status === "ready") {
    try {
      const bucket = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SEC);
      const key = `sn-webhook:rl:${bucket}`;
      const count = await redis.incr(key);
      if (count === 1) {
        // First hit in window → set TTL (slightly > window to handle clock skew).
        await redis.expire(key, RATE_LIMIT_WINDOW_SEC + 5);
      }
      return { allowed: count <= RATE_LIMIT_MAX, count, source: "redis" };
    } catch (e) {
      // Redis transient failure → fall through to in-process.
      console.warn("[SN-Webhook] Redis RL check failed, falling back:", e.message);
    }
  }
  return _inProcessRateLimit();
}

// ============================================================================
// Auth helper — bearer token comparison (timing-safe)
// ============================================================================
const crypto = require("crypto");

function _verifyBearer(headerVal) {
  if (!headerVal || typeof headerVal !== "string") return false;
  const m = headerVal.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const expected = process.env.LIFF_AI_AGENT_KEY || "";
  if (!expected) {
    console.warn("[SN-Webhook] LIFF_AI_AGENT_KEY env not set — refusing all requests");
    return false;
  }
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

// ============================================================================
// Payload validation
// ============================================================================
function _validatePayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "missing_body" };
  }
  const { sn, old_status, new_status } = body;
  if (!sn || typeof sn !== "string") {
    return { ok: false, reason: "missing_sn" };
  }
  // sn format soft check (don't reject malformed — backend is authoritative).
  // Just bound the length to prevent log injection / pathological keys.
  if (sn.length < 4 || sn.length > 64) {
    return { ok: false, reason: "sn_length_out_of_range" };
  }
  if (!new_status || typeof new_status !== "string" || new_status.length > 32) {
    return { ok: false, reason: "missing_or_bad_new_status" };
  }
  if (old_status && (typeof old_status !== "string" || old_status.length > 32)) {
    return { ok: false, reason: "bad_old_status" };
  }
  return { ok: true };
}

// ============================================================================
// MongoDB log helper (best-effort — never throws)
// ============================================================================
let _getDB = null;
function init(deps) {
  if (deps && typeof deps.getDB === "function") {
    _getDB = deps.getDB;
  }
}

async function _logEvent(payload, result) {
  if (!_getDB) return;
  try {
    const db = await _getDB();
    if (!db) return;
    await db.collection("sn_event_log").insertOne({
      sn: payload.sn,
      old_status: payload.old_status || null,
      new_status: payload.new_status,
      source: payload.source || "wp",
      ts: payload.ts ? new Date(payload.ts) : new Date(),
      received_at: new Date(),
      invalidated: result.invalidated || [],
      cache_existed: result.cache_existed || false,
    });
  } catch (e) {
    // best-effort — never break webhook
    console.error("[SN-Webhook] log error:", e.message);
  }
}

// ============================================================================
// Express handler — POST /webhook/sn-event
// ============================================================================
async function handleSnEvent(req, res) {
  // Step 1: rate limit (returns 429 — WP can throttle / queue).
  // V.1.1 — async (Redis-backed) with in-process fallback. Never breaks on
  // RL check failure — log + treat as allowed (degrade open).
  try {
    const rl = await _checkRateLimit();
    if (!rl.allowed) {
      console.warn(
        `[SN-Webhook] rate limit exceeded (cap=${RATE_LIMIT_MAX}/${RATE_LIMIT_WINDOW_SEC}s, count=${rl.count}, src=${rl.source})`
      );
      return res
        .status(429)
        .set("X-RateLimit-Source", rl.source)
        .json({ success: false, error: "rate_limited", count: rl.count });
    }
  } catch (e) {
    // never break on rate limit logic itself
    console.error("[SN-Webhook] rate limit check error:", e.message);
  }

  // Step 2: bearer auth
  let authed = false;
  try {
    authed = _verifyBearer(req.headers && req.headers.authorization);
  } catch (e) {
    console.error("[SN-Webhook] auth error:", e.message);
  }
  if (!authed) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  // Step 3: payload validation
  const body = req.body || {};
  const valid = _validatePayload(body);
  if (!valid.ok) {
    console.warn("[SN-Webhook] invalid payload:", valid.reason);
    return res.status(400).json({ success: false, error: "invalid_payload", reason: valid.reason });
  }

  // Step 4: cache bust (the actual work — defensive try/catch)
  const result = { invalidated: [], cache_existed: false };
  try {
    const had = invalidateSnCache(body.sn);
    result.cache_existed = had;
    result.invalidated.push("warranty_check");
    result.invalidated.push("sn_lookup");
  } catch (e) {
    console.error("[SN-Webhook] invalidate error:", e.message);
    // Don't return 500 — agent must always respond OK so WP doesn't retry-storm.
    // The 60s TTL is the safety net per §15.14.4.
  }

  // Step 5: MongoDB log (fire-and-forget, never blocks response)
  _logEvent(body, result).catch(() => {});

  // Step 6: respond
  return res.json({
    success: true,
    invalidated: result.invalidated,
    cache_existed: result.cache_existed,
  });
}

// ============================================================================
// Express route registration helper — used by index.js
// ============================================================================
function registerRoutes(app, expressJsonMiddleware) {
  if (!app || typeof app.post !== "function") {
    console.error("[SN-Webhook] registerRoutes: invalid app instance");
    return;
  }
  // Use express.json() with strict 16kb cap — payload is tiny (sn + status string).
  const json = expressJsonMiddleware || require("express").json({ limit: "16kb" });
  app.post("/webhook/sn-event", json, async (req, res) => {
    try {
      await handleSnEvent(req, res);
    } catch (e) {
      console.error("[SN-Webhook] handler crash:", e.message);
      // Defensive — never throw, WP must always get a response
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "internal_error" });
      }
    }
  });
  console.log("[SN-Webhook] route registered: POST /webhook/sn-event");
}

module.exports = {
  init,
  handleSnEvent,
  registerRoutes,
  // Exported for unit tests
  _verifyBearer,
  _validatePayload,
  _checkRateLimit,
  _inProcessRateLimit,
  _initRedis,
};
