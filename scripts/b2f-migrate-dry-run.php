<?php
/**
 * =============================================================================
 * B2F Migration Dry-Run Script V.1.0 (Phase 1 — observe-only)
 * =============================================================================
 *
 * วัตถุประสงค์:
 *   Simulate การ migrate จาก b2f_maker_product CPT → wp_dinoco_product_makers
 *   junction table **ไม่ write อะไรเลย** — เพียง output CSV report ของ actions
 *   ที่ Phase 2 migrator จะทำ เพื่อให้ admin review ก่อน commit
 *
 * Usage:
 *   1. CLI:      php scripts/b2f-migrate-dry-run.php > /tmp/b2f-dry-run.csv
 *   2. Browser:  https://site.com/wp-content/.../scripts/b2f-migrate-dry-run.php
 *                (ต้อง login admin ก่อน — capability check `manage_options`)
 *   3. REST:    GET /wp-json/dinoco-b2f-audit/v1/dry-run → trigger script
 *
 * Output CSV columns:
 *   maker_id, maker_name, sku, action, current_cost, computed_cost, reason, notes
 *
 * Actions:
 *   ADD           — SET ที่ leaves registered ครบ แต่ SET ยังไม่มี CPT → Phase 2 จะเพิ่ม
 *   FLAG_STALE    — CPT ที่ mp_unit_cost < sum_leaves × 0.1 (likely orphan ฿666)
 *   REMOVE_ORPHAN — CPT ที่ SKU ไม่อยู่ใน DINOCO_Catalog อีกแล้ว (ghost record)
 *
 * Safety:
 *   - ไม่ INSERT/UPDATE/DELETE อะไร (ทั้ง script read-only)
 *   - Capability check: `manage_options`
 *   - Memory/time: 256M / 300s (103 records × hierarchy walk safe)
 *   - Circular-ref guard: value-copy $visited per branch (V.7.1 C1/C2 pattern)
 *   - Streaming fputcsv (ไม่ build string ทั้งก้อน in-memory)
 *
 * Dependencies (verified exist):
 *   - DINOCO_Catalog::get_by_skus($skus)   — Snippet 15 V.7.3
 *   - dinoco_get_leaf_skus($sku)           — Snippet 15 V.6.0
 *   - dinoco_get_wac_for_skus($skus)       — Snippet 15 V.7.2
 *   - get_option('dinoco_sku_relations')   — global hierarchy
 *
 * =============================================================================
 */

// --- Load WordPress ---------------------------------------------------------
// Detect ABSPATH by walking up from script location
if (!defined('ABSPATH')) {
    $wp_load_candidates = [
        __DIR__ . '/../../../../wp-load.php',      // wp-content/plugins/.../scripts/
        __DIR__ . '/../../../wp-load.php',         // wp-content/uploads/.../scripts/
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
        fwrite(STDERR, "ERROR: Cannot locate wp-load.php — adjust paths in script\n");
        exit(1);
    }
}

// --- Resource limits --------------------------------------------------------
@set_time_limit(300);
@ini_set('memory_limit', '256M');

// --- Capability check -------------------------------------------------------
// เฉพาะ admin เท่านั้น (ป้องกัน public access)
if (php_sapi_name() !== 'cli') {
    if (!function_exists('current_user_can') || !current_user_can('manage_options')) {
        status_header(403);
        wp_die('Unauthorized — admin only', 'Forbidden', ['response' => 403]);
    }
}

// --- Helper: case-insensitive SKU normalization -----------------------------
function b2f_dryrun_upper($sku) {
    return strtoupper(trim((string)$sku));
}

// --- Helper: walk SKU hierarchy to find leaves (circular-ref guard) ---------
/**
 * Recursive walk ไปหา leaf SKUs ภายใต้ root
 *
 * CRITICAL: $visited เป็น value-copy per branch (ไม่ใช่ reference)
 * เพื่อป้องกัน V.7.1 C1/C2 bug — sibling branches share visited → infinite loop
 * ใน DD-3 shared child scenarios
 *
 * @param string $sku         Root SKU to walk
 * @param array  $rel_upper   sku_relations normalized to uppercase
 * @param array  $visited     Value-copy (not reference) — safe branching
 * @return array              List of leaf SKUs (unique)
 */
function b2f_dryrun_walk_to_leaves($sku, $rel_upper, $visited = []) {
    $sku = b2f_dryrun_upper($sku);
    if (isset($visited[$sku])) return []; // cycle guard
    $visited[$sku] = true;

    // ถ้า SKU นี้ไม่มี children → มันคือ leaf
    if (empty($rel_upper[$sku]) || !is_array($rel_upper[$sku])) {
        return [$sku];
    }

    $leaves = [];
    foreach ($rel_upper[$sku] as $child) {
        $child = b2f_dryrun_upper($child);
        // Recursive with VALUE-COPY $visited (per-branch isolation)
        $child_leaves = b2f_dryrun_walk_to_leaves($child, $rel_upper, $visited);
        foreach ($child_leaves as $leaf) {
            $leaves[] = $leaf;
        }
    }

    // Dedup (shared child under multiple branches of same root)
    return array_values(array_unique($leaves));
}

// --- Helper: find top-level SETs (SKUs ที่ไม่มี parent) ----------------------
function b2f_dryrun_find_top_level_sets($rel_upper) {
    $all_parents = array_keys($rel_upper);
    $all_children = [];
    foreach ($rel_upper as $children) {
        if (is_array($children)) {
            foreach ($children as $c) {
                $all_children[b2f_dryrun_upper($c)] = true;
            }
        }
    }
    // Top-level = parent แต่ไม่เป็น child ของใคร
    $tops = [];
    foreach ($all_parents as $p) {
        $p_upper = b2f_dryrun_upper($p);
        if (!isset($all_children[$p_upper])) {
            $tops[] = $p_upper;
        }
    }
    return $tops;
}

// --- STEP 1: Load data ------------------------------------------------------
$rel_raw = get_option('dinoco_sku_relations', []);
if (!is_array($rel_raw)) $rel_raw = [];

// Normalize keys + values to uppercase
$rel_upper = [];
foreach ($rel_raw as $parent => $children) {
    $p_upper = b2f_dryrun_upper($parent);
    if (!is_array($children)) continue;
    $rel_upper[$p_upper] = array_map('b2f_dryrun_upper', $children);
}

// Load all b2f_maker_product CPTs
$maker_products = get_posts([
    'post_type'      => 'b2f_maker_product',
    'post_status'    => ['publish', 'draft', 'pending'],
    'posts_per_page' => -1,
    'fields'         => 'ids',
    'no_found_rows'  => true,
]);

// Load all b2f_maker CPTs
$makers = get_posts([
    'post_type'      => 'b2f_maker',
    'post_status'    => 'publish',
    'posts_per_page' => -1,
    'no_found_rows'  => true,
]);

$maker_lookup = [];
foreach ($makers as $m) {
    $maker_lookup[$m->ID] = [
        'name'     => get_the_title($m),
        'currency' => function_exists('get_field') ? (get_field('maker_currency', $m->ID) ?: 'THB') : 'THB',
    ];
}

// Collect registrations indexed by maker_id + sku
$registrations = []; // [maker_id => [sku => { cpt_id, unit_cost, moq, ... }]]
foreach ($maker_products as $mp_id) {
    $sku       = function_exists('get_field') ? get_field('product_sku', $mp_id) : '';
    $maker_id  = function_exists('get_field') ? get_field('maker_id', $mp_id) : 0;
    $unit_cost = function_exists('get_field') ? floatval(get_field('unit_price', $mp_id)) : 0;
    $moq       = function_exists('get_field') ? intval(get_field('mp_moq', $mp_id)) : 1;

    if (!$sku || !$maker_id) continue;
    $sku_u = b2f_dryrun_upper($sku);
    if (!isset($registrations[$maker_id])) $registrations[$maker_id] = [];
    $registrations[$maker_id][$sku_u] = [
        'cpt_id'    => $mp_id,
        'unit_cost' => $unit_cost,
        'moq'       => $moq,
    ];
}

// Load catalog (batch)
$all_skus_in_scope = [];
foreach ($registrations as $maker_id => $skus) {
    foreach ($skus as $sku_u => $_) $all_skus_in_scope[$sku_u] = true;
}
// Plus all top-level SETs
$top_sets = b2f_dryrun_find_top_level_sets($rel_upper);
foreach ($top_sets as $t) $all_skus_in_scope[$t] = true;

$catalog_lookup = [];
if (class_exists('DINOCO_Catalog') && method_exists('DINOCO_Catalog', 'get_by_skus')) {
    $rows = DINOCO_Catalog::get_by_skus(array_keys($all_skus_in_scope));
    foreach ($rows as $row) {
        $catalog_lookup[b2f_dryrun_upper($row['sku'] ?? '')] = $row;
    }
}

// Load WAC for stale comparison
$wac_lookup = [];
if (function_exists('dinoco_get_wac_for_skus')) {
    $wac_lookup = dinoco_get_wac_for_skus(array_keys($all_skus_in_scope));
    if (!is_array($wac_lookup)) $wac_lookup = [];
}

// --- STEP 2: Compute actions per maker --------------------------------------
$actions = []; // accumulator

$stats = [
    'total_records'   => 0,
    'would_add'       => 0,
    'would_flag'      => 0,
    'would_remove'    => 0,
    'makers_analyzed' => count($maker_lookup),
];

foreach ($maker_lookup as $maker_id => $maker_info) {
    $maker_regs = $registrations[$maker_id] ?? [];
    $registered_skus = array_keys($maker_regs);
    $stats['total_records'] += count($registered_skus);

    // Build set of registered leaves (for should-register check)
    $registered_set = [];
    foreach ($registered_skus as $s) $registered_set[$s] = true;

    // === 2a. ADD: SETs ที่ leaves registered ครบ แต่ SET ยังไม่ register ===
    foreach ($top_sets as $set_sku) {
        if (isset($registered_set[$set_sku])) continue; // already registered

        // Walk SET → get leaves
        $leaves = b2f_dryrun_walk_to_leaves($set_sku, $rel_upper);
        if (empty($leaves)) continue;

        // Check: leaves ต้องอยู่ใน registered ครบทุกตัว
        $all_leaves_registered = true;
        $sum_leaves_cost = 0;
        foreach ($leaves as $lf) {
            if (!isset($registered_set[$lf])) {
                $all_leaves_registered = false;
                break;
            }
            $sum_leaves_cost += floatval($maker_regs[$lf]['unit_cost'] ?? 0);
        }

        if ($all_leaves_registered) {
            $actions[] = [
                'maker_id'      => $maker_id,
                'maker_name'    => $maker_info['name'],
                'sku'           => $set_sku,
                'action'        => 'ADD',
                'current_cost'  => 0,
                'computed_cost' => $sum_leaves_cost,
                'reason'        => 'SET leaves registered ครบ แต่ SET ยังไม่มี CPT',
                'notes'         => 'leaves=' . implode(',', $leaves),
            ];
            $stats['would_add']++;
        }
    }

    // === 2b. FLAG_STALE: mp_unit_cost < sum_leaves × 0.1 ===
    foreach ($maker_regs as $sku_u => $reg) {
        // Only check SKUs ที่เป็น SET (มี children)
        if (empty($rel_upper[$sku_u])) continue; // leaf — skip

        $leaves = b2f_dryrun_walk_to_leaves($sku_u, $rel_upper);
        if (empty($leaves)) continue;

        $sum_leaves = 0;
        $missing_leaf_cost = false;
        foreach ($leaves as $lf) {
            if (isset($maker_regs[$lf])) {
                $sum_leaves += floatval($maker_regs[$lf]['unit_cost']);
            } else {
                $missing_leaf_cost = true;
            }
        }

        if ($missing_leaf_cost || $sum_leaves <= 0) continue; // ไม่พอข้อมูล

        $threshold = $sum_leaves * 0.1;
        if ($reg['unit_cost'] < $threshold) {
            $actions[] = [
                'maker_id'      => $maker_id,
                'maker_name'    => $maker_info['name'],
                'sku'           => $sku_u,
                'action'        => 'FLAG_STALE',
                'current_cost'  => $reg['unit_cost'],
                'computed_cost' => $sum_leaves,
                'reason'        => sprintf('unit_cost=%.2f < %.2f (sum_leaves × 0.1) — likely orphan/฿666', $reg['unit_cost'], $threshold),
                'notes'         => 'cpt_id=' . $reg['cpt_id'] . ' leaves=' . implode(',', $leaves),
            ];
            $stats['would_flag']++;
        }
    }

    // === 2c. REMOVE_ORPHAN: CPT ที่ SKU ไม่อยู่ใน catalog ===
    foreach ($maker_regs as $sku_u => $reg) {
        if (!isset($catalog_lookup[$sku_u])) {
            $actions[] = [
                'maker_id'      => $maker_id,
                'maker_name'    => $maker_info['name'],
                'sku'           => $sku_u,
                'action'        => 'REMOVE_ORPHAN',
                'current_cost'  => $reg['unit_cost'],
                'computed_cost' => 0,
                'reason'        => 'SKU ไม่อยู่ใน wp_dinoco_products (ghost CPT)',
                'notes'         => 'cpt_id=' . $reg['cpt_id'],
            ];
            $stats['would_remove']++;
        }
    }
}

// --- STEP 3: Stream CSV output ---------------------------------------------
if (php_sapi_name() !== 'cli') {
    $filename = 'b2f-migrate-dry-run-' . date('Ymd-His') . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    // UTF-8 BOM for Excel Thai rendering
    echo "\xEF\xBB\xBF";
}

$out = fopen('php://output', 'w');

// Header row
fputcsv($out, [
    'maker_id', 'maker_name', 'sku', 'action',
    'current_cost', 'computed_cost', 'reason', 'notes'
]);

// Data rows (streaming — not buffered)
foreach ($actions as $row) {
    fputcsv($out, [
        $row['maker_id'],
        $row['maker_name'],
        $row['sku'],
        $row['action'],
        number_format($row['current_cost'], 2, '.', ''),
        number_format($row['computed_cost'], 2, '.', ''),
        $row['reason'],
        $row['notes'],
    ]);
}

// Summary footer
fputcsv($out, []);
fputcsv($out, ['# SUMMARY']);
fputcsv($out, ['# generated_at', date('Y-m-d H:i:s')]);
fputcsv($out, ['# makers_analyzed', $stats['makers_analyzed']]);
fputcsv($out, ['# total_records', $stats['total_records']]);
fputcsv($out, ['# would_add', $stats['would_add']]);
fputcsv($out, ['# would_flag_stale', $stats['would_flag']]);
fputcsv($out, ['# would_remove_orphan', $stats['would_remove']]);
fputcsv($out, ['# top_level_sets_found', count($top_sets)]);
fputcsv($out, ['# sku_relations_roots', count($rel_upper)]);

fclose($out);

// Log audit trail (don't block output)
if (function_exists('b2b_log')) {
    b2b_log(sprintf(
        '[B2F Dry-Run] makers=%d records=%d add=%d flag=%d remove=%d',
        $stats['makers_analyzed'],
        $stats['total_records'],
        $stats['would_add'],
        $stats['would_flag'],
        $stats['would_remove']
    ));
}

// --- End of b2f-migrate-dry-run.php ---
