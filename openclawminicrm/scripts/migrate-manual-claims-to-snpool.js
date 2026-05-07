/**
 * Migrate MongoDB manual_claims.serial → sn_pool linkage (Phase 4 W14.3)
 *
 * Plan reference: docs/sn-system/20-phase4-w13-w14-prep.md §W14.3
 *
 * Goal: Backfill MongoDB manual_claims (legacy free-text serial) to either:
 *   - link to wp_dinoco_sn_pool (if canonical DNCSS pattern + found in pool)
 *   - flag manual_review (if format mismatch or not found)
 *
 * Usage:
 *   node scripts/migrate-manual-claims-to-snpool.js [--dry-run] [--limit=N] [--verbose]
 *
 * Required env vars:
 *   MONGODB_URI       — MongoDB connection
 *   MONGODB_DB        — Default 'dinoco'
 *   WP_API_BASE       — Default 'https://dinoco.in.th/wp-json/dinoco-mcp/v1'
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — Optional, for final report
 *
 * Idempotent: run multiple times safely. Already-migrated docs (have
 * `migration_v143_done=true` flag) are skipped.
 *
 * Defensive: Per-doc try/catch, never blocks on single failure. Final report
 * includes counts + sample failures.
 */

// MongoClient is lazy-required inside main() so helpers can be unit-tested
// from the main repo (where mongodb dependency may not be installed)

// ─── Config ──────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "dinoco";
const COLL = "manual_claims";
const WP_API_BASE = process.env.WP_API_BASE || "https://dinoco.in.th/wp-json/dinoco-mcp/v1";
const SN_LOOKUP_TIMEOUT_MS = 10000;

// ─── Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

// ─── Pure helpers (testable in isolation) ────────────────────────────

const SN_PREFIX_REGEX = /^DNCSS\d{7}$/;

function normalizeSerial(input) {
  if (!input || typeof input !== "string") return "";
  return input.toUpperCase().replace(/[\s-]+/g, "");
}

function classifySerial(rawSerial) {
  const normalized = normalizeSerial(rawSerial);
  if (!normalized) return { kind: "empty", normalized: "" };
  if (SN_PREFIX_REGEX.test(normalized)) return { kind: "canonical", normalized };
  if (/^DN[-_]?\d+$/i.test(normalized)) return { kind: "legacy_dn", normalized };
  return { kind: "mismatch", normalized };
}

async function lookupSnPool(serial) {
  const url = `${WP_API_BASE}/sn-lookup?sn=${encodeURIComponent(serial)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SN_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { found: false, http: res.status };
    const data = await res.json();
    return data || { found: false };
  } catch (e) {
    return { found: false, error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Telegram report (best-effort) ───────────────────────────────────

async function sendTelegramReport(summary) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("[Telegram] Skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }
  const text = [
    "📊 *Manual Claims Migration Report*",
    `Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}`,
    `Total scanned: ${summary.total_scanned}`,
    `Already migrated: ${summary.already_migrated}`,
    `Linked to sn_pool: ${summary.linked}`,
    `Flagged review: ${summary.flagged_review}`,
    `Empty serial: ${summary.empty_serial}`,
    `Errors: ${summary.errors}`,
    summary.errors > 0 && summary.error_samples.length
      ? `\nFirst errors:\n${summary.error_samples.map((e) => `- ${e}`).join("\n")}`
      : "",
    `\nElapsed: ${summary.elapsed_ms}ms`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (res.ok) console.log("[Telegram] Report sent");
    else console.warn("[Telegram] Failed:", res.status);
  } catch (e) {
    console.warn("[Telegram] Error:", e.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!MONGO_URI) {
    console.error("ERROR: MONGODB_URI not set");
    process.exit(1);
  }

  console.log(
    `[Migrate] Starting (mode: ${DRY_RUN ? "DRY-RUN" : "LIVE"}, limit: ${LIMIT || "ALL"})`
  );

  // Lazy-require mongodb (only when actually running the migration)
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const coll = db.collection(COLL);

  const startedAt = Date.now();
  const summary = {
    total_scanned: 0,
    already_migrated: 0,
    linked: 0,
    flagged_review: 0,
    empty_serial: 0,
    errors: 0,
    error_samples: [],
    elapsed_ms: 0,
    sample_canonical_not_found: [],
    sample_format_mismatch: [],
  };

  // Filter: skip already-migrated docs
  const filter = { migration_v143_done: { $ne: true } };
  const cursor = coll.find(filter);
  if (LIMIT > 0) cursor.limit(LIMIT);

  for await (const doc of cursor) {
    summary.total_scanned++;
    const rawSerial = doc.serial;
    const { kind, normalized } = classifySerial(rawSerial);

    let update = { migration_v143_done: true, migration_v143_at: new Date() };

    try {
      if (kind === "empty") {
        summary.empty_serial++;
        update.migration_v143_outcome = "empty_serial";
      } else if (kind === "canonical") {
        const lookup = await lookupSnPool(normalized);
        if (lookup.found) {
          summary.linked++;
          update.linked_sn = normalized;
          update.linked_pool_status = lookup.status || null;
          update.linked_top_set_sku = lookup.top_set_sku || null;
          update.migration_v143_outcome = "linked";
        } else {
          summary.flagged_review++;
          update.requires_manual_review = true;
          update.migration_v143_outcome = "canonical_not_found";
          if (summary.sample_canonical_not_found.length < 5) {
            summary.sample_canonical_not_found.push(normalized);
          }
        }
      } else if (kind === "legacy_dn") {
        summary.flagged_review++;
        update.requires_manual_review = true;
        update.migration_v143_outcome = "legacy_dn_format";
      } else {
        // mismatch
        summary.flagged_review++;
        update.requires_manual_review = true;
        update.migration_v143_outcome = "format_mismatch";
        if (summary.sample_format_mismatch.length < 5) {
          summary.sample_format_mismatch.push(rawSerial);
        }
      }

      if (VERBOSE) {
        console.log(
          `[${kind}] ${doc._id} serial="${rawSerial}" outcome=${update.migration_v143_outcome}`
        );
      }

      if (!DRY_RUN) {
        await coll.updateOne({ _id: doc._id }, { $set: update });
      }
    } catch (e) {
      summary.errors++;
      const msg = `${doc._id}: ${e.message || e}`;
      if (summary.error_samples.length < 5) summary.error_samples.push(msg);
      console.error(`[error] ${msg}`);
    }

    if (summary.total_scanned % 100 === 0) {
      console.log(
        `[progress] ${summary.total_scanned} scanned (linked=${summary.linked}, review=${summary.flagged_review}, errors=${summary.errors})`
      );
    }
  }

  summary.elapsed_ms = Date.now() - startedAt;

  console.log("\n=== Migration Summary ===");
  console.log(JSON.stringify(summary, null, 2));

  await sendTelegramReport(summary);

  await client.close();
  console.log("[Migrate] Done");
}

// Allow programmatic import (for tests) — run main only if executed directly
if (require.main === module) {
  main().catch((e) => {
    console.error("[FATAL]", e);
    process.exit(2);
  });
}

module.exports = {
  classifySerial,
  normalizeSerial,
  SN_PREFIX_REGEX,
  // Exported for unit testing — DO NOT use in production code paths.
};
