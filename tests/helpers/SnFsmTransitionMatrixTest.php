<?php
/**
 * REG-080 — S/N FSM 12-state transition matrix
 *
 * Plan v2.13 — verifies pure-logic mirror of dinoco_sn_fsm_can_transition()
 * against the canonical state machine (docs/sn-system/02-state-machine.md).
 *
 * 12 states × 12 targets = 144 (from, to) pairs covered via dataProvider.
 *
 * States:
 *   reserved, in_pool, registered, claimed, replaced,
 *   transferred, voided, recalled, stolen,
 *   reserved_for_legacy, shipped_legacy, cancelled_batch
 *
 * Terminal states (no outgoing): replaced, cancelled_batch
 * Side states (most -> allowed): voided, recalled, stolen
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnFsmTransitionMatrix;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_sn_fsm_can_transition($from, $to).
 *
 * Source of truth: docs/sn-system/02-state-machine.md Mermaid diagram.
 * Drift between mirror and snippet caught by Jest sn-system-drift suite.
 */
function dinoco_sn_fsm_states_mirror(): array
{
    return [
        'reserved',
        'in_pool',
        'registered',
        'claimed',
        'replaced',
        'transferred',
        'voided',
        'recalled',
        'stolen',
        'reserved_for_legacy',
        'shipped_legacy',
        'cancelled_batch',
    ];
}

function dinoco_sn_fsm_transitions_mirror(): array
{
    // canonical edge list — keep in lockstep with state-machine.md
    return [
        'reserved' => ['in_pool', 'voided', 'cancelled_batch'],
        'in_pool' => ['registered', 'reserved_for_legacy', 'voided', 'recalled'],
        'reserved_for_legacy' => ['shipped_legacy', 'in_pool'],
        'shipped_legacy' => ['registered', 'in_pool'],
        'registered' => ['claimed', 'transferred', 'voided', 'recalled', 'stolen'],
        'transferred' => ['registered'],
        'claimed' => ['registered', 'replaced', 'voided'],
        'stolen' => ['registered'],
        'recalled' => ['in_pool', 'voided'],
        // terminal — no outgoing
        'replaced' => [],
        'voided' => [],
        'cancelled_batch' => [],
    ];
}

function dinoco_sn_fsm_can_transition_mirror(string $from, string $to): bool
{
    $map = dinoco_sn_fsm_transitions_mirror();
    if (! isset($map[$from])) {
        return false;
    }
    return in_array($to, $map[$from], true);
}

class SnFsmTransitionMatrixTest extends TestCase
{
    public function test_state_count_is_12(): void
    {
        $this->assertCount(12, dinoco_sn_fsm_states_mirror());
    }

    public function test_terminal_states_have_zero_outgoing(): void
    {
        $map = dinoco_sn_fsm_transitions_mirror();
        $this->assertSame([], $map['replaced']);
        $this->assertSame([], $map['voided']);
        $this->assertSame([], $map['cancelled_batch']);
    }

    public function test_unknown_from_state_rejects(): void
    {
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('unknown', 'registered'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('', 'registered'));
    }

    public function test_unknown_to_state_rejects(): void
    {
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('reserved', 'frobnicate'));
    }

    /**
     * @dataProvider validTransitionProvider
     */
    public function test_valid_transitions_accepted(string $from, string $to): void
    {
        $this->assertTrue(
            dinoco_sn_fsm_can_transition_mirror($from, $to),
            "Expected {$from} -> {$to} to be allowed"
        );
    }

    /**
     * @dataProvider invalidTransitionProvider
     */
    public function test_invalid_transitions_rejected(string $from, string $to): void
    {
        $this->assertFalse(
            dinoco_sn_fsm_can_transition_mirror($from, $to),
            "Expected {$from} -> {$to} to be REJECTED"
        );
    }

    public function test_full_matrix_144_pairs_decided(): void
    {
        $states = dinoco_sn_fsm_states_mirror();
        $allowed = 0;
        $rejected = 0;
        foreach ($states as $from) {
            foreach ($states as $to) {
                if (dinoco_sn_fsm_can_transition_mirror($from, $to)) {
                    $allowed++;
                } else {
                    $rejected++;
                }
            }
        }
        $this->assertSame(144, $allowed + $rejected);
        // canonical edge count from state-machine.md (sum of arrays in mirror)
        $expected_allowed = 0;
        foreach (dinoco_sn_fsm_transitions_mirror() as $edges) {
            $expected_allowed += count($edges);
        }
        $this->assertSame($expected_allowed, $allowed);
    }

    public function test_replaced_is_chain_end(): void
    {
        // replaced terminal — cannot leave
        foreach (dinoco_sn_fsm_states_mirror() as $to) {
            $this->assertFalse(
                dinoco_sn_fsm_can_transition_mirror('replaced', $to),
                "replaced should NOT transition to {$to}"
            );
        }
    }

    public function test_cancelled_batch_is_terminal(): void
    {
        foreach (dinoco_sn_fsm_states_mirror() as $to) {
            $this->assertFalse(
                dinoco_sn_fsm_can_transition_mirror('cancelled_batch', $to)
            );
        }
    }

    public function test_voided_is_terminal(): void
    {
        foreach (dinoco_sn_fsm_states_mirror() as $to) {
            $this->assertFalse(
                dinoco_sn_fsm_can_transition_mirror('voided', $to)
            );
        }
    }

    public function test_transferred_only_returns_to_registered(): void
    {
        // Boss Q16: transferred is intermediate ~5s, only path back is registered
        $map = dinoco_sn_fsm_transitions_mirror();
        $this->assertSame(['registered'], $map['transferred']);
    }

    public function test_claimed_revert_path_to_registered(): void
    {
        // REG-081 anchor — claim reject/cancel/repair_done flows back to registered
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('claimed', 'registered'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('claimed', 'replaced'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('claimed', 'voided'));
        // claimed cannot go back to in_pool (must revert via registered)
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('claimed', 'in_pool'));
    }

    public function test_stolen_recovery_path_only_to_registered(): void
    {
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('stolen', 'registered'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('stolen', 'in_pool'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('stolen', 'claimed'));
    }

    public function test_recalled_dual_paths(): void
    {
        // false alarm -> in_pool, confirmed defect -> voided
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('recalled', 'in_pool'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('recalled', 'voided'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('recalled', 'registered'));
    }

    public function test_legacy_paths(): void
    {
        // v2.5 Legacy state transitions
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('in_pool', 'reserved_for_legacy'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('reserved_for_legacy', 'shipped_legacy'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('reserved_for_legacy', 'in_pool'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('shipped_legacy', 'registered'));
        $this->assertTrue(dinoco_sn_fsm_can_transition_mirror('shipped_legacy', 'in_pool'));
    }

    public function test_no_self_loops_on_terminal(): void
    {
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('replaced', 'replaced'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('voided', 'voided'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('cancelled_batch', 'cancelled_batch'));
    }

    public function test_registered_cannot_go_back_to_in_pool_directly(): void
    {
        // ownership cannot be revoked silently — must go via voided/recalled
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('registered', 'in_pool'));
        $this->assertFalse(dinoco_sn_fsm_can_transition_mirror('registered', 'reserved'));
    }

    /**
     * Valid transition pairs from canonical state-machine.md
     */
    public function validTransitionProvider(): array
    {
        $cases = [];
        foreach (dinoco_sn_fsm_transitions_mirror() as $from => $tos) {
            foreach ($tos as $to) {
                $cases["{$from}_to_{$to}"] = [$from, $to];
            }
        }
        return $cases;
    }

    /**
     * Compute every (from, to) NOT in the canonical edge list.
     */
    public function invalidTransitionProvider(): array
    {
        $states = dinoco_sn_fsm_states_mirror();
        $valid = dinoco_sn_fsm_transitions_mirror();
        $cases = [];
        foreach ($states as $from) {
            $allowed = $valid[$from] ?? [];
            foreach ($states as $to) {
                if (in_array($to, $allowed, true)) {
                    continue;
                }
                $cases["{$from}_to_{$to}_invalid"] = [$from, $to];
            }
        }
        return $cases;
    }
}
