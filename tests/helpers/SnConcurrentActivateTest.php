<?php
/**
 * REG-082 — Concurrent activate race (logic test)
 *
 * Plan v2.13 W3 — verifies optimistic concurrency on plate activate.
 * Real DB-level FOR UPDATE + lock_version is enforced by Snippet [System]
 * DINOCO Warranty Activation LIFF V.0.1; this test simulates the race in
 * pure-logic to confirm the algorithm allows exactly ONE winner.
 *
 * Race scenario:
 *   - Both callers SELECT plate row at lock_version=N
 *   - Caller A commits update at lock_version=N+1
 *   - Caller B retries SELECT, sees lock_version=N+1, MUST refuse
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnConcurrentActivate;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of the optimistic concurrency check in
 * dinoco_sn_activate_atomic($sn, $user_id).
 *
 * In production:
 *   START TRANSACTION;
 *   SELECT * FROM sn_pool WHERE sn=? FOR UPDATE;
 *   if status != 'in_pool' or lock_version != observed_version: ROLLBACK + 409
 *   UPDATE sn_pool SET status='registered', lock_version=lock_version+1
 *     WHERE sn=? AND lock_version=observed_version;
 *   if affected_rows = 0: ROLLBACK + 409 (lock_version_conflict)
 *   COMMIT;
 *
 * Mirror simulates the SELECT/UPDATE pair against an in-memory plate row.
 */
function dinoco_sn_activate_attempt_mirror(array &$plate_state, int $observed_version, int $user_id): array
{
    if ($plate_state['status'] !== 'in_pool') {
        return ['ok' => false, 'code' => 'already_registered', 'http' => 409];
    }
    if ($plate_state['lock_version'] !== $observed_version) {
        return ['ok' => false, 'code' => 'lock_version_conflict', 'http' => 409];
    }
    $plate_state['status'] = 'registered';
    $plate_state['lock_version']++;
    $plate_state['registered_user_id'] = $user_id;
    return ['ok' => true, 'code' => 'registered', 'http' => 200];
}

class SnConcurrentActivateTest extends TestCase
{
    private function freshPlate(): array
    {
        return [
            'sn' => 'DNCSSK7H2N9X',
            'status' => 'in_pool',
            'lock_version' => 0,
            'registered_user_id' => 0,
        ];
    }

    public function test_solo_activate_succeeds(): void
    {
        $plate = $this->freshPlate();
        $result = dinoco_sn_activate_attempt_mirror($plate, 0, 42);
        $this->assertTrue($result['ok']);
        $this->assertSame('registered', $result['code']);
        $this->assertSame('registered', $plate['status']);
        $this->assertSame(1, $plate['lock_version']);
        $this->assertSame(42, $plate['registered_user_id']);
    }

    public function test_two_callers_both_observe_same_version_a_wins(): void
    {
        $plate = $this->freshPlate();
        // Caller A and Caller B both SELECT at lock_version=0
        $a_observed = 0;
        $b_observed = 0;

        // Caller A commits first
        $resA = dinoco_sn_activate_attempt_mirror($plate, $a_observed, 100);
        $this->assertTrue($resA['ok']);
        $this->assertSame(100, $plate['registered_user_id']);

        // Caller B attempts with stale observed_version
        $resB = dinoco_sn_activate_attempt_mirror($plate, $b_observed, 200);
        $this->assertFalse($resB['ok']);
        $this->assertSame(409, $resB['http']);
        // After A wins, B sees status=registered -> already_registered code wins over lock_conflict
        $this->assertSame('already_registered', $resB['code']);
        // Plate user_id unchanged
        $this->assertSame(100, $plate['registered_user_id']);
    }

    public function test_b_with_correct_observed_still_blocked_by_status(): void
    {
        // Edge: B somehow observes the new version but plate is now registered
        $plate = $this->freshPlate();
        dinoco_sn_activate_attempt_mirror($plate, 0, 100);
        $resB = dinoco_sn_activate_attempt_mirror($plate, 1, 200);
        $this->assertFalse($resB['ok']);
        $this->assertSame('already_registered', $resB['code']);
    }

    public function test_lock_version_conflict_reported_when_status_still_in_pool(): void
    {
        // Hypothetical: another op bumped lock_version but kept status (shouldn't happen but defensive)
        $plate = $this->freshPlate();
        $plate['lock_version'] = 5;
        $resB = dinoco_sn_activate_attempt_mirror($plate, 4, 200);
        $this->assertFalse($resB['ok']);
        $this->assertSame('lock_version_conflict', $resB['code']);
        $this->assertSame(409, $resB['http']);
    }

    public function test_three_callers_exactly_one_wins(): void
    {
        $plate = $this->freshPlate();
        $observed = 0;

        $r1 = dinoco_sn_activate_attempt_mirror($plate, $observed, 1);
        $r2 = dinoco_sn_activate_attempt_mirror($plate, $observed, 2);
        $r3 = dinoco_sn_activate_attempt_mirror($plate, $observed, 3);

        $winners = array_filter([$r1, $r2, $r3], static fn($r) => $r['ok']);
        $this->assertCount(1, $winners);
        $this->assertSame(1, $plate['registered_user_id']);
    }

    public function test_voided_plate_rejected_with_correct_code(): void
    {
        $plate = $this->freshPlate();
        $plate['status'] = 'voided';
        $r = dinoco_sn_activate_attempt_mirror($plate, 0, 42);
        $this->assertFalse($r['ok']);
        $this->assertSame('already_registered', $r['code']); // generic terminal-state guard
    }

    public function test_reserved_plate_rejected(): void
    {
        $plate = $this->freshPlate();
        $plate['status'] = 'reserved'; // not yet in warehouse
        $r = dinoco_sn_activate_attempt_mirror($plate, 0, 42);
        $this->assertFalse($r['ok']);
    }

    public function test_lock_version_monotonically_increases_on_success(): void
    {
        $plate = $this->freshPlate();
        $r = dinoco_sn_activate_attempt_mirror($plate, 0, 42);
        $this->assertTrue($r['ok']);
        $this->assertGreaterThan(0, $plate['lock_version']);
    }

    public function test_failed_attempt_does_not_mutate_plate(): void
    {
        $plate = $this->freshPlate();
        $plate['lock_version'] = 5; // simulate concurrent bump
        $before = $plate;

        $r = dinoco_sn_activate_attempt_mirror($plate, 4, 999);
        $this->assertFalse($r['ok']);
        $this->assertSame($before, $plate);
    }
}
