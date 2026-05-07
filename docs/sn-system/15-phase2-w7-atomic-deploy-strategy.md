# 🚀 Phase 2 W7.5 — Atomic 5-Step Deploy Strategy

**Date**: 2026-05-07
**Plan**: v2.13 §B4 + Phase 2 W7
**Risk level**: 🔴 **HIGH** — 3 dashboard snippets V.30 → V.31 atomic deploy + dual-source compat window

ตอน Member Dashboard 3 snippets bump V.31.0 พร้อมกัน ใน WordPress production = ช่วงเวลา ~30s ที่ snippet หนึ่งเป็น V.31 อีกอันเป็น V.30 → DOM/data inconsistency โอกาสเสียหายข้อมูล / UX แตก / member dashboard render ครึ่ง.

**v2.12 §B4 spec**: Deploy 5-step strategy ป้องกัน race condition

---

## 🛡 5-Step Deploy Plan (sequenced)

### Step 1 — Deploy 6 NEW snippets first (no existing dependency)

ดีพลอย NEW snippets ที่ไม่มี existing snippet พึ่งพา:

| NEW snippet | Status | Notes |
|---|---|---|
| `[Admin System] DINOCO Production SN Manager` | ✅ V.0.26 deployed | 7 helpers + schema + admin UI |
| `[System] DINOCO SN REST API` | ✅ V.0.19 deployed | All REST endpoints |
| `[System] DINOCO Warranty Activation LIFF` | ✅ V.0.3 deployed | Customer activate page |
| `[Admin System] DINOCO User Role Manager` | ✅ V.0.2 deployed | Matrix UI for role assignment |
| `[Admin System] DINOCO SN Approval Workflow` | ✅ V.0.1 deployed | 4-eyes queue + SLA cron |
| `[Admin System] DINOCO Public API Gateway` | ✅ V.0.3 deployed | F#15 deferred (flag-gated 503) |

**Status**: ✅ Done (current main branch)

---

### Step 2 — Backfill 100% legacy CPT → sn_pool + verify count parity

**Goal**: ก่อน flip dual-source flag, ทุก existing legacy `serial_code` ACF entry ต้อง mirror ลง `wp_dinoco_sn_pool` + verify count parity (legacy count == sn_pool count)

**Migration script** (NEW — Phase 2 W7 task):
```php
function dinoco_sn_w7_backfill_legacy_warranties() {
    global $wpdb;

    // 1. Count legacy warranties with serial_code (source of truth)
    $legacy_count = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->postmeta}
         WHERE meta_key='serial_code' AND meta_value != ''"
    );

    // 2. Count existing sn_pool rows (initial state)
    $pool_count = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->prefix}dinoco_sn_pool"
    );

    // 3. Backfill chunked (1000/iter, 50ms gap to avoid replication lag)
    $batch_size = 1000;
    $processed = 0;
    do {
        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT pm.post_id, pm.meta_value AS serial,
                    p.post_author AS user_id,
                    p.post_date AS registered_at
             FROM {$wpdb->postmeta} pm
             INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
             LEFT JOIN {$wpdb->prefix}dinoco_sn_pool sp
                 ON sp.sn = pm.meta_value
             WHERE pm.meta_key = 'serial_code'
               AND pm.meta_value != ''
               AND sp.sn IS NULL
             LIMIT %d", $batch_size
        ) );
        if ( empty( $rows ) ) break;

        foreach ( $rows as $r ) {
            $wpdb->insert( $wpdb->prefix . 'dinoco_sn_pool', array(
                'sn'                     => strtoupper( $r->serial ),
                'status'                 => 'registered',
                'registered_user_id'     => $r->user_id,
                'registered_warranty_id' => $r->post_id,
                'registered_at'          => $r->registered_at,
                'batch_id'               => 0, // legacy batch
                'created_at'             => current_time( 'mysql' ),
            ), array( '%s', '%s', '%d', '%d', '%s', '%d', '%s' ) );
            $processed++;
        }
        usleep( 50000 ); // 50ms gap
    } while ( true );

    // 4. Verify count parity post-backfill
    $pool_count_after = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->prefix}dinoco_sn_pool"
    );

    return array(
        'legacy_count'      => $legacy_count,
        'pool_count_before' => $pool_count,
        'pool_count_after'  => $pool_count_after,
        'processed'         => $processed,
        'parity_ok'         => ( $pool_count_after >= $legacy_count ),
    );
}
```

**Acceptance criteria**:
- `parity_ok === true` (sn_pool ≥ legacy)
- 0 errors during chunked insert
- Telegram alert บอส when complete (estimate 5-30 min for 100k rows)

**Status**: ⏸️ Pending — script to be added to Manager snippet as REST endpoint `/dinoco-sn/v1/admin/w7-backfill` (admin only)

---

### Step 3 — Set flag `dinoco_sn_dual_source_enabled=true`

ตั้ง flag dual-source mode — **read both** sn_pool AND legacy ACF, prefer sn_pool

```bash
wp option update dinoco_sn_dual_source_enabled 1
```

**Behavior**:
- Member Dashboard 3 snippets V.31 read sn_pool first → fallback ACF if missing
- Legacy ACF entries are STILL written (backward compat)
- New activations write to sn_pool ONLY (no ACF mirror needed)

**Why this step exists**: ขั้นที่ 4 atomic deploy 3 snippets ใช้เวลา ~30s — ใน window นี้ snippet หนึ่งเป็น V.31 อีกอันเป็น V.30. Dual-source flag ทำให้ V.31 + V.30 ทั้งคู่ทำงานได้ (fallback path) → no broken render.

---

### Step 4 — Deploy 3 dashboard snippets V.31.0 (atomic GitHub push)

**ดีพลอยพร้อมกัน 1 commit + 1 push**:

```bash
git add "[System] Member Dashboard Main" "[System] Dashboard - Header & Forms" "[System] Dashboard - Assets List"
git commit -m "feat(sn): Phase 2 W7 — Member Dashboard 3 snippets atomic deploy V.31.0"
git push origin main
```

GitHub Webhook Sync จะ pull + sync 3 snippets เป็น batch (~30s) ใน WordPress.

**Pre-flight checks ก่อน push**:
- [ ] All 3 snippets PHP syntax clean
- [ ] PHPUnit + Jest pass
- [ ] Tier badge helper exists in Header & Forms (V.31.0)
- [ ] Banner system in Member Dashboard Main (V.31.0)
- [ ] Asset card states wired in Assets List (V.31.0)
- [ ] Dual-source fallback paths present (read sn_pool first, ACF fallback)
- [ ] Function-existence guards on all SN helper calls

**Risk window**: ~30s (between sync of snippet 1 and snippet 3) — dual-source flag mitigates

---

### Step 5 — Monitor 24h then flip `dinoco_sn_dual_source_enabled=false`

**Phase 5a (T+0 to T+24h)**:
- Monitor `wp_dinoco_sn_audit` for fallback-to-ACF events
- LINE Flex alert บอส if: 
  - >5% of dashboard renders use ACF fallback (suggests backfill incomplete)
  - Any inconsistency: sn_pool empty AND ACF has data
- Track via NEW cron `dinoco_sn_dual_source_monitor_cron` every 1h

**Phase 5b (T+24h)**:
- If 0 critical issues + 0 fallback events for 24h → flip flag OFF
- `wp option update dinoco_sn_dual_source_enabled 0`
- Member Dashboard reads sn_pool ONLY — legacy ACF becomes write-only

**Phase 5c (T+30 days)**:
- Stop writing legacy ACF (sn_pool becomes single source of truth)
- Plan v2.13 Phase 3 deprecation cycle

---

## ⚠️ Rollback Procedure (any step fails)

### From Step 3-4 issue (during deploy):
```bash
# Revert dual-source flag
wp option update dinoco_sn_dual_source_enabled 0

# Revert 3 dashboard snippets via GitHub
git revert <commit-hash-of-W7-deploy>
git push origin main
# Webhook auto-syncs reverted V.30 versions back to WP
```

### From Step 5 issue (post-deploy):
```bash
# Re-enable dual-source flag (don't revert snippets)
wp option update dinoco_sn_dual_source_enabled 1
# This makes V.31 fall back to ACF — same behavior as during deploy
```

### Hard rollback (worst case):
```bash
# Disable entire SN system — instant
wp option update dinoco_sn_system_enabled 0

# All REST endpoints return 503
# All shortcodes show maintenance message
# Existing ACF + warranty_registration CPT keep working (untouched)
```

**Recovery time**: < 30s for soft rollback (option update) · Instant for hard rollback

---

## 🧪 W7.5 Acceptance Test Cases

| # | Test | Expected |
|---|---|---|
| W7.5-T1 | Backfill 100k legacy entries → verify count parity | `parity_ok === true` |
| W7.5-T2 | Customer with only legacy ACF data opens dashboard | Show V.31 UI + fallback to ACF (no error) |
| W7.5-T3 | Customer with mixed (some legacy + some sn_pool) | Hybrid render works |
| W7.5-T4 | Customer with all sn_pool entries | Full V.31 UI (banners + tier badge + new card states) |
| W7.5-T5 | During Step 4 deploy window (Header V.31, Main V.30) | dual-source flag enables both versions to render |
| W7.5-T6 | Step 5 flag OFF — sn_pool empty for some user | Show empty dashboard (no error, no ACF fallback) |
| W7.5-T7 | Hard rollback — `dinoco_sn_system_enabled=0` | All shortcodes show maintenance, no breakage |
| W7.5-T8 | Tier badge — user has no LTV snapshot | No badge rendered (graceful empty) |
| W7.5-T9 | Banner system — 5 expiring plates exist | Limit 3 on home + scrollable to rest |
| W7.5-T10 | Card state — claimed plate | Shows blue tint + "⏳ กำลังเคลม" badge |

---

## 📊 Deploy Day Schedule

```
T-24h: Final QA pass (acceptance test 50/50 from doc 11)
T-1h:  Pre-flight check (Step 4 pre-flight checklist)
T-0:   Step 2 backfill cron triggered
       → wait for parity_ok (~5-30 min for 100k rows)
T+30m: Step 3 — flip dual_source_enabled=true
T+31m: Step 4 — git push 3 dashboard snippets V.31.0
T+32m: Webhook auto-sync (~30s deploy window)
T+33m: Manual smoke test 5 customer accounts (legacy + new + mixed)
T+34m: Telegram alert บอส "Step 4 complete + smoke test ok"
T+24h: Step 5a — monitor cron 1h interval
T+48h: Step 5b — flip dual_source_enabled=false (if no issues)
T+30d: Step 5c — stop writing legacy ACF
```

**Total deploy day**: ~1 hour active work + 24h monitoring window

---

## 🔗 Cross-references

- `~/.claude/plans/wiki-doc-sequential-lantern.md` v2.12 §B4 atomic deploy spec
- `docs/sn-system/10-go-live-gate-checklist.md` — F1-F5 flip schedule (W7 = F1 ON gate)
- `docs/sn-system/11-phase1-w4-internal-qa-acceptance-test.md` — Phase 1 W4 50 cases
- `[Admin System] DINOCO Production SN Manager` V.0.26 — backfill REST endpoint to be added
