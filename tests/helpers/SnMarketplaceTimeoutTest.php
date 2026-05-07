<?php
/**
 * Phase 5 W16.3 — Marketplace Timeout Cron pure-logic tests
 *
 * Tests the cron worker contract:
 *   - 24h cutoff threshold (DAY_IN_SECONDS)
 *   - Status filter (only pending_payment with NULL slip_image_id)
 *   - 100-row batch cap per run
 *   - Idempotent (re-running on already-expired = no-op)
 *
 * Live DB integration tested manually per W14.5 acceptance §4.
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnMarketplaceTimeout;

use PHPUnit\Framework\TestCase;

if (!defined('DAY_IN_SECONDS')) {
    define('DAY_IN_SECONDS', 86400);
}

/**
 * Pure-logic mirror of cutoff calculation in dinoco_sn_run_marketplace_timeout.
 * Snippet uses gmdate('Y-m-d H:i:s', time() - DAY_IN_SECONDS).
 */
function sn_marketplace_compute_cutoff(int $now_unix): string
{
    return gmdate('Y-m-d H:i:s', $now_unix - DAY_IN_SECONDS);
}

/**
 * Pure-logic mirror of the eligibility filter SQL clause.
 * Returns true if a row would be selected for expiry processing.
 */
function sn_marketplace_is_eligible_for_expiry(array $row, string $cutoff_gmdate): bool
{
    if (($row['payment_status'] ?? '') !== 'pending_payment') {
        return false;
    }
    $slip_id = $row['slip_image_id'] ?? null;
    if (!empty($slip_id)) {
        return false;
    }
    $created = $row['created_at'] ?? '';
    if (empty($created)) {
        return false;
    }
    return strcmp($created, $cutoff_gmdate) < 0;
}

/**
 * Pure-logic batch cap mirror.
 */
function sn_marketplace_apply_batch_cap(int $candidate_count, int $cap = 100): int
{
    if ($candidate_count <= 0) {
        return 0;
    }
    return min($candidate_count, $cap);
}

class SnMarketplaceTimeoutTest extends TestCase
{
    public function test_cutoff_is_24h_before_now(): void
    {
        $now = strtotime('2026-05-07 12:00:00 UTC');
        $cutoff = sn_marketplace_compute_cutoff($now);
        $this->assertSame('2026-05-06 12:00:00', $cutoff);
    }

    public function test_cutoff_handles_dst_safely_via_gmdate(): void
    {
        // gmdate uses UTC — DST irrelevant
        $now = strtotime('2026-03-30 03:00:00 UTC');
        $cutoff = sn_marketplace_compute_cutoff($now);
        $this->assertSame('2026-03-29 03:00:00', $cutoff);
    }

    public function test_eligibility_pending_payment_no_slip_old_returns_true(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'pending_payment',
            'slip_image_id'  => null,
            'created_at'     => '2026-05-05 10:00:00',
        ];
        $this->assertTrue(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_with_slip_returns_false(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'pending_payment',
            'slip_image_id'  => 9876,
            'created_at'     => '2026-05-05 10:00:00',
        ];
        $this->assertFalse(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_status_paid_returns_false(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'paid',
            'slip_image_id'  => null,
            'created_at'     => '2026-05-05 10:00:00',
        ];
        $this->assertFalse(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_too_recent_returns_false(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'pending_payment',
            'slip_image_id'  => null,
            'created_at'     => '2026-05-07 11:00:00', // more recent than cutoff
        ];
        $this->assertFalse(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_status_already_expired_returns_false(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'expired',
            'slip_image_id'  => null,
            'created_at'     => '2026-05-04 10:00:00',
        ];
        $this->assertFalse(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_slip_id_zero_treated_as_missing(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'pending_payment',
            'slip_image_id'  => 0,
            'created_at'     => '2026-05-04 10:00:00',
        ];
        $this->assertTrue(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_eligibility_missing_created_at_returns_false(): void
    {
        $cutoff = '2026-05-06 12:00:00';
        $row = [
            'payment_status' => 'pending_payment',
            'slip_image_id'  => null,
            // created_at missing
        ];
        $this->assertFalse(sn_marketplace_is_eligible_for_expiry($row, $cutoff));
    }

    public function test_batch_cap_under_limit(): void
    {
        $this->assertSame(50, sn_marketplace_apply_batch_cap(50));
    }

    public function test_batch_cap_at_limit(): void
    {
        $this->assertSame(100, sn_marketplace_apply_batch_cap(100));
    }

    public function test_batch_cap_over_limit(): void
    {
        $this->assertSame(100, sn_marketplace_apply_batch_cap(500));
    }

    public function test_batch_cap_zero(): void
    {
        $this->assertSame(0, sn_marketplace_apply_batch_cap(0));
    }

    public function test_batch_cap_negative_clamped_to_zero(): void
    {
        $this->assertSame(0, sn_marketplace_apply_batch_cap(-5));
    }

    public function test_batch_cap_custom(): void
    {
        $this->assertSame(50, sn_marketplace_apply_batch_cap(75, 50));
    }
}
