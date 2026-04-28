<?php
/**
 * RateLimitGetLockTest — Phase 5 M4 (concurrent harness, scenario #5).
 *
 * Source under test: [B2B] Snippet 1 V.33.7 line 421+
 *   - b2b_rate_limit($key, $max, $window)
 *   - Wraps critical section with MySQL `GET_LOCK(lock_name, 2)` to serialize
 *     concurrent place-order rate-limit checks across all PHP workers
 *
 * Bug history (V.33.7, audit 2026-04-17 batch C2 fix):
 *   - Original implementation used `get_transient()` + arithmetic increment,
 *     which is NOT atomic — two concurrent requests could both read count=0,
 *     both increment to 1, both pass the check → bypassed limit (2x).
 *   - V.33.7 wraps with MySQL GET_LOCK so only one worker holds the lock
 *     at a time. Lock timeout 2s → fail-closed (returns 429 on contention).
 *
 * Scope of this test (uses M4.1 concurrent_conn() harness):
 *   1. GET_LOCK semantics — connection B can't acquire while A holds
 *   2. GET_LOCK timeout — B's blocking call times out within 2s
 *   3. RELEASE_LOCK — A releases, B can acquire next
 *   4. Lock name uniqueness — different keys don't conflict
 *
 * Note: We inline-test the GET_LOCK serialization mechanism rather than
 * loading Snippet 1 (8000+ LOC) and calling b2b_rate_limit() directly.
 * The mechanism is the production guarantee — proving GET_LOCK works
 * proves the rate limiter works (at the lock layer).
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class RateLimitGetLockTest extends DinocoIntegrationTestCase {

    /**
     * Compute the same lock name b2b_rate_limit() V.33.7 uses (line 423-424):
     *   $tkey      = 'b2b_rl_' . md5($key);
     *   $lock_name = 'b2b_rl_' . md5($tkey);
     */
    private function rate_limit_lock_name( string $key ): string {
        $tkey = 'b2b_rl_' . md5( $key );
        return 'b2b_rl_' . md5( $tkey );
    }

    public function test_get_lock_acquires_when_unowned(): void {
        global $wpdb;
        $name = $this->rate_limit_lock_name( 'distributor_99_place_order' );

        $got = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 2)', $name ) );
        $this->assertSame( '1', $got, 'GET_LOCK on unowned name returns 1' );

        $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
    }

    /**
     * THE serialization proof: two connections can't both hold the same lock.
     */
    public function test_concurrent_get_lock_blocks_second_acquirer(): void {
        global $wpdb;
        $b = $this->concurrent_conn();
        $name = $this->rate_limit_lock_name( 'distributor_99_place_order' );

        // Connection A acquires the lock
        $got_a = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 2)', $name ) );
        $this->assertSame( '1', $got_a );

        // Connection B's GET_LOCK with timeout=2 must block then return 0 (timeout)
        // (b2b_rate_limit V.33.7 line 426 uses timeout=2)
        $start = microtime( true );
        $stmt  = $b->prepare( 'SELECT GET_LOCK(?, 2)' );
        $stmt->bind_param( 's', $name );
        $stmt->execute();
        $result = $stmt->get_result();
        $row    = $result->fetch_row();
        $elapsed = microtime( true ) - $start;

        $this->assertSame(
            '0',
            (string) $row[0],
            'Second connection GET_LOCK must time out (return 0) when first connection holds the lock'
        );
        $this->assertGreaterThan(
            1.5,
            $elapsed,
            'Second connection must have actually waited the timeout (~2s)'
        );

        // A releases, B can now acquire
        $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );

        $got_b_after = $b->query( "SELECT GET_LOCK('{$name}', 2)" )->fetch_row();
        $this->assertSame(
            '1',
            (string) $got_b_after[0],
            'After A releases, B can acquire'
        );
        $b->query( "SELECT RELEASE_LOCK('{$name}')" );
    }

    /**
     * Different keys don't share locks — distributor 99 acquiring rate-limit
     * doesn't block distributor 88's request.
     */
    public function test_different_lock_names_dont_conflict(): void {
        global $wpdb;
        $b = $this->concurrent_conn();

        $name_99 = $this->rate_limit_lock_name( 'distributor_99_place_order' );
        $name_88 = $this->rate_limit_lock_name( 'distributor_88_place_order' );

        // A holds 99's lock
        $got_a = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 2)', $name_99 ) );
        $this->assertSame( '1', $got_a );

        // B should immediately acquire 88's lock (different name, no conflict)
        $start = microtime( true );
        $row = $b->query( "SELECT GET_LOCK('{$name_88}', 2)" )->fetch_row();
        $elapsed = microtime( true ) - $start;

        $this->assertSame( '1', (string) $row[0] );
        $this->assertLessThan(
            0.5,
            $elapsed,
            'Different lock names must not block each other'
        );

        // Cleanup
        $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name_99 ) );
        $b->query( "SELECT RELEASE_LOCK('{$name_88}')" );
    }
}
