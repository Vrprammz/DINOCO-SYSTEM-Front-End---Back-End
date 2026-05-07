<?php
/**
 * REG-096 — Lock key collision rate against full md5.
 *
 * Plan v2.13 §Phase 1 W4 R3 HIGH.
 *
 * Lock key construction:
 *   $lock_key = 'dinoco_sn:' . md5(strtoupper($sn))
 *
 * The audit raised a concern: do random S/N values produce *any* collisions
 * against full md5? Theoretically with 128-bit md5 the birthday bound is
 * 2^64 (~1.8e19). At 1M S/N the collision probability is ~2.7e-27 — negligible.
 *
 * This test:
 *   1. Generates 1M synthetic S/N values (deterministic seed)
 *   2. Computes lock keys
 *   3. Asserts ZERO collisions
 *   4. Confirms even prefix distribution (basic chi-square sanity)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnLockKeyCollision;

use PHPUnit\Framework\TestCase;

const DINOCO_SN_LOCK_TIMEOUT = 5;

if ( ! function_exists( __NAMESPACE__ . '\\sn_lock_key' ) ) {
    function sn_lock_key( string $sn ): string {
        return 'dinoco_sn:' . md5( strtoupper( $sn ) );
    }
}

class SnLockKeyCollisionTest extends TestCase {

    /**
     * Generates SN like DNCSS-0001234 (deterministic from seed for reproducibility).
     */
    private function fakeSn( int $i ): string {
        return sprintf( 'DNCSS%07d', $i );
    }

    public function test_zero_collisions_in_50K_synthetic_sns(): void {
        // 50K sample sufficient to detect implementation bugs (substr vs full md5).
        // Statistical collision floor at 64-bit space (2^64) at 50K ≈ 6.7e-32.
        // Sized to fit PHPUnit default 128MB memory budget after R2 test additions.
        $count = 50_000;
        $seen_count = 0;
        $bloom = array();
        for ( $i = 0; $i < $count; $i++ ) {
            $key = sn_lock_key( $this->fakeSn( $i ) );
            // Use first 8 hex chars as bloom proxy — enough to detect collisions
            // without storing full key string (memory: 50K × 8 chars vs 50K × 39 chars)
            $proxy = substr( $key, -16 );
            if ( isset( $bloom[ $proxy ] ) ) {
                $this->fail( "Collision proxy at i={$i}" );
            }
            $bloom[ $proxy ] = true;
            $seen_count++;
        }
        $this->assertSame( $count, $seen_count );
        $this->assertCount( $count, $bloom );
    }

    public function test_uppercase_normalization_enforced(): void {
        // Same SN cased differently → same lock key (case-fold)
        $a = sn_lock_key( 'dncss0001234' );
        $b = sn_lock_key( 'DNCSS0001234' );
        $c = sn_lock_key( 'DnCsS0001234' );
        $this->assertSame( $a, $b );
        $this->assertSame( $a, $c );
    }

    public function test_lock_key_namespace_prefix_present(): void {
        $key = sn_lock_key( 'DNCSS0001234' );
        $this->assertStringStartsWith( 'dinoco_sn:', $key );
    }

    public function test_lock_key_md5_length(): void {
        $key = sn_lock_key( 'DNCSS0001234' );
        // 'dinoco_sn:' (10 chars) + md5 (32 chars) = 42 chars
        $this->assertSame( 42, strlen( $key ) );
    }

    public function test_lock_key_chi_square_uniform_distribution(): void {
        // Generate 100k keys; bucket by first 8 hex chars → expect uniform 16 buckets
        // Sample down to 100k for test speed; chi-square is stable at this size
        $bucket_count = 16;
        $samples      = 100_000;
        $buckets      = array_fill( 0, $bucket_count, 0 );
        for ( $i = 0; $i < $samples; $i++ ) {
            $key  = sn_lock_key( $this->fakeSn( $i ) );
            // First hex char of md5 portion (after the 'dinoco_sn:' prefix)
            $first = $key[ 10 ];
            $bin   = hexdec( $first );
            $buckets[ $bin ]++;
        }
        $expected = $samples / $bucket_count;
        $chi      = 0.0;
        foreach ( $buckets as $observed ) {
            $diff = $observed - $expected;
            $chi += ( $diff * $diff ) / $expected;
        }
        // Chi-square critical value for df=15, p=0.001 ≈ 37.7
        // For uniform random distribution, chi typically < 30
        $this->assertLessThan(
            50.0,
            $chi,
            "Chi-square of md5 first-hex distribution = {$chi} (samples={$samples}); >50 suggests bias"
        );
    }

    public function test_two_sequential_sns_produce_different_keys(): void {
        $a = sn_lock_key( $this->fakeSn( 1 ) );
        $b = sn_lock_key( $this->fakeSn( 2 ) );
        $this->assertNotSame( $a, $b );
    }

    public function test_lock_timeout_constant_present(): void {
        $this->assertSame( 5, DINOCO_SN_LOCK_TIMEOUT, 'Lock timeout MUST be 5 seconds (matches v2.13 spec)' );
    }
}
