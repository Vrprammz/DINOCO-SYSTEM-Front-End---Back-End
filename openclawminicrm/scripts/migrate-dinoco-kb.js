/**
 * DINOCO KB Migration Script
 * ดึง Knowledge Base จาก WordPress → embed ด้วย Gemini → upsert เข้า Qdrant + MongoDB
 *
 * Usage: node scripts/migrate-dinoco-kb.js
 *
 * Environment variables required:
 *   DINOCO_WP_API_URL  — WordPress REST API base URL
 *   DINOCO_WP_API_KEY  — WordPress API key
 *   GOOGLE_API_KEY     — Gemini API key (for embedding)
 *   QDRANT_URL         — Qdrant Cloud URL
 *   QDRANT_API_KEY     — Qdrant API key
 *   MONGODB_URI        — MongoDB connection string
 *   MONGODB_DB         — MongoDB database name (default: dinoco)
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");

const WP_URL = process.env.DINOCO_WP_API_URL;
const WP_KEY = process.env.DINOCO_WP_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_KEY = process.env.QDRANT_API_KEY;
const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGODB_DB || "dinoco";

const COLLECTION_NAME = "knowledge_base";
const VECTOR_SIZE = 768;

async function main() {
  console.log("=== DINOCO KB Migration ===\n");

  // Validate env
  if (!WP_URL || !WP_KEY) { console.error("Missing DINOCO_WP_API_URL or DINOCO_WP_API_KEY"); process.exit(1); }
  if (!GOOGLE_KEY) { console.error("Missing GOOGLE_API_KEY"); process.exit(1); }
  if (!MONGO_URI) { console.error("Missing MONGODB_URI"); process.exit(1); }

  // 1. Fetch KB from WordPress
  console.log("[1/5] Fetching KB from WordPress...");
  const kbRes = await fetch(`${WP_URL}/kb-export`, {
    headers: { "X-API-Key": WP_KEY },
  });
  if (!kbRes.ok) { console.error(`WordPress API error: ${kbRes.status}`); process.exit(1); }
  const kbData = await kbRes.json();
  console.log(`  Found ${kbData.count} KB entries\n`);

  if (kbData.count === 0) { console.log("No KB entries to migrate. Done."); return; }

  // 2. Connect MongoDB
  console.log("[2/5] Connecting to MongoDB...");
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(MONGO_DB);
  console.log(`  Connected to ${MONGO_DB}\n`);

  // 3. Ensure Qdrant collection (if QDRANT configured)
  const useQdrant = QDRANT_URL && QDRANT_KEY;
  if (useQdrant) {
    console.log("[3/5] Ensuring Qdrant collection...");
    try {
      const colRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        headers: { "api-key": QDRANT_KEY },
      });
      if (colRes.status === 404) {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
          method: "PUT",
          headers: { "api-key": QDRANT_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            vectors: { size: VECTOR_SIZE, distance: "Cosine" },
          }),
        });
        console.log(`  Created Qdrant collection: ${COLLECTION_NAME}\n`);
      } else {
        console.log(`  Qdrant collection exists\n`);
      }
    } catch (e) {
      console.error("  Qdrant error:", e.message);
      console.log("  Continuing without Qdrant...\n");
    }
  } else {
    console.log("[3/5] Qdrant not configured — skipping vector upsert\n");
  }

  // 4. Process each KB entry
  console.log("[4/5] Processing KB entries...");
  let success = 0;
  let failed = 0;

  for (const entry of kbData.entries) {
    const textToEmbed = `${entry.question || ""} ${entry.facts || ""} ${entry.action || ""}`.trim();
    if (!textToEmbed) { failed++; continue; }

    try {
      // Generate embedding
      const embedding = await getGeminiEmbedding(textToEmbed);

      // Upsert to MongoDB
      await db.collection(COLLECTION_NAME).updateOne(
        { wpPostId: entry.id },
        {
          $set: {
            wpPostId: entry.id,
            title: (entry.question || "").substring(0, 100),
            content: `${entry.question}\n\n${entry.facts}\n\n${entry.action}`,
            category: "general",
            tags: [],
            active: true,
            source: "wordpress-migration",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      // Upsert to Qdrant (if configured)
      if (useQdrant && embedding) {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
          method: "PUT",
          headers: { "api-key": QDRANT_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [{
              id: entry.id,
              vector: embedding,
              payload: {
                title: (entry.question || "").substring(0, 100),
                content: `${entry.question}\n${entry.facts}\n${entry.action}`,
                category: "general",
                tags: [],
                wpPostId: entry.id,
              },
            }],
          }),
        });
      }

      success++;
      process.stdout.write(`  [${success}/${kbData.count}] ${(entry.question || "").substring(0, 50)}...\r`);

      // Rate limit: 1 embedding per 200ms
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      failed++;
      console.error(`\n  Error on entry ${entry.id}: ${e.message}`);
    }
  }

  console.log(`\n\n[5/5] Migration complete!`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${kbData.count}`);

  await client.close();
  console.log("\nDone.");
}

async function getGeminiEmbedding(text) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: text.substring(0, 2000) }] },
        }),
      }
    );
    const data = await res.json();
    return data.embedding?.values || null;
  } catch (e) {
    console.error("  Embedding error:", e.message);
    return null;
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
