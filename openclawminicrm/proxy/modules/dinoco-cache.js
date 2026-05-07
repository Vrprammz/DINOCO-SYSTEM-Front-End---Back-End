/**
 * dinoco-cache.js — WordPress data cache with stale fallback
 * V.1.1 — Phase 4 W14.5 Round 2 (chatbot-rules.md §15.10 / §15.14.4):
 *         + snLookupCache Map (per-S/N TTL 60s) for /sn-lookup responses
 *         + invalidateSnCache(sn) / invalidateAllSnCache() — wired by WP webhook hook
 *           (POST /webhook/sn-event) when sn_pool status flips (activate/swap/void/recall)
 *         + cacheSnLookup() / getCachedSnLookup() helper API
 *         Backward compat: existing wpCache/callDinocoAPI untouched.
 * V.1.0 — Extracted from index.js monolith
 */

const DINOCO_WP_URL = process.env.DINOCO_WP_API_URL || "";
const DINOCO_WP_KEY = process.env.DINOCO_WP_API_KEY || "";

// Cache layer
const wpCache = {
  catalog: { data: null, expires: 0, stale: null },
  dealers: { data: null, expires: 0, stale: null },
  kb: { data: null, expires: 0, stale: null },
};
const CACHE_TTL = { catalog: 15 * 60 * 1000, dealers: 30 * 60 * 1000, kb: 15 * 60 * 1000 };

// Raw API call (no cache, with retry)
async function callDinocoAPIRaw(endpoint, body = null) {
  if (!DINOCO_WP_URL) return null;
  const url = DINOCO_WP_URL.replace(/\/$/, "") + endpoint;
  const opts = {
    headers: { "X-API-Key": DINOCO_WP_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  };
  if (body) { opts.method = "POST"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) return null;
  return await res.json();
}

async function preloadWPCache() {
  console.log("[Cache] Preloading WordPress data...");
  try {
    const [catalog, kb] = await Promise.allSettled([
      callDinocoAPIRaw("/catalog-full"),
      callDinocoAPIRaw("/kb-export"),
    ]);
    if (catalog.status === "fulfilled" && catalog.value?.products) {
      wpCache.catalog = { data: catalog.value, expires: Date.now() + CACHE_TTL.catalog, stale: catalog.value };
      console.log(`[Cache] Catalog: ${catalog.value.products?.length || 0} products`);
    }
    if (kb.status === "fulfilled" && kb.value?.entries) {
      wpCache.kb = { data: kb.value, expires: Date.now() + CACHE_TTL.kb, stale: kb.value };
      console.log(`[Cache] KB: ${kb.value.entries?.length || 0} entries`);
    }
  } catch (e) { console.error("[Cache] Preload error:", e.message); }
}

function invalidateWPCache(key) {
  if (key === "all") { Object.keys(wpCache).forEach((k) => { wpCache[k].expires = 0; }); }
  else if (wpCache[key]) { wpCache[key].expires = 0; }
  console.log(`[Cache] Invalidated: ${key}`);
}

// ============================================================================
// V.1.1 — S/N Lookup Cache (chatbot-rules.md §15.10 / §15.14.4)
// ============================================================================
// Per-S/N short-lived cache (TTL 60s) for /sn-lookup responses.
// AI must never trust this cache beyond 60s — backend (sn_pool) is source of truth.
// Invalidated by WP webhook /webhook/sn-event when sn_pool status flips.
const snLookupCache = new Map(); // key = normalized SN (uppercase), value = { data, expires }
const SN_LOOKUP_TTL = 60 * 1000; // 60 seconds per §15.2 cache-stale recovery rule
const SN_CACHE_MAX_SIZE = 500;   // soft cap — LRU-ish eviction below

function _normalizeSnKey(sn) {
  if (!sn || typeof sn !== "string") return "";
  return sn.toUpperCase().replace(/[\s-]+/g, "");
}

function getCachedSnLookup(sn) {
  const key = _normalizeSnKey(sn);
  if (!key) return null;
  const entry = snLookupCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expires) {
    snLookupCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSnLookup(sn, data) {
  const key = _normalizeSnKey(sn);
  if (!key || !data) return;
  // Soft eviction — drop oldest 50 entries when cap hit (Map preserves insertion order)
  if (snLookupCache.size >= SN_CACHE_MAX_SIZE) {
    const drop = Math.min(50, snLookupCache.size);
    let i = 0;
    for (const k of snLookupCache.keys()) {
      if (i++ >= drop) break;
      snLookupCache.delete(k);
    }
  }
  snLookupCache.set(key, { data, expires: Date.now() + SN_LOOKUP_TTL });
}

function invalidateSnCache(sn) {
  const key = _normalizeSnKey(sn);
  if (!key) return false;
  const had = snLookupCache.delete(key);
  // Indirect bust: kb cache may reference S/N status (e.g. "เพลทนี้ active แล้ว" → kb FAQ)
  if (wpCache.kb) wpCache.kb.expires = 0;
  console.log(`[Cache] SN invalidated: ${key} (existed=${had})`);
  return had;
}

function invalidateAllSnCache() {
  const count = snLookupCache.size;
  snLookupCache.clear();
  if (wpCache.kb) wpCache.kb.expires = 0;
  console.log(`[Cache] SN cache fully invalidated (${count} entries dropped)`);
  return count;
}

// Circuit breaker state (shared in-process)
const circuitBreaker = { failures: 0, lastFailure: 0, open: false, threshold: 3, cooldownMs: 5 * 60 * 1000 };

function isCircuitOpen() {
  if (!circuitBreaker.open) return false;
  if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.cooldownMs) {
    circuitBreaker.open = false; circuitBreaker.failures = 0;
    console.log("[CircuitBreaker] Reset — MCP Bridge retry");
    return false;
  }
  return true;
}

function recordSuccess() { circuitBreaker.failures = 0; circuitBreaker.open = false; }
function recordFailure() {
  circuitBreaker.failures++; circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.open = true;
    console.error(`[CircuitBreaker] OPEN — MCP Bridge failed ${circuitBreaker.failures}x`);
  }
}

async function callDinocoAPI(endpoint, body = null) {
  if (!DINOCO_WP_URL) return "WordPress Bridge ยังไม่ได้ตั้งค่า";

  const cacheKey = endpoint === "/catalog-full" ? "catalog" : endpoint === "/kb-export" ? "kb" : null;
  if (cacheKey && !body && wpCache[cacheKey].data && Date.now() < wpCache[cacheKey].expires) {
    return wpCache[cacheKey].data;
  }

  // Circuit breaker — ถ้า open ใช้ stale cache หรือ fallback
  if (isCircuitOpen()) {
    console.warn(`[CircuitBreaker] OPEN — skip ${endpoint}, use fallback`);
    if (cacheKey && wpCache[cacheKey].stale) return wpCache[cacheKey].stale;
    return "ขอเช็คข้อมูลกับทีมงานก่อนนะคะ (ระบบกำลังซ่อมบำรุง)";
  }

  try {
    const url = DINOCO_WP_URL.replace(/\/$/, "") + endpoint;
    const opts = {
      headers: { "X-API-Key": DINOCO_WP_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    };
    if (body) { opts.method = "POST"; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (!res.ok) {
      console.warn(`[DINOCO API] ${endpoint} HTTP ${res.status} — retry in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await fetch(url, opts).catch(() => null);
      if (retry?.ok) {
        recordSuccess();
        const data = await retry.json();
        if (cacheKey) { wpCache[cacheKey] = { data, expires: Date.now() + (CACHE_TTL[cacheKey] || 900000), stale: data }; }
        return data;
      }
      recordFailure();
      if (cacheKey && wpCache[cacheKey].stale) {
        console.warn(`[DINOCO API] ${endpoint} failed — using stale cache`);
        return wpCache[cacheKey].stale;
      }
      return `WordPress API error ${res.status}`;
    }
    recordSuccess();
    const data = await res.json();
    if (cacheKey) { wpCache[cacheKey] = { data, expires: Date.now() + (CACHE_TTL[cacheKey] || 900000), stale: data }; }
    return data;
  } catch (e) {
    console.error("[DINOCO API]", e.message);
    recordFailure();
    if (cacheKey && wpCache[cacheKey].stale) {
      console.warn(`[DINOCO API] ${endpoint} error — using stale cache`);
      return wpCache[cacheKey].stale;
    }
    return "ไม่สามารถเชื่อมต่อ WordPress ได้";
  }
}

module.exports = {
  DINOCO_WP_URL,
  DINOCO_WP_KEY,
  wpCache,
  CACHE_TTL,
  circuitBreaker,
  callDinocoAPIRaw,
  preloadWPCache,
  invalidateWPCache,
  callDinocoAPI,
  // V.1.1 — Round 2 §15.14.4 S/N cache API
  snLookupCache,
  SN_LOOKUP_TTL,
  getCachedSnLookup,
  cacheSnLookup,
  invalidateSnCache,
  invalidateAllSnCache,
};
