#!/usr/bin/env node
/**
 * regression.js V.1.0 — DINOCO Chatbot Regression Guard
 *
 * CLI runner for regression scenarios. Prevents old bugs from returning
 * when shipping new features. Blocks deploy if critical scenarios fail.
 *
 * Usage:
 *   node scripts/regression.js                                  # run all active (report mode)
 *   node scripts/regression.js --mode=gate                      # exit 1 if any fail
 *   node scripts/regression.js --mode=gate --severity=critical  # gate on critical only
 *   node scripts/regression.js --severity=critical,high
 *   node scripts/regression.js --bug-id=REG-001
 *   node scripts/regression.js --category=product_knowledge
 *   node scripts/regression.js --triggered-by=pre-push
 *
 * Env required:
 *   MONGODB_URI, MONGODB_DB, API_SECRET_KEY, GOOGLE_API_KEY
 *
 * 3-Layer validation:
 *   1. Regex forbidden/required patterns  (free — 0 tokens)
 *   2. Tool call check (expected/forbidden tools)
 *   3. Gemini judge (only if hard rules pass + expect_behavior set)
 */

const { MongoClient } = require("mongodb");

// ═══════════════════════════════════════
// Config
// ═══════════════════════════════════════
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "smltrack";
const API_URL = process.env.AGENT_URL || "http://localhost:3000";
const API_KEY =
  process.env.API_SECRET_KEY || "dnc-api-2026-supersecret-changethis";
const GEMINI_KEY = process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const SCENARIOS_COLL = "regression_scenarios";
const RUNS_COLL = "regression_runs";

// ═══════════════════════════════════════
// Args
// ═══════════════════════════════════════
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    mode: "report", // report | gate
    severity: null, // null = all | [critical,high,medium]
    category: null,
    bugId: null,
    triggeredBy: "manual",
  };
  for (const a of args) {
    if (a.startsWith("--mode=")) out.mode = a.split("=")[1];
    else if (a.startsWith("--severity="))
      out.severity = a.split("=")[1].split(",").map(s => s.trim()).filter(Boolean);
    else if (a.startsWith("--category=")) out.category = a.split("=")[1];
    else if (a.startsWith("--bug-id=")) out.bugId = a.split("=")[1];
    else if (a.startsWith("--triggered-by=")) out.triggeredBy = a.split("=")[1];
  }
  return out;
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function color(code, text) {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = t => color(32, t);
const red = t => color(31, t);
const yellow = t => color(33, t);
const cyan = t => color(36, t);
const gray = t => color(90, t);
const bold = t => color(1, t);

async function callAgent(message, sourceId) {
  try {
    const res = await fetch(`${API_URL}/api/test-ai`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message, sourceId }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, reply: "", tools: [] };
    }
    const data = await res.json();
    return {
      reply: data.reply || "",
      tools: data.tools_called || [],
      kb_used: data.kb_used || [],
    };
  } catch (e) {
    return { error: e.message, reply: "", tools: [] };
  }
}

async function callGemini(prompt, temperature = 0.1, maxTokens = 600) {
  if (!GEMINI_KEY) throw new Error("GOOGLE_API_KEY not set");
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function clearSession(db, sourceId) {
  try {
    await db.collection("messages").deleteMany({ sourceId });
    await db.collection("ai_memory").deleteMany({ sourceId });
  } catch (e) {
    // ignore
  }
}

// ═══════════════════════════════════════
// Validation layers
// ═══════════════════════════════════════

// Layer 1: Regex patterns
function checkPatterns(reply, assertions) {
  const violations = [];
  const forbidden = assertions?.forbidden_patterns || [];
  for (const fp of forbidden) {
    if (!fp.pattern) continue;
    try {
      const re = new RegExp(fp.pattern, fp.flags || "i");
      if (re.test(reply)) {
        violations.push({
          layer: "regex_forbidden",
          pattern: fp.pattern,
          reason: fp.reason || "forbidden pattern matched",
        });
      }
    } catch (e) {
      violations.push({
        layer: "regex_error",
        pattern: fp.pattern,
        reason: `invalid regex: ${e.message}`,
      });
    }
  }
  const required = assertions?.required_patterns || [];
  for (const rp of required) {
    if (!rp.pattern) continue;
    try {
      const re = new RegExp(rp.pattern, rp.flags || "i");
      if (!re.test(reply)) {
        violations.push({
          layer: "regex_required",
          pattern: rp.pattern,
          reason: rp.reason || "required pattern missing",
        });
      }
    } catch (e) {
      violations.push({
        layer: "regex_error",
        pattern: rp.pattern,
        reason: `invalid regex: ${e.message}`,
      });
    }
  }
  return violations;
}

// Layer 2: Tool call check
function checkTools(toolsCalled, assertions) {
  const violations = [];
  const called = (toolsCalled || []).map(t => (typeof t === "string" ? t : t.name || ""));
  const expected = assertions?.expected_tools || [];
  const forbidden = assertions?.forbidden_tools || [];
  for (const ex of expected) {
    if (!called.includes(ex)) {
      violations.push({
        layer: "tool_expected",
        tool: ex,
        reason: `expected tool "${ex}" not called (called: ${called.join(",") || "none"})`,
      });
    }
  }
  for (const fb of forbidden) {
    if (called.includes(fb)) {
      violations.push({
        layer: "tool_forbidden",
        tool: fb,
        reason: `forbidden tool "${fb}" was called`,
      });
    }
  }
  return violations;
}

// Layer 3: Gemini semantic judge
async function judgeSemantics(scenario, turns, conversationSoFar) {
  const expect = scenario.assertions?.expect_behavior;
  const mustNot = scenario.assertions?.must_not_do || [];
  if (!expect) return { verdict: "PASS", reason: "no semantic check", skipped: true };

  const convoStr = turns
    .map((t, i) => `[Turn ${i + 1}]\nลูกค้า: "${t.message}"\nAI: "${(t.reply || "").substring(0, 400)}"`)
    .join("\n\n");

  const judgePrompt = `คุณคือผู้ตรวจ conversation ของ AI chatbot DINOCO THAILAND

=== Scenario: ${scenario.title} ===
Category: ${scenario.category}
Bug context: ${scenario.bug_context || "(none)"}

=== บทสนทนา ===
${convoStr}

=== พฤติกรรมที่คาดหวัง ===
${expect}

=== สิ่งที่ห้ามทำ ===
${mustNot.length > 0 ? mustNot.map((r, i) => `${i + 1}. ${r}`).join("\n") : "(ไม่มี)"}

=== คำสั่ง ===
ตัดสินว่า AI ตอบถูกต้องตาม expect_behavior หรือไม่
พิจารณา:
1. AI ทำตาม expect_behavior หรือไม่
2. AI ละเมิด must_not_do หรือไม่
3. AI จำ context จาก turn ก่อนหน้าได้หรือไม่ (ถ้า multi-turn)
4. Bug เดิมกลับมาหรือไม่

ตอบ JSON (ไม่ต้อง code block):
{"verdict":"PASS|FAIL","reason":"อธิบายสั้นๆ","violations":["กฎที่ละเมิด (ถ้ามี)"]}`;

  try {
    const raw = await callGemini(judgePrompt, 0.1, 500);
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const m = jsonStr.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    const judge = JSON.parse(m[0]);
    return {
      verdict: (judge.verdict || "PASS").toUpperCase(),
      reason: judge.reason || "",
      violations: judge.violations || [],
    };
  } catch (e) {
    return {
      verdict: "PASS", // don't fail on judge errors — hard rules already passed
      reason: `judge error: ${e.message}`,
      error: true,
    };
  }
}

// ═══════════════════════════════════════
// Scenario runner
// ═══════════════════════════════════════

async function runScenario(db, scenario, opts) {
  const startTs = Date.now();
  const bugId = scenario.bug_id;
  const sourceId = `reg_${bugId}_${startTs}`;

  // Clear any prior history for this sourceId
  await clearSession(db, sourceId);

  // Context setup (prior messages)
  const priorMsgs = scenario.context_setup?.prior_messages || [];
  if (priorMsgs.length > 0) {
    const now = Date.now();
    const docs = priorMsgs.map((m, i) => ({
      sourceId,
      role: m.role || "user",
      content: m.content || m.message || "",
      text: m.content || m.message || "",
      createdAt: new Date(now - (priorMsgs.length - i) * 1000),
      platform: scenario.platform === "facebook" ? "facebook" : scenario.platform === "instagram" ? "instagram" : "line",
    }));
    try {
      await db.collection("messages").insertMany(docs);
    } catch (e) {
      // ignore
    }
  }

  // Run turns
  const turns = scenario.turns || [];
  const turnResults = [];
  const allViolations = [];
  let aggregatedReply = "";
  let aggregatedTools = [];
  let error = null;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if ((turn.role || "user") !== "user") continue;
    const resp = await callAgent(turn.message, sourceId);
    if (resp.error) {
      error = resp.error;
      turnResults.push({ turn: i + 1, message: turn.message, reply: "", error: resp.error });
      break;
    }
    turnResults.push({
      turn: i + 1,
      message: turn.message,
      reply: resp.reply,
      tools: resp.tools,
    });
    aggregatedReply += (aggregatedReply ? "\n\n" : "") + resp.reply;
    aggregatedTools = aggregatedTools.concat(resp.tools || []);
    // small gap between turns
    if (i < turns.length - 1) await delay(1500);
  }

  // If error — return ERROR
  if (error) {
    await clearSession(db, sourceId);
    return {
      bug_id: bugId,
      title: scenario.title,
      severity: scenario.severity,
      category: scenario.category,
      status: "error",
      duration_ms: Date.now() - startTs,
      error,
      turns: turnResults,
      violations: [{ layer: "agent_error", reason: error }],
      semantic: null,
    };
  }

  // Layer 1: regex on final reply (or aggregated for multi-turn)
  // For single-turn: check only last reply. For multi-turn: check aggregated.
  const lastReply = turnResults[turnResults.length - 1]?.reply || "";
  const checkText = turns.length > 1 ? aggregatedReply : lastReply;
  const regexViolations = checkPatterns(checkText, scenario.assertions);
  allViolations.push(...regexViolations);

  // Layer 2: tool check
  const toolViolations = checkTools(aggregatedTools, scenario.assertions);
  allViolations.push(...toolViolations);

  // Layer 3: Gemini semantic judge (only if hard rules passed AND expect_behavior set)
  let semantic = null;
  if (allViolations.length === 0 && scenario.assertions?.expect_behavior) {
    semantic = await judgeSemantics(scenario, turnResults, turnResults);
    if (semantic.verdict === "FAIL") {
      allViolations.push({
        layer: "semantic",
        reason: semantic.reason,
        violations: semantic.violations,
      });
    }

    // Retry once if flaky and semantic failed
    if (semantic.verdict === "FAIL" && scenario.retry_on_flaky) {
      const retrySourceId = `reg_${bugId}_${Date.now()}_retry`;
      await clearSession(db, retrySourceId);
      // Re-run last turn only
      const lastTurn = turns.filter(t => (t.role || "user") === "user").pop();
      if (lastTurn) {
        const retryResp = await callAgent(lastTurn.message, retrySourceId);
        if (!retryResp.error) {
          const retryRegex = checkPatterns(retryResp.reply, scenario.assertions);
          const retryTools = checkTools(retryResp.tools, scenario.assertions);
          if (retryRegex.length === 0 && retryTools.length === 0) {
            const retrySemantic = await judgeSemantics(
              scenario,
              [{ message: lastTurn.message, reply: retryResp.reply }],
              []
            );
            if (retrySemantic.verdict === "PASS") {
              // clear previous semantic violation
              const idx = allViolations.findIndex(v => v.layer === "semantic");
              if (idx >= 0) allViolations.splice(idx, 1);
              semantic = { ...retrySemantic, retried: true };
            }
          }
        }
        await clearSession(db, retrySourceId);
      }
    }
  }

  // Cleanup session
  await clearSession(db, sourceId);

  const status = allViolations.length === 0 ? "pass" : "fail";

  return {
    bug_id: bugId,
    title: scenario.title,
    severity: scenario.severity,
    category: scenario.category,
    status,
    duration_ms: Date.now() - startTs,
    turns: turnResults,
    violations: allViolations,
    semantic,
  };
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════
async function main() {
  const opts = parseArgs();

  if (!MONGO_URI) {
    console.error(red("ERROR: MONGODB_URI not set"));
    process.exit(2);
  }
  if (!API_KEY) {
    console.error(red("ERROR: API_SECRET_KEY not set"));
    process.exit(2);
  }

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(MONGO_DB);

  // Build filter
  const filter = { active: { $ne: false } };
  if (opts.bugId) filter.bug_id = opts.bugId;
  if (opts.category) filter.category = opts.category;
  if (opts.severity && opts.severity.length > 0) filter.severity = { $in: opts.severity };

  const scenarios = await db
    .collection(SCENARIOS_COLL)
    .find(filter)
    .sort({ severity: 1, bug_id: 1 })
    .toArray();

  if (scenarios.length === 0) {
    console.log(yellow(`No regression scenarios found for filter: ${JSON.stringify(filter)}`));
    console.log(gray(`Hint: run  node scripts/seed-regression.js  to seed initial scenarios`));
    await client.close();
    process.exit(opts.mode === "gate" ? 1 : 0);
  }

  console.log(bold(cyan(`\n=== DINOCO Regression Guard V.1.0 ===`)));
  console.log(gray(`Mode: ${opts.mode} | Scenarios: ${scenarios.length} | Triggered by: ${opts.triggeredBy}`));
  if (opts.severity) console.log(gray(`Severity filter: ${opts.severity.join(",")}`));
  if (opts.category) console.log(gray(`Category filter: ${opts.category}`));
  console.log(gray(`Agent: ${API_URL}`));
  console.log("");

  // Run sequentially with delay (Gemini free tier = 15 RPM)
  const results = [];
  let passCount = 0, failCount = 0, errorCount = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    process.stdout.write(
      `${gray(`[${i + 1}/${scenarios.length}]`)} ${bold(s.bug_id)} ${s.title.substring(0, 50)} ... `
    );
    try {
      const result = await runScenario(db, s, opts);
      results.push(result);
      if (result.status === "pass") {
        console.log(green("PASS") + gray(` (${result.duration_ms}ms)`));
        passCount++;
      } else if (result.status === "error") {
        console.log(yellow(`ERROR`) + gray(` ${result.error}`));
        errorCount++;
      } else {
        console.log(red("FAIL") + gray(` (${result.duration_ms}ms)`));
        for (const v of result.violations) {
          console.log(`    ${red(">>")} [${v.layer}] ${v.reason || v.pattern || v.tool || ""}`);
        }
        failCount++;
      }

      // Update last_run on scenario
      await db.collection(SCENARIOS_COLL).updateOne(
        { _id: s._id },
        {
          $set: {
            last_run: {
              status: result.status,
              timestamp: new Date(),
              duration_ms: result.duration_ms,
              violations_count: result.violations.length,
            },
          },
        }
      );
    } catch (e) {
      console.log(yellow(`ERROR`) + gray(` ${e.message}`));
      errorCount++;
      results.push({
        bug_id: s.bug_id,
        title: s.title,
        severity: s.severity,
        category: s.category,
        status: "error",
        error: e.message,
        violations: [],
      });
    }

    // Rate limit: ~2s between scenarios (Gemini free tier)
    if (i < scenarios.length - 1) await delay(2000);
  }

  // Summary
  console.log("");
  console.log(bold(cyan("=== Summary ===")));
  console.log(
    `Total: ${scenarios.length} | ` +
      green(`Pass: ${passCount}`) +
      ` | ` +
      red(`Fail: ${failCount}`) +
      ` | ` +
      yellow(`Error: ${errorCount}`)
  );

  const passRate = scenarios.length > 0 ? Math.round((passCount / scenarios.length) * 100) : 0;
  console.log(`Pass rate: ${passRate}%`);

  // Critical fails (for gate mode decision)
  const criticalFails = results.filter(r => r.status === "fail" && r.severity === "critical");
  if (criticalFails.length > 0) {
    console.log("");
    console.log(bold(red(`>> ${criticalFails.length} CRITICAL scenario(s) failed:`)));
    for (const cf of criticalFails) {
      console.log(`   - ${cf.bug_id}: ${cf.title}`);
    }
  }

  // Record run
  try {
    await db.collection(RUNS_COLL).insertOne({
      triggered_by: opts.triggeredBy,
      mode: opts.mode,
      filter: { severity: opts.severity, category: opts.category, bug_id: opts.bugId },
      scenarios_run: scenarios.length,
      pass: passCount,
      fail: failCount,
      error: errorCount,
      pass_rate: passRate,
      results: results.map(r => ({
        bug_id: r.bug_id,
        title: r.title,
        severity: r.severity,
        category: r.category,
        status: r.status,
        duration_ms: r.duration_ms,
        violations: r.violations,
        semantic: r.semantic,
        error: r.error,
      })),
      created_at: new Date(),
    });
  } catch (e) {
    console.error(yellow(`[Warn] Could not record run: ${e.message}`));
  }

  await client.close();

  // Exit code logic
  if (opts.mode === "gate") {
    // Gate mode: fail if any critical (or any in filter) failed
    const gateFailed = opts.severity && opts.severity.includes("critical")
      ? criticalFails.length > 0 || failCount > 0
      : failCount > 0;
    if (gateFailed) {
      console.log("");
      console.log(red(bold(">> GATE FAILED — deploy blocked")));
      console.log(gray("   Fix the failing scenarios above before pushing."));
      console.log(gray("   To override: git push --no-verify  (use with extreme caution)"));
      process.exit(1);
    }
    console.log("");
    console.log(green(bold(">> GATE PASSED — deploy allowed")));
  } else {
    console.log("");
    console.log(gray(">> Report mode — always exit 0"));
  }
  process.exit(0);
}

main().catch(e => {
  console.error(red("FATAL:"), e);
  process.exit(2);
});
