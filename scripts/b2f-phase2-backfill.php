<?php
/**
 * =============================================================================
 * B2F Phase 2 Backfill Script V.1.0
 * =============================================================================
 *
 * วัตถุประสงค์:
 *   One-time migration: copy b2f_maker_product CPT → wp_dinoco_product_makers
 *   + inject orphan SETs (SET ที่ maker มี children ครบ แต่ SET ยังไม่ register)
 *
 * Safety:
 *   - Require: option 'b2f_schema_v10_activated' must exist (schema activated)
 *   - Transaction: ALL-OR-NOTHING (rollback on any error)
 *   - Idempotent: UPSERT via ON DUPLICATE KEY UPDATE — re-run ไม่ duplicate
 *   - Dry-run mode: ?dry_run=1 → count only, no insert
 *   - Capability: manage_options
 *   - Resource: set_time_limit(600), memory 512M
 *
 * Usage:
 *   1. CLI:      php scripts/b2f-phase2-backfill.php [--dry-run] [--json]
 *   2. Browser:  https://site.com/.../scripts/b2f-phase2-backfill.php?dry_run=1
 *   3. REST:     POST /wp-json/dinoco-b2f-audit/v1/backfill { dry_run: true|false }
 *
 * Expected result (current data):
 *   - cpt_migrated: 103 (from b2f_maker_product CPT)
 *   - orphans_added: 13 (HTP 9 + Test Fac2 4)
 *   - Total junction rows: 116
 *
 * =============================================================================
 */

// --- Load WordPress ---------------------------------------------------------
if (!defined('ABSPATH')) {
    $wp_load_candidates = [
        __DIR__ . '/../../../../wp-load.php',
        __DIR__ . '/../../../wp-load.php',
        __DIR__ . '/../../wp-load.php',
        __DIR__ . '/../wp-load.php',
    ];
    $loaded = false;
    foreach ($wp_load_candidates as $candidate) {
        if (file_exists($candidate)) {
            require_once $candidate;
            $loaded = true;
            break;
        }
    }
    if (!$loaded) {
        fwrite(STDERR, "ERROR: Cannot locate wp-load.php\n");
        exit(1);
    }
}

// --- Resource limits --------------------------------------------------------
@set_time_limit(600);
@ini_set('memory_limit', '512M');

// --- Capability check -------------------------------------------------------
if (php_sapi_name() !== 'cli') {
    if (!function_exists('current_user_can') || !current_user_can('manage_options')) {
        status_header(403);
        wp_die('Unauthorized — admin only', 'Forbidden', ['response' => 403]);
    }
}

// --- Kill switch ------------------------------------------------------------
if (defined('B2F_DISABLED') && B2F_DISABLED) {
    $err = ['success' => false, 'error' => 'B2F module disabled (B2F_DISABLED=true)'];
    if (php_sapi_name() !== 'cli') {
        header('Content-Type: application/json');
        echo json_encode($err);
    } else {
        fwrite(STDERR, json_encode($err) . "\n");
    }
    exit(1);
}

/**
 * Main backfill function — callable from REST endpoint or CLI
 *
 * @param bool $dry_run    If true, count only, no DB writes
 * @param int  $actor_uid  WP user ID (for audit trail — created_by/updated_by)
 * @return array { success, cpt_migrated, orphans_added, skipped, errors[], dry_run }
 */
function b2f_phase2_run_backfill($dry_run = false, $actor_uid = 0) {
    global $wpdb;

    $result = [
        'success'        => false,
        'dry_run'        => (bool) $dry_run,
        'cpt_migrated'   => 0,
        'orphans_added'  => 0,
        'skipped'        => 0,
        'errors'         => [],
        'started_at'     => current_time('mysql'),
        'finished_at'    => null,
    ];

    // --- Guard 1: schema activated ---
    $activated = get_option('b2f_schema_v10_activated', 0);
    if (!$activated) {
        $result['errors'][] = 'Schema V10 ยังไม่ activate — เรียก b2f_audit_activate_schema_v10() ก่อน';
        return $result;
    }

    $tbl = $wpdb->prefix . 'dinoco_product_makers';

    // --- Guard 2: junction table exists ---
    $exists = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
        DB_NAME, $tbl
    ));
    if (!$exists) {
        $result['errors'][] = "Table {$tbl} ไม่มีอยู่จริง — run activation อีกครั้ง";
        return $result;
    }

    // --- STEP 1: Load all b2f_maker_product CPTs ---
    $maker_products = get_posts([
        'post_type'      => 'b2f_maker_product',
        'post_status'    => ['publish', 'draft'],
        'posts_per_page' => -1,
        'fields'         => 'ids',
        'no_found_rows'  => true,
    ]);

    // --- STEP 2: Open transaction (unless dry_run) ---
    if (!$dry_run) {
        $wpdb->query('START TRANSACTION');
    }

    $actor_uid = intval($actor_uid);
    $now = current_time('mysql');

    // --- STEP 3: Copy CPT → junction ---
    foreach ($maker_products as $mp_id) {
        try {
            // CORRECT ACF field names (was buggy `product_sku` → `mp_product_sku`)
            $sku       = function_exists('get_field') ? get_field('mp_product_sku', $mp_id) : '';
            $maker_id  = function_exists('get_field') ? get_field('mp_maker_id', $mp_id) : 0;
            $unit_cost = function_exists('get_field') ? floatval(get_field('mp_unit_cost', $mp_id)) : 0;
            $moq       = function_exists('get_field') ? intval(get_field('mp_moq', $mp_id)) : 1;
            $lead_time = function_exists('get_field') ? intval(get_field('mp_lead_time_days', $mp_id)) : 7;
            $ship_land = function_exists('get_field') ? floatval(get_field('mp_shipping_land', $mp_id)) : 0;
            $ship_sea  = function_exists('get_field') ? floatval(get_field('mp_shipping_sea', $mp_id)) : 0;
            $notes     = function_exists('get_field') ? (get_field('mp_notes', $mp_id) ?: '') : '';
            $status    = function_exists('get_field') ? (get_field('mp_status', $mp_id) ?: 'active') : 'active';

            $sku = strtoupper(trim((string) $sku));
            $maker_id = intval($maker_id);
            if (!$sku || !$maker_id) {
                $result['skipped']++;
                continue;
            }

            // Whitelist status
            if (!in_array($status, ['active', 'discontinued', 'pending'], true)) {
                $status = 'active';
            }

            if ($moq < 1) $moq = 1;
            if ($lead_time < 0) $lead_time = 7;

            if ($dry_run) {
                $result['cpt_migrated']++;
                continue;
            }

            // UPSERT: insert or update if (product_sku, maker_id) exists
            $sql = $wpdb->prepare(
                "INSERT INTO {$tbl}
                    (product_sku, maker_id, unit_cost, moq, lead_time_days,
                     shipping_land, shipping_sea, status, notes,
                     legacy_cpt_id, created_by, updated_by, created_at, updated_at)
                 VALUES (%s, %d, %f, %d, %d, %f, %f, %s, %s, %d, %d, %d, %s, %s)
                 ON DUPLICATE KEY UPDATE
                    unit_cost      = VALUES(unit_cost),
                    moq            = VALUES(moq),
                    lead_time_days = VALUES(lead_time_days),
                    shipping_land  = VALUES(shipping_land),
                    shipping_sea   = VALUES(shipping_sea),
                    status         = VALUES(status),
                    notes          = VALUES(notes),
                    legacy_cpt_id  = VALUES(legacy_cpt_id),
                    updated_by     = VALUES(updated_by),
                    updated_at     = VALUES(updated_at)",
                $sku, $maker_id, $unit_cost, $moq, $lead_time,
                $ship_land, $ship_sea, $status, $notes,
                $mp_id, $actor_uid, $actor_uid, $now, $now
            );
            $ok = $wpdb->query($sql);
            if ($ok === false) {
                throw new Exception('INSERT failed mp_id=' . $mp_id . ' — ' . $wpdb->last_error);
            }
            $result['cpt_migrated']++;

        } catch (Throwable $e) {
            $result['errors'][] = 'mp_id=' . $mp_id . ': ' . $e->getMessage();
            if (!$dry_run) {
                $wpdb->query('ROLLBACK');
                $result['finished_at'] = current_time('mysql');
                return $result;
            }
        }
    }

    // --- STEP 4: Inject orphan SETs (reuse audit helper — STRICT RULE V.1.1) ---
    if (!function_exists('b2f_audit_get_orphan_sets')) {
        if (!$dry_run) $wpdb->query('ROLLBACK');
        $result['errors'][] = 'b2f_audit_get_orphan_sets() ไม่พบ — ต้อง activate audit snippet V.1.1+';
        $result['finished_at'] = current_time('mysql');
        return $result;
    }

    $orphans = b2f_audit_get_orphan_sets();
    if (!is_array($orphans)) $orphans = [];

    foreach ($orphans as $orphan) {
        try {
            $sku      = strtoupper(trim((string)($orphan['orphan_sku'] ?? '')));
            $maker_id = intval($orphan['maker_id'] ?? 0);
            $leaves   = is_array($orphan['leaves'] ?? null) ? $orphan['leaves'] : [];

            if (!$sku || !$maker_id) {
                $result['skipped']++;
                continue;
            }

            // Compute SET cost = sum of registered leaves' unit_cost
            $sum_unit_cost = 0.0;
            $max_lead_time = 7;
            $sum_ship_land = 0.0;
            $sum_ship_sea  = 0.0;

            foreach ($leaves as $leaf_sku) {
                $leaf_sku_u = strtoupper(trim((string) $leaf_sku));
                $row = $wpdb->get_row($wpdb->prepare(
                    "SELECT unit_cost, lead_time_days, shipping_land, shipping_sea
                     FROM {$tbl}
                     WHERE product_sku = %s AND maker_id = %d AND deleted_at IS NULL
                     LIMIT 1",
                    $leaf_sku_u, $maker_id
                ), ARRAY_A);

                if ($row) {
                    $sum_unit_cost += floatval($row['unit_cost']);
                    $sum_ship_land += floatval($row['shipping_land']);
                    $sum_ship_sea  += floatval($row['shipping_sea']);
                    $lt = intval($row['lead_time_days']);
                    if ($lt > $max_lead_time) $max_lead_time = $lt;
                }
            }

            $notes_auto = 'Auto-added by Phase 2 migration ' . wp_date('Y-m-d') .
                          ' — leaves=' . implode(',', $leaves);

            if ($dry_run) {
                $result['orphans_added']++;
                continue;
            }

            $sql = $wpdb->prepare(
                "INSERT INTO {$tbl}
                    (product_sku, maker_id, unit_cost, moq, lead_time_days,
                     shipping_land, shipping_sea, status, notes,
                     legacy_cpt_id, created_by, updated_by, created_at, updated_at)
                 VALUES (%s, %d, %f, %d, %d, %f, %f, %s, %s, NULL, %d, %d, %s, %s)
                 ON DUPLICATE KEY UPDATE
                    -- ถ้ามีอยู่แล้ว (จาก CPT step ก่อนหน้า) ข้าม
                    id = id",
                $sku, $maker_id, $sum_unit_cost, 1, $max_lead_time,
                $sum_ship_land, $sum_ship_sea, 'active', $notes_auto,
                $actor_uid, $actor_uid, $now, $now
            );
            $ok = $wpdb->query($sql);
            if ($ok === false) {
                throw new Exception('Orphan INSERT failed sku=' . $sku . ' maker=' . $maker_id . ' — ' . $wpdb->last_error);
            }
            // affected_rows = 1 (new insert) or 0 (duplicate, preserved)
            if ($wpdb->rows_affected >= 1) {
                $result['orphans_added']++;
            } else {
                $result['skipped']++;
            }

        } catch (Throwable $e) {
            $result['errors'][] = 'orphan sku=' . ($sku ?? '?') . ' maker=' . ($maker_id ?? '?') . ': ' . $e->getMessage();
            if (!$dry_run) {
                $wpdb->query('ROLLBACK');
                $result['finished_at'] = current_time('mysql');
                return $result;
            }
        }
    }

    // --- STEP 5: Commit ---
    if (!$dry_run) {
        $wpdb->query('COMMIT');
        update_option('b2f_phase2_backfill_completed', time());
        update_option('b2f_phase2_backfill_last_result', $result);
    }

    $result['success'] = empty($result['errors']);
    $result['finished_at'] = current_time('mysql');

    if (function_exists('b2b_log')) {
        b2b_log(sprintf(
            '[B2F Phase2 Backfill] dry_run=%d success=%d cpt=%d orphans=%d skipped=%d errors=%d',
            $result['dry_run'] ? 1 : 0,
            $result['success'] ? 1 : 0,
            $result['cpt_migrated'],
            $result['orphans_added'],
            $result['skipped'],
            count($result['errors'])
        ));
    }

    return $result;
}

// --- Execution modes ---------------------------------------------------------
//
// Mode A (REST include via audit snippet):
//   POST /wp-json/dinoco-b2f-audit/v1/backfill sets globals:
//     $b2f_phase2_backfill_dry_run, $b2f_phase2_backfill_confirm
//   Endpoint @includes this file → we set $GLOBALS['b2f_phase2_backfill_result']
//   (and also `return` the array — endpoint checks both paths)
//
// Mode B (CLI):
//   php scripts/b2f-phase2-backfill.php [--dry-run] [--json]
//
// Mode C (Browser direct):
//   ?dry_run=1 → JSON output
//
// Library mode (opt-out auto-run): define B2F_PHASE2_BACKFILL_LIBRARY_ONLY=true
//   → just define b2f_phase2_run_backfill() and exit.

if (defined('B2F_PHASE2_BACKFILL_LIBRARY_ONLY')) return;

$b2f_is_rest_include = isset($b2f_phase2_backfill_dry_run) || isset($b2f_phase2_backfill_confirm);
$is_cli   = (php_sapi_name() === 'cli');
$dry_run  = false;
$json_out = false;

if ($b2f_is_rest_include) {
    // REST mode — respect globals set by endpoint
    $dry_run = !empty($b2f_phase2_backfill_dry_run);
    // confirm just gates the endpoint; we always execute when included
} elseif ($is_cli) {
    $argv_local = $_SERVER['argv'] ?? [];
    foreach ($argv_local as $arg) {
        if ($arg === '--dry-run') $dry_run = true;
        if ($arg === '--json')    $json_out = true;
    }
} else {
    $dry_run = !empty($_GET['dry_run']);
    $json_out = true;
}

$actor_uid = function_exists('get_current_user_id') ? get_current_user_id() : 0;
$res = b2f_phase2_run_backfill($dry_run, $actor_uid);

// Expose result to REST endpoint (dual path — return + global)
$GLOBALS['b2f_phase2_backfill_result'] = $res;

if ($b2f_is_rest_include) {
    // Do NOT echo when included — endpoint buffers output but expects return
    return $res;
}

if ($json_out) {
    if (!$is_cli) header('Content-Type: application/json; charset=utf-8');
    echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} else {
    echo "=== B2F Phase 2 Backfill Result ===\n";
    echo "dry_run:       " . ($res['dry_run'] ? 'YES' : 'NO') . "\n";
    echo "success:       " . ($res['success'] ? 'YES' : 'NO') . "\n";
    echo "cpt_migrated:  " . $res['cpt_migrated'] . "\n";
    echo "orphans_added: " . $res['orphans_added'] . "\n";
    echo "skipped:       " . $res['skipped'] . "\n";
    echo "errors:        " . count($res['errors']) . "\n";
    if (!empty($res['errors'])) {
        foreach ($res['errors'] as $err) echo "  - " . $err . "\n";
    }
}

// --- End of b2f-phase2-backfill.php ---
