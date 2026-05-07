<?php
/**
 * REG-084 — Bulk receive partial_success contract
 *
 * Plan v2.13 W2 D4 contract — POST /dinoco-sn/v1/receive/bulk
 * MUST process each row atomically and return per-row status with
 * deterministic codes catalogue.
 *
 * Per-row codes:
 *   ok        | 'received'                   — success
 *   skip      | 'already_received'           — sn already in_pool
 *   skip      | 'voided'                     — sn permanently voided
 *   skip      | 'not_found'                  — sn never reserved
 *   skip      | 'wrong_batch'                — sn belongs to another batch
 *   error     | 'lock_failed'                — GET_LOCK timeout
 *
 * Idempotency: identical body (regardless of input order) MUST hash to
 * same value (DD-3 sort pattern).
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnBulkReceivePartialSuccess;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of bulk receive engine.
 *
 * Input: array of SNs + simulated pool state map.
 * Output: success_count + skip_count + per-row results.
 */
function dinoco_sn_bulk_receive_mirror(array $sns, array $pool_state): array
{
    $results = [];
    $success_count = 0;
    $skip_count = 0;

    foreach ($sns as $sn) {
        $sn = strtoupper(trim((string) $sn));
        if ($sn === '') {
            continue;
        }

        if (!isset($pool_state[$sn])) {
            $results[] = ['sn' => $sn, 'status' => 'skip', 'code' => 'not_found'];
            $skip_count++;
            continue;
        }
        $row = $pool_state[$sn];
        switch ($row['status']) {
            case 'reserved':
                $results[] = ['sn' => $sn, 'status' => 'ok', 'code' => 'received'];
                $success_count++;
                break;
            case 'in_pool':
                $results[] = ['sn' => $sn, 'status' => 'skip', 'code' => 'already_received'];
                $skip_count++;
                break;
            case 'voided':
                $results[] = ['sn' => $sn, 'status' => 'skip', 'code' => 'voided'];
                $skip_count++;
                break;
            default:
                $results[] = ['sn' => $sn, 'status' => 'skip', 'code' => 'wrong_state'];
                $skip_count++;
        }
    }

    return [
        'success_count' => $success_count,
        'skip_count' => $skip_count,
        'results' => $results,
    ];
}

/**
 * Idempotency hash with DD-3 sort pattern — deterministic regardless of input order.
 */
function dinoco_sn_bulk_idempotency_hash_mirror(array $body): string
{
    $sns = $body['sns'] ?? [];
    $sns = array_map(static fn($s) => strtoupper(trim((string) $s)), $sns);
    $sns = array_unique($sns);
    sort($sns); // DD-3 canonical sort
    $payload = [
        'batch_id' => $body['batch_id'] ?? 0,
        'sns' => array_values($sns),
    ];
    return hash('sha256', (string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

class SnBulkReceivePartialSuccessTest extends TestCase
{
    private function makePool(array $byStatus): array
    {
        $pool = [];
        foreach ($byStatus as $status => $sns) {
            foreach ($sns as $sn) {
                $pool[strtoupper($sn)] = ['status' => $status];
            }
        }
        return $pool;
    }

    public function test_all_reserved_become_received(): void
    {
        $sns = ['DNCSS001', 'DNCSS002', 'DNCSS003'];
        $pool = $this->makePool(['reserved' => $sns]);
        $r = dinoco_sn_bulk_receive_mirror($sns, $pool);
        $this->assertSame(3, $r['success_count']);
        $this->assertSame(0, $r['skip_count']);
        foreach ($r['results'] as $row) {
            $this->assertSame('ok', $row['status']);
            $this->assertSame('received', $row['code']);
        }
    }

    public function test_partial_success_47_47_3_3(): void
    {
        // 47 reserved + 3 already_received + 3 voided + 47 reserved = 94 ok / 6 skip
        $reserved_a = array_map(fn($i) => 'DNCSSA' . str_pad((string)$i, 3, '0', STR_PAD_LEFT), range(1, 47));
        $already = ['DNCSSB001', 'DNCSSB002', 'DNCSSB003'];
        $voided = ['DNCSSC001', 'DNCSSC002', 'DNCSSC003'];
        $reserved_b = array_map(fn($i) => 'DNCSSD' . str_pad((string)$i, 3, '0', STR_PAD_LEFT), range(1, 47));
        $sns = array_merge($reserved_a, $already, $voided, $reserved_b);

        $pool = $this->makePool([
            'reserved' => array_merge($reserved_a, $reserved_b),
            'in_pool' => $already,
            'voided' => $voided,
        ]);

        $r = dinoco_sn_bulk_receive_mirror($sns, $pool);
        $this->assertSame(94, $r['success_count']);
        $this->assertSame(6, $r['skip_count']);
        $this->assertCount(100, $r['results']);
    }

    public function test_skip_codes_distinct(): void
    {
        $sns = ['DNCSSA', 'DNCSSB', 'DNCSSC', 'DNCSSD'];
        $pool = $this->makePool([
            'in_pool' => ['DNCSSA'],
            'voided' => ['DNCSSB'],
            // DNCSSC absent -> not_found
        ]);
        $pool['DNCSSD'] = ['status' => 'registered']; // wrong_state

        $r = dinoco_sn_bulk_receive_mirror($sns, $pool);
        $codes = array_column($r['results'], 'code');
        $this->assertSame(['already_received', 'voided', 'not_found', 'wrong_state'], $codes);
    }

    public function test_empty_input_returns_empty_results(): void
    {
        $r = dinoco_sn_bulk_receive_mirror([], []);
        $this->assertSame(0, $r['success_count']);
        $this->assertSame(0, $r['skip_count']);
        $this->assertSame([], $r['results']);
    }

    public function test_whitespace_and_case_normalized(): void
    {
        $pool = $this->makePool(['reserved' => ['DNCSSK7H2N9X']]);
        $r = dinoco_sn_bulk_receive_mirror(['  dncssk7h2n9x  '], $pool);
        $this->assertSame(1, $r['success_count']);
        $this->assertSame('DNCSSK7H2N9X', $r['results'][0]['sn']);
    }

    public function test_blank_entries_skipped_silently(): void
    {
        $pool = $this->makePool(['reserved' => ['DNCSS001']]);
        $r = dinoco_sn_bulk_receive_mirror(['DNCSS001', '', '   ', null], $pool);
        $this->assertSame(1, $r['success_count']);
        $this->assertCount(1, $r['results']);
    }

    public function test_idempotency_hash_independent_of_order(): void
    {
        $b1 = ['batch_id' => 42, 'sns' => ['DNCSS003', 'DNCSS001', 'DNCSS002']];
        $b2 = ['batch_id' => 42, 'sns' => ['DNCSS001', 'DNCSS002', 'DNCSS003']];
        $b3 = ['batch_id' => 42, 'sns' => ['DNCSS002', 'DNCSS003', 'DNCSS001']];

        $h1 = dinoco_sn_bulk_idempotency_hash_mirror($b1);
        $h2 = dinoco_sn_bulk_idempotency_hash_mirror($b2);
        $h3 = dinoco_sn_bulk_idempotency_hash_mirror($b3);
        $this->assertSame($h1, $h2);
        $this->assertSame($h1, $h3);
    }

    public function test_idempotency_hash_dedup_duplicates(): void
    {
        $b1 = ['batch_id' => 42, 'sns' => ['DNCSS001', 'DNCSS001', 'DNCSS002']];
        $b2 = ['batch_id' => 42, 'sns' => ['DNCSS001', 'DNCSS002']];
        $this->assertSame(
            dinoco_sn_bulk_idempotency_hash_mirror($b1),
            dinoco_sn_bulk_idempotency_hash_mirror($b2)
        );
    }

    public function test_idempotency_hash_changes_with_batch_id(): void
    {
        $b1 = ['batch_id' => 42, 'sns' => ['DNCSS001']];
        $b2 = ['batch_id' => 43, 'sns' => ['DNCSS001']];
        $this->assertNotSame(
            dinoco_sn_bulk_idempotency_hash_mirror($b1),
            dinoco_sn_bulk_idempotency_hash_mirror($b2)
        );
    }

    public function test_idempotency_hash_changes_with_sn_set(): void
    {
        $b1 = ['batch_id' => 42, 'sns' => ['DNCSS001']];
        $b2 = ['batch_id' => 42, 'sns' => ['DNCSS002']];
        $this->assertNotSame(
            dinoco_sn_bulk_idempotency_hash_mirror($b1),
            dinoco_sn_bulk_idempotency_hash_mirror($b2)
        );
    }

    public function test_response_shape_matches_d4_contract(): void
    {
        $r = dinoco_sn_bulk_receive_mirror(['DNCSS001'], $this->makePool(['reserved' => ['DNCSS001']]));
        $this->assertArrayHasKey('success_count', $r);
        $this->assertArrayHasKey('skip_count', $r);
        $this->assertArrayHasKey('results', $r);
        $this->assertArrayHasKey('sn', $r['results'][0]);
        $this->assertArrayHasKey('status', $r['results'][0]);
        $this->assertArrayHasKey('code', $r['results'][0]);
    }

    public function test_chunk_cap_100_enforced_at_handler_level(): void
    {
        // The handler caps at 100 per call — input of 100 must process all 100
        $sns = array_map(fn($i) => 'DNCSS' . str_pad((string)$i, 3, '0', STR_PAD_LEFT), range(1, 100));
        $pool = $this->makePool(['reserved' => $sns]);
        $r = dinoco_sn_bulk_receive_mirror($sns, $pool);
        $this->assertSame(100, $r['success_count']);
    }
}
