/**
 * QW-7 Smart Service Reminder drift detector — Phase 6 (2026-05-13)
 *
 * Boss decision 2026-05-13: "ดี ทำ" (good, do it). Different from F#4 anniversary_Ny:
 *   - F#4 = sale-driven (coupon attached)
 *   - QW-7 = educational (maintenance checklist, NO coupon)
 *
 * Locks:
 *   - Manager V.0.59+ Flex builder dinoco_sn_build_flex_service_reminder()
 *   - Manager V.0.59+ switch case 'service_reminder' in build_flex_for_notification
 *   - Manager V.0.59+ cron registration (daily 02:25 ICT, flag-aware)
 *   - Manager V.0.59+ stub handler dinoco_sn_run_service_reminder_schedule
 *   - Notifier V.0.8+ real handler dinoco_sn_lifecycle_run_service_reminder_schedule
 *   - Notifier V.0.8+ rebind hook in dinoco_sn_lifecycle_rebind_cron_hooks
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const MANAGER  = path.join(REPO_ROOT, "[Admin System] DINOCO Production SN Manager");
const NOTIFIER = path.join(REPO_ROOT, "[Admin System] DINOCO Warranty Lifecycle Notifier");

function stripComments(src) {
    return src.split("\n").filter((l) => {
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/")) return false;
        if (t.startsWith("//")) return false;
        return true;
    }).join("\n"); // do NOT strip trailing // — would clobber URLs in strings
}

describe("QW-7 Service Reminder — Flex builder + dispatch (Manager V.0.59+)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(MANAGER, "utf8"));
    });

    test("Flex builder dinoco_sn_build_flex_service_reminder defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_build_flex_service_reminder\s*\(/);
    });

    test("Service reminder header uses dark navy bg (#1f2937) — distinct from F#4 anniversary green", () => {
        const idx = code.indexOf("function dinoco_sn_build_flex_service_reminder");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/backgroundColor['"]?\s*=>\s*['"]#1f2937['"]/);
        expect(body).toMatch(/🔔 ดูแลสินค้าครบปี/);
    });

    test("Flex contains educational maintenance checklist (NOT coupon)", () => {
        const idx = code.indexOf("function dinoco_sn_build_flex_service_reminder");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/📋 Checklist ตรวจสภาพ/);
        expect(body).toMatch(/เช็คน็อตขันแน่น/);
        expect(body).toMatch(/รอยขีดข่วน|รอยสนิม/);
    });

    test("Flex has NO promo_code, NO discount, NO coupon fields", () => {
        const idx = code.indexOf("function dinoco_sn_build_flex_service_reminder");
        // bound: stop at next "function " keyword OR 10k cap
        const after = code.slice(idx + 50);
        const nextFn = after.search(/\bfunction\s+\w/);
        const end = nextFn === -1 ? Math.min(10000, code.length - idx) : 50 + nextFn;
        const body = code.slice(idx, idx + end);
        // QW-7 is intentionally NOT a sale push — these tokens must not appear
        expect(body).not.toMatch(/promo_code/);
        expect(body).not.toMatch(/discount_pct/);
        expect(body).not.toMatch(/รับคูปอง/);
    });

    test("Footer has 'ดู Tips ฉบับเต็ม' + 'ถามทีมงาน' buttons", () => {
        const idx = code.indexOf("function dinoco_sn_build_flex_service_reminder");
        const body = code.slice(idx, idx + 8000);
        expect(body).toMatch(/ดู Tips ฉบับเต็ม/);
        expect(body).toMatch(/ถามทีมงาน/);
    });

    test("build_flex_for_notification switch routes 'service_reminder' type", () => {
        const idx = code.indexOf("function dinoco_sn_build_flex_for_notification");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/\$type\s*===\s*['"]service_reminder['"]/);
        expect(body).toMatch(/dinoco_sn_build_flex_service_reminder\(/);
    });

    test("Cron hook dinoco_sn_service_reminder_cron registered (daily)", () => {
        expect(code).toMatch(/['"]dinoco_sn_service_reminder_cron['"]\s*=>\s*['"]daily['"]/);
    });

    test("Flag-aware cron registration with 02:25 ICT stagger (base + 1500s = 25min)", () => {
        expect(code).toMatch(/dinoco_register_flag_aware_cron\(\s*['"]dinoco_sn_service_reminder_cron['"]\s*,\s*['"]daily['"]\s*,\s*['"]dinoco_sn_system_enabled['"]\s*,\s*\$base_offset\s*\+\s*1500\s*\)/);
    });

    test("Stub handler dinoco_sn_run_service_reminder_schedule defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_run_service_reminder_schedule\s*\(/);
    });

    test("Stub handler writes heartbeat in finally block", () => {
        const idx = code.indexOf("function dinoco_sn_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 1000);
        expect(body).toMatch(/finally\s*\{/);
        expect(body).toMatch(/dinoco_cron_sn_service_reminder_last_run/);
    });

    test("Cron registered via dinoco_register_cron (Round 28 pattern)", () => {
        expect(code).toMatch(/dinoco_register_cron\(\s*['"]dinoco_sn_service_reminder_cron['"]\s*,\s*['"]daily['"]\s*,\s*['"]dinoco_sn_run_service_reminder_schedule['"]/);
    });

    test("Fallback add_action wired when registry missing", () => {
        expect(code).toMatch(/add_action\(\s*['"]dinoco_sn_service_reminder_cron['"]\s*,\s*['"]dinoco_sn_run_service_reminder_schedule['"]/);
    });
});

describe("QW-7 Service Reminder — Real handler (Notifier V.0.8+)", () => {
    let code;

    beforeAll(() => {
        code = stripComments(fs.readFileSync(NOTIFIER, "utf8"));
    });

    test("Real handler dinoco_sn_lifecycle_run_service_reminder_schedule defined", () => {
        expect(code).toMatch(/function\s+dinoco_sn_lifecycle_run_service_reminder_schedule\s*\(/);
    });

    test("Loops 1..5 years (matches anniversary_Ny range)", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/for\s*\(\s*\$years\s*=\s*1\s*;\s*\$years\s*<=\s*5\s*;/);
    });

    test("SQL filters status IN ('registered','claimed') + DATE_SUB N YEAR match", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/status IN \('registered','claimed'\)/);
        expect(body).toMatch(/DATE_SUB\(\s*%s\s*,\s*INTERVAL %d YEAR\s*\)/);
    });

    test("Dedup guard: skip if same-day anniversary_Ny scheduled for same (user,sn)", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/anniversary_['"]\s*\.\s*\$years\s*\.\s*['"]y/);
        expect(body).toMatch(/SELECT COUNT\(\*\) FROM \{\$notif\}/);
        expect(body).toMatch(/\$has_anniv\s*>\s*0/);
    });

    test("Per-user preference gate uses dinoco_sn_should_send_to_user('service_reminder')", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/dinoco_sn_should_send_to_user\(\s*\$uid\s*,\s*['"]service_reminder['"]\s*\)/);
    });

    test("Schedules via dinoco_sn_schedule_notification with notification_type='service_reminder'", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/dinoco_sn_schedule_notification\(\s*\$sn_up\s*,\s*\$uid\s*,\s*['"]service_reminder['"]/);
    });

    test("Heartbeat in finally block (R12 pattern)", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/finally\s*\{/);
        expect(body).toMatch(/dinoco_cron_sn_service_reminder_last_run/);
    });

    test("Rebind hook replaces Manager stub on wp_loaded", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_rebind_cron_hooks");
        expect(idx).toBeGreaterThan(-1);
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/remove_action\(\s*['"]dinoco_sn_service_reminder_cron['"]\s*,\s*['"]dinoco_sn_run_service_reminder_schedule['"]/);
        expect(body).toMatch(/add_action\(\s*['"]dinoco_sn_service_reminder_cron['"]\s*,\s*['"]dinoco_sn_lifecycle_run_service_reminder_schedule['"]/);
    });

    test("Persists last_run summary to wp_options dinoco_sn_service_reminder_last_run", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/update_option\(\s*['"]dinoco_sn_service_reminder_last_run['"]/);
        expect(body).toMatch(/['"]skipped_dedup['"]/);
    });

    test("Catch block routes errors through dinoco_sn_obs_capture (defensive)", () => {
        const idx = code.indexOf("function dinoco_sn_lifecycle_run_service_reminder_schedule");
        const body = code.slice(idx, idx + 5000);
        expect(body).toMatch(/catch\s*\(\s*\\Throwable\s+\$e\s*\)/);
        expect(body).toMatch(/dinoco_sn_obs_capture\(\s*['"]lifecycle_service_reminder['"]/);
    });
});
