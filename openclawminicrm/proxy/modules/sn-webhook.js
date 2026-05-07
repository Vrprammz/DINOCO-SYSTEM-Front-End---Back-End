/**
 * sn-webhook.js — WP→Agent webhook listener for sn_pool state changes
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
// In-process rate limit (per-instance — soft cap)
// ============================================================================
// 1000 requests/min sliding window. Counters reset every 60s.
// Cache invalidation events are high-volume (each plate state flip fires one) —
// budget allows ~16 events/sec which is well above realistic peak (large recall
// batch ≈ 100-500 plates/run, throttled WP-side by `wp_schedule_single_event`).
const RATE_LIMIT_MAX = 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let rateLimitWindowStart = Date.now();
let rateLimitCount = 0;

function _checkRateLimit() {
  const now = Date.now();
  if (now - rateLimitWindowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindowStart = now;
    rateLimitCount = 0;
  }
  rateLimitCount++;
  return rateLimitCount <= RATE_LIMIT_MAX;
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
  // Step 1: rate limit (returns 429 — WP can throttle / queue)
  try {
    if (!_checkRateLimit()) {
      console.warn("[SN-Webhook] rate limit exceeded (window=" + RATE_LIMIT_MAX + "/min)");
      return res.status(429).json({ success: false, error: "rate_limited" });
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
};
