/**
 * dinoco-cache.js — WordPress data cache with stale fallback
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

async function callDinocoAPI(endpoint, body = null) {
  if (!DINOCO_WP_URL) return "WordPress Bridge ยังไม่ได้ตั้งค่า";

  const cacheKey = endpoint === "/catalog-full" ? "catalog" : endpoint === "/kb-export" ? "kb" : null;
  if (cacheKey && !body && wpCache[cacheKey].data && Date.now() < wpCache[cacheKey].expires) {
    return wpCache[cacheKey].data;
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
        const data = await retry.json();
        if (cacheKey) { wpCache[cacheKey] = { data, expires: Date.now() + (CACHE_TTL[cacheKey] || 900000), stale: data }; }
        return data;
      }
      if (cacheKey && wpCache[cacheKey].stale) {
        console.warn(`[DINOCO API] ${endpoint} failed — using stale cache`);
        return wpCache[cacheKey].stale;
      }
      return `WordPress API error ${res.status}`;
    }
    const data = await res.json();
    if (cacheKey) { wpCache[cacheKey] = { data, expires: Date.now() + (CACHE_TTL[cacheKey] || 900000), stale: data }; }
    return data;
  } catch (e) {
    console.error("[DINOCO API]", e.message);
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
  callDinocoAPIRaw,
  preloadWPCache,
  invalidateWPCache,
  callDinocoAPI,
};
