<?php
/**
 * REG-081 — Claim FSM 11 statuses -> sn_pool sync (mock-based)
 *
 * Plan v2.13 W6.4 — verifies pure-logic mapper
 *   dinoco_sn_map_claim_to_pool_status($claim_status, $context)
 *
 * Replacement vs repair distinguished via $context['_b2b_replacement_sent'].
 * Revert path (rejected/cancelled) uses prev_status preservation.
 *
 * 11 claim statuses (Service Center canonical):
 *   pending, reviewing, approved, in_progress, waiting_parts,
 *   repairing, quality_check, completed, rejected, cancelled, closed
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnClaimSyncIntegration;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_sn_map_claim_to_pool_status().
 *
 * Context shape:
 *   [
 *     'prev_status' => string,                    // e.g. 'registered'
 *     '_b2b_replacement_sent' => bool|0|1,        // distinguishes complete-repair vs replacement
 *     'final_state' => string|null,               // for 'closed' status — final state hint
 *   ]
 *
 * Returns:
 *   [
 *     'pool_status' => string,    // target sn_pool.status
 *     'action' => string,         // 'enter_claim' | 'continue_claimed' | 'revert' | 'replace' | 'close_final'
 *     'preserve_prev' => bool,    // whether to write prev_status
 *   ]
 */
function dinoco_sn_map_claim_to_pool_status_mirror(string $claim_status, array $ctx = []): array
{
    $prev = $ctx['prev_status'] ?? 'registered';
    $replacement = !empty($ctx['_b2b_replacement_sent']);

    switch ($claim_status) {
        case 'pending':
            return [
                'pool_status' => 'claimed',
                'action' => 'enter_claim',
                'preserve_prev' => true,
            ];

        case 'reviewing':
        case 'approved':
        case 'in_progress':
        case 'waiting_parts':
        case 'repairing':
        case 'quality_check':
            return [
                'pool_status' => 'claimed',
                'action' => 'continue_claimed',
                'preserve_prev' => true,
            ];

        case 'completed':
            if ($replacement) {
                return [
                    'pool_status' => 'replaced',
                    'action' => 'replace',
                    'preserve_prev' => false,
                ];
            }
            // repair finished -> back to registered
            return [
                'pool_status' => 'registered',
                'action' => 'revert',
                'preserve_prev' => false,
            ];

        case 'rejected':
        case 'cancelled':
            return [
                'pool_status' => 'registered',
                'action' => 'revert',
                'preserve_prev' => false,
            ];

        case 'closed':
            $final = $ctx['final_state'] ?? 'registered';
            // closed inherits the last terminal state — must be a settled state
            $allowed = ['registered', 'replaced', 'voided'];
            if (!in_array($final, $allowed, true)) {
                $final = 'registered';
            }
            return [
                'pool_status' => $final,
                'action' => 'close_final',
                'preserve_prev' => false,
            ];

        default:
            return [
                'pool_status' => 'registered',
                'action' => 'unknown',
                'preserve_prev' => false,
            ];
    }
}

class SnClaimSyncIntegrationTest extends TestCase
{
    public function test_pending_enters_claimed(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('pending', ['prev_status' => 'registered']);
        $this->assertSame('claimed', $r['pool_status']);
        $this->assertSame('enter_claim', $r['action']);
        $this->assertTrue($r['preserve_prev']);
    }

    /**
     * @dataProvider intermediateStatusProvider
     */
    public function test_intermediate_statuses_continue_claimed(string $claim_status): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror($claim_status, ['prev_status' => 'registered']);
        $this->assertSame('claimed', $r['pool_status']);
        $this->assertSame('continue_claimed', $r['action']);
        $this->assertTrue($r['preserve_prev']);
    }

    public function intermediateStatusProvider(): array
    {
        return [
            ['reviewing'],
            ['approved'],
            ['in_progress'],
            ['waiting_parts'],
            ['repairing'],
            ['quality_check'],
        ];
    }

    public function test_completed_repair_reverts_to_registered(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('completed', [
            '_b2b_replacement_sent' => false,
            'prev_status' => 'registered',
        ]);
        $this->assertSame('registered', $r['pool_status']);
        $this->assertSame('revert', $r['action']);
        $this->assertFalse($r['preserve_prev']);
    }

    public function test_completed_replacement_marks_replaced(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('completed', [
            '_b2b_replacement_sent' => 1,
            'prev_status' => 'registered',
        ]);
        $this->assertSame('replaced', $r['pool_status']);
        $this->assertSame('replace', $r['action']);
    }

    public function test_completed_replacement_truthy_variants(): void
    {
        // Various truthy forms must be honored ('1', true, '1' string, 'yes' is treated truthy by !empty)
        foreach ([1, '1', true, 'yes'] as $variant) {
            $r = dinoco_sn_map_claim_to_pool_status_mirror('completed', [
                '_b2b_replacement_sent' => $variant,
            ]);
            $this->assertSame('replaced', $r['pool_status'],
                "Replacement variant " . var_export($variant, true) . " should yield 'replaced'"
            );
        }
        // falsy must yield repair
        foreach ([0, '0', false, '', null] as $falsy) {
            $r = dinoco_sn_map_claim_to_pool_status_mirror('completed', [
                '_b2b_replacement_sent' => $falsy,
            ]);
            $this->assertSame('registered', $r['pool_status'],
                "Falsy variant " . var_export($falsy, true) . " should yield 'registered'"
            );
        }
    }

    public function test_rejected_reverts(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('rejected');
        $this->assertSame('registered', $r['pool_status']);
        $this->assertSame('revert', $r['action']);
    }

    public function test_cancelled_reverts(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('cancelled');
        $this->assertSame('registered', $r['pool_status']);
        $this->assertSame('revert', $r['action']);
    }

    public function test_closed_inherits_final_state_registered(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('closed', ['final_state' => 'registered']);
        $this->assertSame('registered', $r['pool_status']);
        $this->assertSame('close_final', $r['action']);
    }

    public function test_closed_inherits_final_state_replaced(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('closed', ['final_state' => 'replaced']);
        $this->assertSame('replaced', $r['pool_status']);
    }

    public function test_closed_inherits_final_state_voided(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('closed', ['final_state' => 'voided']);
        $this->assertSame('voided', $r['pool_status']);
    }

    public function test_closed_invalid_final_state_falls_back(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('closed', ['final_state' => 'frobnicate']);
        $this->assertSame('registered', $r['pool_status']);
    }

    public function test_unknown_status_safe_default(): void
    {
        $r = dinoco_sn_map_claim_to_pool_status_mirror('frobnicate');
        $this->assertSame('registered', $r['pool_status']);
        $this->assertSame('unknown', $r['action']);
    }

    public function test_full_claim_lifecycle_ends_at_registered_repair(): void
    {
        // simulate happy-path repair: pending -> reviewing -> approved -> in_progress -> repairing -> quality_check -> completed
        $sequence = ['pending', 'reviewing', 'approved', 'in_progress', 'repairing', 'quality_check'];
        foreach ($sequence as $s) {
            $r = dinoco_sn_map_claim_to_pool_status_mirror($s);
            $this->assertSame('claimed', $r['pool_status']);
        }
        $final = dinoco_sn_map_claim_to_pool_status_mirror('completed', ['_b2b_replacement_sent' => false]);
        $this->assertSame('registered', $final['pool_status']);
    }

    public function test_full_claim_lifecycle_ends_at_replaced(): void
    {
        // unhappy-path: pending -> reviewing -> approved -> waiting_parts -> completed (with replacement)
        $r = dinoco_sn_map_claim_to_pool_status_mirror('completed', ['_b2b_replacement_sent' => 1]);
        $this->assertSame('replaced', $r['pool_status']);
    }

    public function test_all_11_claim_statuses_have_mapping(): void
    {
        // Service Center canonical 11 statuses
        $statuses = [
            'pending', 'reviewing', 'approved', 'in_progress', 'waiting_parts',
            'repairing', 'quality_check', 'completed', 'rejected', 'cancelled', 'closed',
        ];
        foreach ($statuses as $s) {
            $r = dinoco_sn_map_claim_to_pool_status_mirror($s);
            $this->assertArrayHasKey('pool_status', $r);
            $this->assertArrayHasKey('action', $r);
            // pool_status must be one of the 12 canonical sn_pool states
            $this->assertContains($r['pool_status'], [
                'reserved', 'in_pool', 'registered', 'claimed', 'replaced',
                'transferred', 'voided', 'recalled', 'stolen',
                'reserved_for_legacy', 'shipped_legacy', 'cancelled_batch',
            ]);
        }
    }
}
