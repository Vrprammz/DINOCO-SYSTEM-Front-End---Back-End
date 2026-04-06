/**
 * lead-pipeline.js — Lead statuses, transitions, CRUD, Mayom follow-up cron
 * V.1.2 — Fix: ลบคำว่า "พี่" ออกจาก follow-up messages ทั้งหมด, ใช้ "ลูกค้า" แทน
 */
const { getDB, DEFAULT_BOT_NAME, auditLog } = require("./shared");
const { callDinocoAPI } = require("./dinoco-cache");

// Forward declarations
let sendLinePush = null;
let sendMetaMessage = null;
let replyToLine = null;

function init(deps) {
  sendLinePush = deps.sendLinePush;
  sendMetaMessage = deps.sendMetaMessage;
  replyToLine = deps.replyToLine;
}

const LEAD_STATUSES = [
  "lead_created", "dealer_notified", "checking_contact",
  "dealer_contacted", "dealer_no_response",
  "waiting_order", "order_placed",
  "waiting_delivery", "delivered",
  "waiting_install", "installed",
  "satisfaction_checked",
  "closed_satisfied", "closed_lost", "closed_cancelled",
  "admin_escalated", "dormant",
];

const LEAD_TRANSITIONS = {
  lead_created: ["dealer_notified"],
  dealer_notified: ["checking_contact", "dealer_no_response"],
  checking_contact: ["dealer_contacted", "dealer_no_response", "admin_escalated"],
  dealer_contacted: ["waiting_order", "closed_lost"],
  dealer_no_response: ["admin_escalated", "dealer_contacted"],
  waiting_order: ["order_placed", "closed_lost", "admin_escalated"],
  order_placed: ["waiting_delivery", "closed_cancelled", "closed_lost", "admin_escalated"],
  waiting_delivery: ["delivered", "closed_cancelled", "closed_lost", "admin_escalated"],
  delivered: ["waiting_install", "closed_cancelled", "closed_lost", "admin_escalated"],
  waiting_install: ["installed", "closed_cancelled", "closed_lost", "admin_escalated"],
  installed: ["satisfaction_checked", "closed_cancelled", "closed_lost", "admin_escalated"],
  satisfaction_checked: ["closed_satisfied", "closed_lost"],
  admin_escalated: ["dealer_contacted", "closed_cancelled", "dormant"],
  dormant: ["lead_created"],
};

function canTransitionLead(from, to) {
  return LEAD_TRANSITIONS[from]?.includes(to) || false;
}

async function createLead({ sourceId, platform, customerName, productInterest, province, phone, lineId, dealerId, dealerName }) {
  const db = await getDB();
  if (!db) return null;
  const lead = {
    sourceId, platform,
    customerName: customerName || "Unknown",
    productInterest: productInterest || "",
    province: province || "",
    phone: phone || null,
    lineId: lineId || null,
    dealerId: dealerId || null,
    dealerName: dealerName || null,
    status: "lead_created",
    windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    otnToken: null, otnTokenUsed: false,
    nextFollowUpAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    nextFollowUpType: "first_check",
    followUpHistory: [],
    createdAt: new Date(), updatedAt: new Date(), closedAt: null,
  };
  const result = await db.collection("leads").insertOne(lead);
  lead._id = result.insertedId;
  console.log(`[Lead] Created: ${customerName} -> ${dealerName || "no dealer"} (${platform})`);
  return lead;
}

async function updateLeadStatus(leadId, newStatus, metadata = {}) {
  const db = await getDB();
  if (!db) return false;
  const lead = await db.collection("leads").findOne({ _id: leadId });
  if (!lead) return false;
  if (!canTransitionLead(lead.status, newStatus)) {
    console.warn(`[Lead] Invalid transition: ${lead.status} -> ${newStatus}`);
    return false;
  }
  const update = {
    $set: { status: newStatus, updatedAt: new Date(), ...metadata },
    $push: { followUpHistory: { from: lead.status, to: newStatus, at: new Date(), ...metadata } },
  };
  if (newStatus.startsWith("closed_")) update.$set.closedAt = new Date();
  await db.collection("leads").updateOne({ _id: leadId }, update);
  console.log(`[Lead] ${lead.customerName}: ${lead.status} -> ${newStatus}`);
  return true;
}

async function notifyDealer(lead) {
  if (!lead.dealerId) return;
  const result = await callDinocoAPI("/distributor-notify", {
    distributor_id: lead.dealerId, customer_name: lead.customerName,
    product_interest: lead.productInterest, province: lead.province,
    phone: lead.phone || "", lead_id: String(lead._id), platform: lead.platform,
  });
  if (typeof result !== "string") {
    await updateLeadStatus(lead._id, "dealer_notified");
    console.log(`[Lead] Notified dealer: ${lead.dealerName}`);
  } else {
    console.error(`[Lead] Failed to notify dealer: ${result}`);
  }
}

function selectFollowUpMethod(lead) {
  if (lead.windowExpiresAt && new Date() < new Date(lead.windowExpiresAt)) return "fb_ig_message";
  if (lead.lineId) return "line";
  if (lead.platform === "facebook" && lead.otnToken && !lead.otnTokenUsed) return "otn";
  if (lead.phone) return "sms";
  return "admin_manual";
}

async function updateMetaWindow(sourceId, platform) {
  const db = await getDB();
  if (!db) return;
  if (platform !== "facebook" && platform !== "instagram") return;
  const now = new Date();
  const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await db.collection("groups_meta").updateOne(
    { sourceId },
    { $set: { windowExpiresAt: windowExpires, lastCustomerMessageAt: now, updatedAt: now } },
    { upsert: false }
  );
  await db.collection("leads").updateMany(
    { sourceId, closedAt: null },
    { $set: { windowExpiresAt: windowExpires, updatedAt: now } }
  );
}

async function checkClosingSoonWindows() {
  const db = await getDB();
  if (!db) return { processed: 0 };
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const closingLeads = await db.collection("leads").find({
    closedAt: null,
    windowExpiresAt: { $gt: now, $lt: twoHoursLater },
    closingSoonSent: { $ne: true },
    platform: { $in: ["facebook", "instagram"] },
    status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
  }).limit(10).toArray();
  let processed = 0;
  for (const lead of closingLeads) {
    const senderId = lead.sourceId.replace(/^(fb_|ig_)/, "");
    const product = lead.productInterest || "สินค้า DINOCO";
    const dealer = lead.dealerName || "ตัวแทนจำหน่าย";
    let msg;
    if (!lead.phone && !lead.lineId) {
      msg = `สวัสดีค่ะลูกค้า แอดมิน DINOCO ค่ะ 🙏\nร้าน ${dealer} พร้อมให้บริการเรื่อง ${product} ค่ะ\n\nรบกวนขอเบอร์โทรหรือ LINE ID ได้ไหมคะ\nจะได้ให้ทางร้านติดต่อกลับสะดวกค่ะ`;
    } else {
      msg = `สวัสดีค่ะลูกค้า แอดมิน DINOCO ค่ะ 😊\nมีอะไรสงสัยเรื่อง ${product} ทักมาได้เลยนะคะ\nร้าน ${dealer} ยินดีให้บริการค่ะ`;
    }
    await sendMetaMessage(senderId, msg).catch(() => {});
    await db.collection("leads").updateOne({ _id: lead._id }, { $set: { closingSoonSent: true, updatedAt: now } });
    processed++;
  }
  return { processed };
}

async function isMetaWindowOpen(sourceId) {
  const db = await getDB();
  if (!db) return false;
  const meta = await db.collection("groups_meta").findOne({ sourceId });
  if (!meta?.windowExpiresAt) return false;
  return new Date() < new Date(meta.windowExpiresAt);
}

// === Mayom Follow-Up Cron ===
async function mayomFollowUpCron() {
  const db = await getDB();
  if (!db) return;
  const now = new Date();
  const pendingFollowUps = await db.collection("leads").find({
    nextFollowUpAt: { $lte: now }, closedAt: null,
    status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
  }).limit(20).toArray();
  if (pendingFollowUps.length === 0) return;
  console.log(`[Mayom] Processing ${pendingFollowUps.length} follow-ups...`);
  for (const lead of pendingFollowUps) {
    try { await processFollowUp(lead); } catch (e) { console.error(`[Mayom] Error processing lead ${lead._id}:`, e.message); }
  }
}

async function processFollowUp(lead) {
  const db = await getDB();
  if (!db) return;
  const type = lead.nextFollowUpType || "first_check";
  let nextType = null;
  let nextDelay = null;

  switch (type) {
    case "first_check": {
      const method = selectFollowUpMethod(lead);
      if (method === "fb_ig_message" || method === "otn") {
        const msg = `สวัสดีค่ะลูกค้า 🙏 แอดมิน DINOCO ค่ะ\nตัวแทน ${lead.dealerName || "จำหน่าย"} ติดต่อลูกค้าแล้วหรือยังคะ`;
        if (lead.platform === "facebook" || lead.platform === "instagram") {
          await sendMetaMessage(lead.sourceId, msg).catch(() => {});
        }
      } else if (method === "line" && lead.lineId) {
        const lineMsg = `สวัสดีค่ะลูกค้า แอดมิน DINOCO ค่ะ\nตัวแทน ${lead.dealerName || ""} ติดต่อลูกค้าแล้วหรือยังคะ`;
        await sendLinePush(lead.lineId, [{ type: "text", text: lineMsg }]).catch(() => {});
      }
      await callDinocoAPI("/distributor-notify", {
        distributor_id: lead.dealerId, customer_name: lead.customerName,
        message: `ติดต่อลูกค้า ${lead.customerName} แล้วหรือยังคะ?`,
        lead_id: String(lead._id), type: "follow_up",
      }).catch(() => {});
      nextType = "contact_recheck"; nextDelay = 24 * 60 * 60 * 1000;
      await updateLeadStatus(lead._id, "checking_contact");
      break;
    }
    case "contact_recheck": {
      if (lead.status === "checking_contact") {
        await updateLeadStatus(lead._id, "dealer_no_response");
        const database = await getDB();
        if (database) {
          await database.collection("alerts").insertOne({
            type: "lead_no_response", sourceId: lead.sourceId,
            customerName: lead.customerName,
            message: `ตัวแทน ${lead.dealerName} ไม่ตอบ 24 ชม. — lead ${lead.customerName} สนใจ ${lead.productInterest}`,
            level: "red", read: false, createdAt: new Date(),
          });
        }
      }
      nextType = "delivery_check"; nextDelay = 5 * 24 * 60 * 60 * 1000;
      break;
    }
    case "delivery_check": {
      const method = selectFollowUpMethod(lead);
      const msg = `สวัสดีค่ะ ${DEFAULT_BOT_NAME} ค่ะ 🙏\nสินค้า ${lead.productInterest || "DINOCO"} มาถึงแล้วหรือยังคะ?`;
      if (method === "line" && lead.lineId) {
        await sendLinePush(lead.lineId, [{ type: "text", text: msg }]).catch(() => {});
      }
      nextType = "install_check"; nextDelay = 2 * 24 * 60 * 60 * 1000;
      break;
    }
    case "install_check": {
      const method = selectFollowUpMethod(lead);
      const msg = `สวัสดีค่ะ ${DEFAULT_BOT_NAME} ค่ะ 😊\nติดตั้ง ${lead.productInterest || "สินค้า DINOCO"} เรียบร้อยไหมคะ? เป็นยังไงบ้าง?`;
      if (method === "line" && lead.lineId) {
        await sendLinePush(lead.lineId, [{ type: "text", text: msg }]).catch(() => {});
      }
      nextType = "satisfaction_check"; nextDelay = 30 * 24 * 60 * 60 * 1000;
      break;
    }
    case "satisfaction_check": {
      const method = selectFollowUpMethod(lead);
      const msg = `สวัสดีค่ะ ${DEFAULT_BOT_NAME} ค่ะ 🙏\nใช้ ${lead.productInterest || "สินค้า DINOCO"} มาได้ 1 เดือนแล้ว เป็นยังไงบ้างคะ? มีปัญหาอะไรไหม?`;
      if (method === "line" && lead.lineId) {
        await sendLinePush(lead.lineId, [{ type: "text", text: msg }]).catch(() => {});
      }
      nextType = null;
      break;
    }
  }

  const update = { $set: { updatedAt: new Date() } };
  if (nextType && nextDelay) {
    update.$set.nextFollowUpAt = new Date(Date.now() + nextDelay);
    update.$set.nextFollowUpType = nextType;
  } else {
    update.$set.nextFollowUpAt = null;
    update.$set.nextFollowUpType = null;
  }
  await db.collection("leads").updateOne({ _id: lead._id }, update);
}

function startMayomCron() {
  setInterval(() => {
    mayomFollowUpCron().catch((e) => console.error("[Mayom] Cron error:", e.message));
  }, 30 * 60 * 1000);
  console.log("[Mayom] Lead Follow-up cron started (every 30 min)");
}

async function ensureLeadIndexes() {
  const db = await getDB();
  if (!db) return;
  try {
    const leads = db.collection("leads");
    await leads.createIndex({ status: 1, nextFollowUpAt: 1 });
    await leads.createIndex({ dealerId: 1, status: 1 });
    await leads.createIndex({ sourceId: 1 });
    await leads.createIndex({ closedAt: 1, status: 1 });
    await leads.createIndex({ platform: 1, createdAt: -1 });
    await leads.createIndex({ windowExpiresAt: 1, closingSoonSent: 1 });
    await leads.createIndex({ createdAt: -1 });
    const kbSugg = db.collection("kb_suggestions");
    await kbSugg.createIndex({ normalizedQuestion: 1 }, { unique: true });
    await kbSugg.createIndex({ frequency: -1, lastAskedAt: -1 });
    await kbSugg.createIndex({ status: 1, frequency: -1 });
    await db.collection("dealer_sla_reports").createIndex({ weekOf: -1 });
    console.log("[DB] Lead + KB + SLA indexes created");
  } catch (e) { console.error("[DB] Lead index error:", e.message); }
}

async function runLeadCronByType(type) {
  const db = await getDB();
  if (!db) return { processed: 0, message: "DB not available" };
  const now = new Date();

  switch (type) {
    case "first-check": {
      const leads = await db.collection("leads").find({
        nextFollowUpAt: { $lte: now }, nextFollowUpType: "first_check", closedAt: null,
        status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
      }).limit(20).toArray();
      for (const lead of leads) { await processFollowUp(lead).catch(e => console.error(`[Mayom] first-check ${lead._id}:`, e.message)); }
      return { processed: leads.length, type: "first_check" };
    }
    case "contact-recheck": {
      const leads = await db.collection("leads").find({
        nextFollowUpAt: { $lte: now }, nextFollowUpType: "contact_recheck", closedAt: null,
        status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
      }).limit(20).toArray();
      for (const lead of leads) { await processFollowUp(lead).catch(e => console.error(`[Mayom] contact-recheck ${lead._id}:`, e.message)); }
      return { processed: leads.length, type: "contact_recheck" };
    }
    case "delivery-check": {
      const leads = await db.collection("leads").find({
        nextFollowUpAt: { $lte: now }, nextFollowUpType: "delivery_check", closedAt: null,
        status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
      }).limit(20).toArray();
      for (const lead of leads) { await processFollowUp(lead).catch(e => console.error(`[Mayom] delivery-check ${lead._id}:`, e.message)); }
      return { processed: leads.length, type: "delivery_check" };
    }
    case "install-check": {
      const leads = await db.collection("leads").find({
        nextFollowUpAt: { $lte: now }, nextFollowUpType: "install_check", closedAt: null,
        status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
      }).limit(20).toArray();
      for (const lead of leads) { await processFollowUp(lead).catch(e => console.error(`[Mayom] install-check ${lead._id}:`, e.message)); }
      return { processed: leads.length, type: "install_check" };
    }
    case "30day-check": {
      const leads = await db.collection("leads").find({
        nextFollowUpAt: { $lte: now }, nextFollowUpType: "satisfaction_check", closedAt: null,
        status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant"] },
      }).limit(50).toArray();
      for (const lead of leads) { await processFollowUp(lead).catch(e => console.error(`[Mayom] 30day-check ${lead._id}:`, e.message)); }
      return { processed: leads.length, type: "satisfaction_check" };
    }
    case "dormant-cleanup": {
      const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const result = await db.collection("leads").updateMany(
        { closedAt: null, updatedAt: { $lt: cutoff },
          status: { $nin: ["closed_satisfied", "closed_lost", "closed_cancelled", "dormant", "order_placed", "waiting_delivery", "delivered", "installed"] } },
        { $set: { status: "dormant", updatedAt: now, dormantReason: "no_activity_14d" } }
      );
      const retentionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const purged = await db.collection("leads").updateMany(
        { closedAt: { $lt: retentionCutoff } },
        { $set: { customerName: "[ลบแล้ว]", phone: null, lineId: null, otnToken: null, purgedAt: now } }
      );
      return { dormant: result.modifiedCount, purged: purged.modifiedCount };
    }
    case "closing-soon": {
      const closingResult = await checkClosingSoonWindows();
      return { processed: closingResult.processed, type: "closing_soon" };
    }
    case "dealer-sla-weekly": {
      const pipeline = [
        { $match: { createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: {
          _id: "$dealerId", dealerName: { $first: "$dealerName" }, totalLeads: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $in: ["$status", ["dealer_contacted", "waiting_order", "order_placed", "waiting_delivery", "delivered", "installed", "closed_satisfied"]] }, 1, 0] } },
          noResponse: { $sum: { $cond: [{ $eq: ["$status", "dealer_no_response"] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $in: ["$status", ["closed_satisfied", "closed_lost", "closed_cancelled"]] }, 1, 0] } },
          satisfied: { $sum: { $cond: [{ $eq: ["$status", "closed_satisfied"] }, 1, 0] } },
        }},
        { $addFields: {
          contactRate: { $cond: [{ $gt: ["$totalLeads", 0] }, { $divide: ["$contacted", "$totalLeads"] }, 0] },
          satisfactionRate: { $cond: [{ $gt: ["$closed", 0] }, { $divide: ["$satisfied", "$closed"] }, 0] },
        }},
        { $sort: { contactRate: 1 } },
      ];
      const slaReport = await db.collection("leads").aggregate(pipeline).toArray();
      await db.collection("dealer_sla_reports").insertOne({ weekOf: now, report: slaReport, createdAt: now });
      const badDealers = slaReport.filter(d => d.noResponse > 0);
      if (badDealers.length > 0) {
        const alertMsg = `SLA summary\n\nDealers not responding:\n${badDealers.map(d => `${d.dealerName || d._id}: ${d.noResponse} no response / ${d.totalLeads} total`).join("\n")}`;
        await db.collection("alerts").insertOne({ type: "dealer_sla_weekly", message: alertMsg, level: "yellow", read: false, createdAt: now });
      }
      return { dealers: slaReport.length, badDealers: badDealers.length, report: slaReport };
    }
    default:
      return { processed: 0, message: "Unknown type" };
  }
}

module.exports = {
  LEAD_STATUSES,
  LEAD_TRANSITIONS,
  canTransitionLead,
  createLead,
  updateLeadStatus,
  notifyDealer,
  selectFollowUpMethod,
  updateMetaWindow,
  checkClosingSoonWindows,
  isMetaWindowOpen,
  mayomFollowUpCron,
  processFollowUp,
  startMayomCron,
  ensureLeadIndexes,
  runLeadCronByType,
  init,
};
