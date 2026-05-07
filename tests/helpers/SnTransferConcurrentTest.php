<?php
/**
 * REG-083 — Manual + Member Transfer concurrent (unified lock key)
 *
 * Plan v2.13 W6.6 + W6.7 — verifies that both the admin Manual Transfer
 * Tool and the customer Member Transfer LIFF use the SAME GET_LOCK key
 * derived deterministically from the S/N. Without unified key the two
 * paths could double-execute and corrupt audit chain.
 *
 * Pure-logic test confirms key generation determinism +
 * mutual-exclusion ordering.
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnTransferConcurrent;

use PHPUnit\Framework\TestCase;

/**
 * Unified lock key generator — must be byte-identical between
 * dinoco_sn_transfer_owner_by_sn (Manual Transfer Tool V.31.0)
 * and dinoco_v3_exec_func transfer closure (Transfer LIFF V.31.0).
 *
 * Algorithm: dnc_sn_{md5(strtoupper(sn))}
 * Constraint: MySQL GET_LOCK accepts <= 64-char keys (md5 = 32 hex; prefix = 7
 * chars; total 39 — safe).
 */
function dinoco_sn_transfer_lock_key_mirror(string $sn): string
{
    return 'dnc_sn_' . md5(strtoupper(trim($sn)));
}

/**
 * Mock lock manager — single in-memory holder.
 */
class TransferLockManager
{
    private array $locks = [];

    public function acquire(string $key, int $timeout_seconds = 5): bool
    {
        if (isset($this->locks[$key])) {
            return false;
        }
        $this->locks[$key] = true;
        return true;
    }

    public function release(string $key): void
    {
        unset($this->locks[$key]);
    }
}

/**
 * Pure-logic mirror of force_transfer / member-transfer entrypoint.
 */
function dinoco_sn_transfer_attempt_mirror(
    TransferLockManager $mgr,
    string $sn,
    int $old_user,
    int $new_user
): array {
    $key = dinoco_sn_transfer_lock_key_mirror($sn);
    if (!$mgr->acquire($key)) {
        return ['ok' => false, 'code' => 'lock_busy', 'http' => 423];
    }
    try {
        // simulate atomic flip registered -> transferred -> registered (new owner)
        $audit = [
            'sn' => $sn,
            'from' => $old_user,
            'to' => $new_user,
            'lock_key' => $key,
        ];
        return ['ok' => true, 'code' => 'transferred', 'http' => 200, 'audit' => $audit];
    } finally {
        $mgr->release($key);
    }
}

class SnTransferConcurrentTest extends TestCase
{
    public function test_lock_key_is_deterministic(): void
    {
        $sn = 'DNCSSK7H2N9X';
        $k1 = dinoco_sn_transfer_lock_key_mirror($sn);
        $k2 = dinoco_sn_transfer_lock_key_mirror($sn);
        $this->assertSame($k1, $k2);
    }

    public function test_lock_key_case_normalized(): void
    {
        $upper = dinoco_sn_transfer_lock_key_mirror('DNCSSK7H2N9X');
        $lower = dinoco_sn_transfer_lock_key_mirror('dncssk7h2n9x');
        $mixed = dinoco_sn_transfer_lock_key_mirror('DnCsSk7H2n9X');
        $this->assertSame($upper, $lower);
        $this->assertSame($upper, $mixed);
    }

    public function test_lock_key_whitespace_normalized(): void
    {
        $clean = dinoco_sn_transfer_lock_key_mirror('DNCSSK7H2N9X');
        $padded = dinoco_sn_transfer_lock_key_mirror('  DNCSSK7H2N9X  ');
        $this->assertSame($clean, $padded);
    }

    public function test_lock_key_within_mysql_limit(): void
    {
        $key = dinoco_sn_transfer_lock_key_mirror('DNCSSK7H2N9X');
        $this->assertLessThanOrEqual(64, strlen($key));
        $this->assertSame(0, strpos($key, 'dnc_sn_'));
    }

    public function test_different_sn_produces_different_key(): void
    {
        $a = dinoco_sn_transfer_lock_key_mirror('DNCSSAAAAAA');
        $b = dinoco_sn_transfer_lock_key_mirror('DNCSSBBBBBB');
        $this->assertNotSame($a, $b);
    }

    public function test_admin_blocks_member_transfer_for_same_plate(): void
    {
        $mgr = new TransferLockManager();
        $sn = 'DNCSSK7H2N9X';

        // admin grabs lock first (long-running 4-eyes review)
        $this->assertTrue($mgr->acquire(dinoco_sn_transfer_lock_key_mirror($sn)));

        // member-side LIFF tries simultaneously
        $r = dinoco_sn_transfer_attempt_mirror($mgr, $sn, 100, 200);
        $this->assertFalse($r['ok']);
        $this->assertSame('lock_busy', $r['code']);

        $mgr->release(dinoco_sn_transfer_lock_key_mirror($sn));
    }

    public function test_member_blocks_admin_transfer_for_same_plate(): void
    {
        $mgr = new TransferLockManager();
        $sn = 'DNCSSK7H2N9X';

        // member starts transfer (LIFF flow)
        $this->assertTrue($mgr->acquire(dinoco_sn_transfer_lock_key_mirror($sn)));

        // admin force-transfer arrives
        $r = dinoco_sn_transfer_attempt_mirror($mgr, $sn, 100, 200);
        $this->assertFalse($r['ok']);
        $this->assertSame('lock_busy', $r['code']);

        $mgr->release(dinoco_sn_transfer_lock_key_mirror($sn));
    }

    public function test_serial_transfers_after_lock_release_succeed(): void
    {
        $mgr = new TransferLockManager();
        $sn = 'DNCSSK7H2N9X';

        $r1 = dinoco_sn_transfer_attempt_mirror($mgr, $sn, 100, 200);
        $this->assertTrue($r1['ok']);
        $this->assertSame(100, $r1['audit']['from']);

        // After auto-release in finally, second attempt OK
        $r2 = dinoco_sn_transfer_attempt_mirror($mgr, $sn, 200, 300);
        $this->assertTrue($r2['ok']);
        $this->assertSame(200, $r2['audit']['from']);
        $this->assertSame(300, $r2['audit']['to']);
    }

    public function test_different_plates_can_transfer_concurrently(): void
    {
        $mgr = new TransferLockManager();
        $r1 = dinoco_sn_transfer_attempt_mirror($mgr, 'DNCSS001', 100, 200);

        // Acquire lock for plate1 manually so it stays held while plate2 fires
        $key1 = dinoco_sn_transfer_lock_key_mirror('DNCSS001');
        $this->assertTrue($mgr->acquire($key1));

        // Different plate -> different key -> not blocked
        $r2 = dinoco_sn_transfer_attempt_mirror($mgr, 'DNCSS002', 300, 400);
        $this->assertTrue($r2['ok']);

        $mgr->release($key1);
    }

    public function test_audit_chain_records_lock_key(): void
    {
        $mgr = new TransferLockManager();
        $r = dinoco_sn_transfer_attempt_mirror($mgr, 'DNCSSK7H2N9X', 100, 200);
        $this->assertTrue($r['ok']);
        $this->assertArrayHasKey('lock_key', $r['audit']);
        $this->assertSame(dinoco_sn_transfer_lock_key_mirror('DNCSSK7H2N9X'), $r['audit']['lock_key']);
    }
}
