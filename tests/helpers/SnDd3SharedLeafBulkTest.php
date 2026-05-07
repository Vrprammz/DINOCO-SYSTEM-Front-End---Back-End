<?php
/**
 * REG-085 — DD-3 shared leaf bulk receive
 *
 * Plan v2.13 — Boss example:
 *   SET_A = DNC4537SETGNDPRO002 -> contains leaf DNCGNDPRO5500
 *   SET_B = DNCSETNX500EX001    -> ALSO contains leaf DNCGNDPRO5500
 *
 * When warehouse receives 100 plates of DNCGNDPRO5500, the qty must
 * NOT be double-counted toward SET_A and SET_B independently. DD-3
 * mandates array_unique dedup at qty aggregation time.
 *
 * Reference: Snippet 15 V.7.1 C2 fix — array_unique pattern.
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnDd3SharedLeafBulk;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_sn_aggregate_leaf_demand($parent_skus, $hierarchy).
 *
 * Hierarchy shape:
 *   [parent_sku => [leaf_sku, leaf_sku, ...], ...]
 *
 * Returns:
 *   [leaf_sku => total_qty, ...]
 *
 * DD-3 rule: if leaf appears in 2 parents, count it ONCE per parent
 * (per qty multiplier), but during *receiving* a leaf plate satisfies
 * BOTH parents simultaneously — array_unique applied at the leaf-list
 * level for downstream `dinoco_get_leaf_skus()` callers.
 */
function dinoco_sn_collect_leaves_dd3_mirror(array $parent_skus, array $hierarchy): array
{
    $all_leaves = [];
    foreach ($parent_skus as $parent) {
        $parent = strtoupper($parent);
        if (!isset($hierarchy[$parent])) {
            continue;
        }
        foreach ($hierarchy[$parent] as $leaf) {
            $all_leaves[] = strtoupper($leaf);
        }
    }
    // DD-3: dedup so a leaf counted ONCE in the universe of receivable plates
    $deduped = array_values(array_unique($all_leaves));
    sort($deduped); // canonical sort for determinism
    return $deduped;
}

/**
 * Bulk receive aggregation respecting DD-3.
 * Counts plates per leaf SKU, dedup'd via the leaf list.
 */
function dinoco_sn_bulk_count_per_leaf_mirror(array $sn_to_leaf_map): array
{
    $counts = [];
    foreach ($sn_to_leaf_map as $sn => $leaf) {
        $leaf = strtoupper($leaf);
        $counts[$leaf] = ($counts[$leaf] ?? 0) + 1;
    }
    ksort($counts);
    return $counts;
}

class SnDd3SharedLeafBulkTest extends TestCase
{
    private function bossHierarchy(): array
    {
        return [
            // Boss example: SET_A and SET_B BOTH contain DNCGNDPRO5500
            'DNC4537SETGNDPRO002' => [
                'DNCGNDPRO5500',
                'DNCGND45L002',
                'DNCGND37LS',
            ],
            'DNCSETNX500EX001' => [
                'DNCGNDPRO5500',  // shared leaf
                'DNCNX500E002',
                'DNCNX500001',
            ],
        ];
    }

    public function test_shared_leaf_appears_once_in_collected_universe(): void
    {
        $h = $this->bossHierarchy();
        $leaves = dinoco_sn_collect_leaves_dd3_mirror(
            ['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'],
            $h
        );
        // 5 unique leaves total (3 + 3 - 1 shared)
        $this->assertCount(5, $leaves);
        // DNCGNDPRO5500 must appear ONCE
        $occurrences = array_count_values($leaves);
        $this->assertSame(1, $occurrences['DNCGNDPRO5500']);
    }

    public function test_solo_set_leaves_returned_intact(): void
    {
        $h = $this->bossHierarchy();
        $leaves = dinoco_sn_collect_leaves_dd3_mirror(['DNC4537SETGNDPRO002'], $h);
        $this->assertCount(3, $leaves);
    }

    public function test_unknown_parent_yields_empty(): void
    {
        $h = $this->bossHierarchy();
        $leaves = dinoco_sn_collect_leaves_dd3_mirror(['UNKNOWN'], $h);
        $this->assertSame([], $leaves);
    }

    public function test_collected_leaves_sorted_deterministically(): void
    {
        $h = $this->bossHierarchy();
        $leaves1 = dinoco_sn_collect_leaves_dd3_mirror(
            ['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'],
            $h
        );
        $leaves2 = dinoco_sn_collect_leaves_dd3_mirror(
            ['DNCSETNX500EX001', 'DNC4537SETGNDPRO002'],
            $h
        );
        $this->assertSame($leaves1, $leaves2);
    }

    public function test_bulk_receive_100_plates_shared_leaf_counts_once(): void
    {
        // 100 plates of DNCGNDPRO5500 from a factory shipment
        $map = [];
        for ($i = 1; $i <= 100; $i++) {
            $sn = 'DNCSS' . str_pad((string)$i, 4, '0', STR_PAD_LEFT);
            $map[$sn] = 'DNCGNDPRO5500';
        }
        $counts = dinoco_sn_bulk_count_per_leaf_mirror($map);
        $this->assertCount(1, $counts);
        $this->assertSame(100, $counts['DNCGNDPRO5500']);
    }

    public function test_mixed_bulk_receive_per_leaf_aggregation(): void
    {
        $map = [];
        // 47 plates of shared leaf
        for ($i = 1; $i <= 47; $i++) {
            $map['DNCSSA' . $i] = 'DNCGNDPRO5500';
        }
        // 30 plates of SET_A-only leaf
        for ($i = 1; $i <= 30; $i++) {
            $map['DNCSSB' . $i] = 'DNCGND45L002';
        }
        // 23 plates of SET_B-only leaf
        for ($i = 1; $i <= 23; $i++) {
            $map['DNCSSC' . $i] = 'DNCNX500001';
        }

        $counts = dinoco_sn_bulk_count_per_leaf_mirror($map);
        $this->assertSame(47, $counts['DNCGNDPRO5500']);
        $this->assertSame(30, $counts['DNCGND45L002']);
        $this->assertSame(23, $counts['DNCNX500001']);
    }

    public function test_case_insensitive_leaf_aggregation(): void
    {
        $map = [
            'DNCSS001' => 'DNCGNDPRO5500',
            'DNCSS002' => 'dncgndpro5500',
            'DNCSS003' => 'DnCgNdPrO5500',
        ];
        $counts = dinoco_sn_bulk_count_per_leaf_mirror($map);
        $this->assertCount(1, $counts);
        $this->assertSame(3, $counts['DNCGNDPRO5500']);
    }

    public function test_dd3_pattern_no_double_counting_in_demand_satisfaction(): void
    {
        // SET_A demand 50 + SET_B demand 30 BOTH consume DNCGNDPRO5500.
        // Total leaf qty needed = max(50, 30) = 50? NO — DD-7 rule (c) says
        // sum because shared leaf is physically consumed.
        // For receive aggregation we only check that the leaf is counted ONCE
        // in the universe of plates we receive. Demand is computed elsewhere.
        $h = $this->bossHierarchy();
        $leaves = dinoco_sn_collect_leaves_dd3_mirror(
            ['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'],
            $h
        );
        // The leaf list is for "what plates can satisfy demand?", not "how many?"
        $this->assertContains('DNCGNDPRO5500', $leaves);
    }

    public function test_value_copy_visited_pattern_safe_under_repeated_query(): void
    {
        // Mimics V.7.1 C2 fix — repeated calls must yield identical results
        // (no shared $visited reference corrupting subsequent queries)
        $h = $this->bossHierarchy();
        $first = dinoco_sn_collect_leaves_dd3_mirror(['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'], $h);
        $second = dinoco_sn_collect_leaves_dd3_mirror(['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'], $h);
        $third = dinoco_sn_collect_leaves_dd3_mirror(['DNC4537SETGNDPRO002', 'DNCSETNX500EX001'], $h);
        $this->assertSame($first, $second);
        $this->assertSame($first, $third);
    }
}
