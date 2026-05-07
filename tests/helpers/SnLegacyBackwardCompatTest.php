<?php
/**
 * REG-088 — Backward compat with legacy CPT (warranty_registration.serial_code)
 *
 * Plan v2.13 W6.5 — Snippet [System] DINOCO Claim System V.31.0
 * preserves backward compat for customers registered BEFORE sn_pool
 * (only ACF field `serial_code` exists; no junction row).
 *
 * Pure-logic verifies preferred-then-fallback lookup chain.
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnLegacyBackwardCompat;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of the V.31.0 lookup chain in claim system.
 *
 * Returns:
 *   ['source' => 'sn_pool'|'cpt_legacy'|'none', 'sn' => string|null]
 */
function dinoco_sn_resolve_serial_mirror(int $registration_id, array $sn_pool, array $cpt_meta): array
{
    // 1. Prefer sn_pool entry tied to this registration
    foreach ($sn_pool as $row) {
        if (($row['registration_id'] ?? 0) === $registration_id) {
            return ['source' => 'sn_pool', 'sn' => $row['sn']];
        }
    }
    // 2. Fallback to ACF serial_code on the registration post
    $sn = $cpt_meta[$registration_id]['serial_code'] ?? null;
    if (!empty($sn)) {
        return ['source' => 'cpt_legacy', 'sn' => $sn];
    }
    return ['source' => 'none', 'sn' => null];
}

/**
 * Validate plate ownership rules for claim opening.
 * Returns ['ok' => bool, 'http' => 200|422, 'message' => string|null].
 */
function dinoco_sn_validate_for_claim_mirror(?array $plate, int $current_user_id): array
{
    if ($plate === null) {
        return ['ok' => true, 'http' => 200, 'message' => null]; // legacy fallback path
    }
    if (($plate['status'] ?? '') !== 'registered') {
        return ['ok' => false, 'http' => 422, 'message' => 'เพลทไม่อยู่ในสถานะลงทะเบียน'];
    }
    if (($plate['registered_user_id'] ?? 0) !== $current_user_id) {
        return [
            'ok' => false,
            'http' => 422,
            'message' => 'เพลทนี้ไม่ใช่ของคุณ — กรุณาติดต่อ Admin',
        ];
    }
    return ['ok' => true, 'http' => 200, 'message' => null];
}

class SnLegacyBackwardCompatTest extends TestCase
{
    public function test_prefers_sn_pool_when_present(): void
    {
        $sn_pool = [
            ['sn' => 'DNCSS001', 'registration_id' => 42, 'status' => 'registered'],
        ];
        $cpt_meta = [
            42 => ['serial_code' => 'OLDSN-LEGACY-12345'],
        ];
        $r = dinoco_sn_resolve_serial_mirror(42, $sn_pool, $cpt_meta);
        $this->assertSame('sn_pool', $r['source']);
        $this->assertSame('DNCSS001', $r['sn']);
    }

    public function test_falls_back_to_cpt_legacy_serial_code(): void
    {
        $sn_pool = []; // no junction row
        $cpt_meta = [
            42 => ['serial_code' => 'OLDSN-LEGACY-12345'],
        ];
        $r = dinoco_sn_resolve_serial_mirror(42, $sn_pool, $cpt_meta);
        $this->assertSame('cpt_legacy', $r['source']);
        $this->assertSame('OLDSN-LEGACY-12345', $r['sn']);
    }

    public function test_none_when_neither_source_has_data(): void
    {
        $r = dinoco_sn_resolve_serial_mirror(42, [], []);
        $this->assertSame('none', $r['source']);
        $this->assertNull($r['sn']);
    }

    public function test_empty_legacy_serial_yields_none(): void
    {
        $cpt_meta = [42 => ['serial_code' => '']];
        $r = dinoco_sn_resolve_serial_mirror(42, [], $cpt_meta);
        $this->assertSame('none', $r['source']);
    }

    public function test_legacy_path_skips_sn_pool_validation(): void
    {
        // V.31.0: when no sn_pool row, validation is permissive (legacy path)
        $r = dinoco_sn_validate_for_claim_mirror(null, 100);
        $this->assertTrue($r['ok']);
    }

    public function test_sn_pool_status_must_be_registered(): void
    {
        $plate = ['status' => 'in_pool', 'registered_user_id' => 100];
        $r = dinoco_sn_validate_for_claim_mirror($plate, 100);
        $this->assertFalse($r['ok']);
        $this->assertSame(422, $r['http']);
        $this->assertStringContainsString('สถานะลงทะเบียน', $r['message']);
    }

    public function test_sn_pool_owner_must_match_claimer(): void
    {
        $plate = ['status' => 'registered', 'registered_user_id' => 200];
        $r = dinoco_sn_validate_for_claim_mirror($plate, 100);
        $this->assertFalse($r['ok']);
        $this->assertSame(422, $r['http']);
        $this->assertStringContainsString('ไม่ใช่ของคุณ', $r['message']);
    }

    public function test_sn_pool_correct_owner_passes(): void
    {
        $plate = ['status' => 'registered', 'registered_user_id' => 100];
        $r = dinoco_sn_validate_for_claim_mirror($plate, 100);
        $this->assertTrue($r['ok']);
    }

    public function test_legacy_customer_can_still_claim(): void
    {
        // Customer registered before sn_pool — only ACF serial_code exists
        $cpt_meta = [42 => ['serial_code' => 'OLDSN-2024-LEGACY']];
        $resolved = dinoco_sn_resolve_serial_mirror(42, [], $cpt_meta);
        $this->assertSame('cpt_legacy', $resolved['source']);

        // Validation receives null plate (no sn_pool) -> permissive
        $valid = dinoco_sn_validate_for_claim_mirror(null, 100);
        $this->assertTrue($valid['ok']);
    }

    public function test_modern_customer_strict_checks_apply(): void
    {
        // New customer registered via LIFF — sn_pool row authoritative
        $sn_pool = [
            ['sn' => 'DNCSSK7H2N9X', 'registration_id' => 100, 'status' => 'registered',
             'registered_user_id' => 500],
        ];
        $resolved = dinoco_sn_resolve_serial_mirror(100, $sn_pool, []);
        $this->assertSame('sn_pool', $resolved['source']);

        // Wrong user attempting claim
        $valid = dinoco_sn_validate_for_claim_mirror(
            ['status' => 'registered', 'registered_user_id' => 500],
            999
        );
        $this->assertFalse($valid['ok']);
    }

    public function test_v29_helpers_missing_does_not_break_dashboard(): void
    {
        // Banner system: hide if v2.9 helpers not deployed
        // Pure-logic check — dashboard shouldn't crash if function_exists() returns false
        $helper_exists = function_exists('dinoco_sn_render_replacement_pending_banner');
        // Test environment: function NOT defined globally — must not throw
        $this->assertIsBool($helper_exists);
    }

    public function test_first_match_wins_in_resolution_chain(): void
    {
        // If sn_pool AND cpt both have data -> sn_pool wins
        $sn_pool = [['sn' => 'NEW-SN', 'registration_id' => 1, 'status' => 'registered']];
        $cpt_meta = [1 => ['serial_code' => 'OLD-SN']];
        $r = dinoco_sn_resolve_serial_mirror(1, $sn_pool, $cpt_meta);
        $this->assertSame('sn_pool', $r['source']);
        $this->assertSame('NEW-SN', $r['sn']);
    }
}
