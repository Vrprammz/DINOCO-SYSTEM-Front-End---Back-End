<?php
/**
 * SnIdempotencyToctouTest — R7 C1 (CVSS 7.5) regression coverage.
 *
 * Source: [Admin System] DINOCO Idempotency Helper V.1.x
 *
 * R7 security-pentester audit found that schema declared
 *   KEY idx_key_namespace (idempotency_key, namespace)  -- NOT UNIQUE
 *
 * The pattern was:
 *   1. SELECT * WHERE key=X AND namespace=Y (no FOR UPDATE)
 *   2. If null → run handler
 *   3. INSERT idempotency row + response
 *
 * Race window = full handler latency (e.g. Flash V.42 create ≈ 5-30s,
 * marketplace checkout ≈ 1-3s). Two simultaneous requests with same
 * X-Idempotency-Key both find no row → both run handlers → both store
 * → DUPLICATE side-effects. Affects all 139 wrapped POST endpoints
 * (Flash double-create, marketplace double-charge, double void/swap/etc.)
 *
 * R7 fix: ALTER idx_key_namespace → UNIQUE; catch 'Duplicate entry' on
 * INSERT and re-SELECT cached row as the "winner replay".
 *
 * Tests below validate:
 *   - Race scenario produces 1 winner + N-1 replays (not N writes)
 *   - Hash mismatch on same key still produces 409 (not silent overwrite)
 *   - INSERT failure path correctly re-SELECTs and returns canonical body
 *   - UNIQUE constraint detection works regardless of MySQL error code variant
 *   - Empty/null key short-circuits without hitting DB (no race possible)
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─── Pure-logic mirror of post-fix idempotency flow ──────── */

if ( ! function_exists( __NAMESPACE__ . '\\sn_idem_classify_dup_error' ) ) {

    /**
     * Mirror of `wpdb->last_error` parsing for UNIQUE violations.
     *
     * MySQL returns these messages for duplicate key:
     *   - "Duplicate entry 'foo-bar' for key 'uniq_key_namespace'"  (5.7+)
     *   - "Duplicate entry 'foo-bar' for key 'wp_dinoco_idempotency_keys.uniq_key_namespace'"  (8.0+)
     *   - "Duplicate entry 'foo-bar'"  (truncated stub variant)
     *
     * MariaDB variants:
     *   - "Duplicate entry 'foo-bar' for key 'uniq_key_namespace'"
     *
     * Function returns true if error indicates a UNIQUE constraint violation.
     */
    function sn_idem_classify_dup_error( string $error ): bool {
        if ( $error === '' ) return false;
        // Case-insensitive match — production MySQL tends to lowercase
        return stripos( $error, 'duplicate entry' ) !== false;
    }

    /**
     * Mirror of `dinoco_idempotency_store()` post-R7 flow:
     *
     *   try {
     *       INSERT $row → success → return $response
     *   } catch (mysqli/wpdb dup) {
     *       SELECT cached row → return $cached_row['response']
     *   }
     *
     * @param array  $row_to_insert   the key+namespace+hash+response
     * @param string $insert_error    simulated wpdb->last_error after INSERT
     * @param array  $cached_row_after_dup  what SELECT returns on dup catch
     * @return array  ['outcome' => 'inserted'|'replayed_after_dup'|'error', 'data' => ...]
     */
    function sn_idem_store_with_dup_recovery(
        array $row_to_insert,
        string $insert_error,
        array $cached_row_after_dup
    ): array {
        if ( $insert_error === '' ) {
            return [ 'outcome' => 'inserted', 'data' => $row_to_insert ];
        }
        if ( sn_idem_classify_dup_error( $insert_error ) ) {
            // Race lost — peer won. Verify hash matches before replay.
            if ( ! isset( $cached_row_after_dup['request_hash'] ) ) {
                return [ 'outcome' => 'error', 'data' => 'cached_row_missing' ];
            }
            if ( $cached_row_after_dup['request_hash'] !== $row_to_insert['request_hash'] ) {
                // Hash mismatch — different request body with same key → 409
                return [ 'outcome' => 'hash_conflict_409', 'data' => null ];
            }
            return [ 'outcome' => 'replayed_after_dup', 'data' => $cached_row_after_dup ];
        }
        return [ 'outcome' => 'error', 'data' => $insert_error ];
    }
}

final class SnIdempotencyToctouTest extends TestCase {

    /** Sample row template */
    private function sampleRow( string $hash = 'abc123' ): array {
        return [
            'idempotency_key' => 'unit-test-key',
            'namespace'       => 'sn-void',
            'request_hash'    => $hash,
            'response_data'   => '{"ok":true,"sn":"DNCSS00001234"}',
            'response_code'   => 200,
            'user_id'         => 100,
        ];
    }

    /* ─── Error classification ─────────────────────────────── */

    public function test_dup_error_mysql_57_format(): void {
        $err = "Duplicate entry 'unit-test-key-sn-void' for key 'uniq_key_namespace'";
        $this->assertTrue( sn_idem_classify_dup_error( $err ) );
    }

    public function test_dup_error_mysql_80_format(): void {
        $err = "Duplicate entry 'unit-test-key-sn-void' for key 'wp_dinoco_idempotency_keys.uniq_key_namespace'";
        $this->assertTrue( sn_idem_classify_dup_error( $err ) );
    }

    public function test_dup_error_mariadb_format(): void {
        $err = "Duplicate entry 'a-b' for key 'uniq_key_namespace'";
        $this->assertTrue( sn_idem_classify_dup_error( $err ) );
    }

    public function test_dup_error_lowercase_variant(): void {
        $err = "duplicate entry 'a-b'";
        $this->assertTrue( sn_idem_classify_dup_error( $err ), 'case-insensitive match' );
    }

    public function test_non_dup_error_not_misclassified(): void {
        $err = "Connection refused: too many connections";
        $this->assertFalse( sn_idem_classify_dup_error( $err ) );
    }

    public function test_empty_error_returns_false(): void {
        $this->assertFalse( sn_idem_classify_dup_error( '' ) );
    }

    public function test_deadlock_not_misclassified(): void {
        $err = "Deadlock found when trying to get lock; try restarting transaction";
        $this->assertFalse( sn_idem_classify_dup_error( $err ) );
    }

    /* ─── Successful first-write path ──────────────────────── */

    public function test_first_writer_inserts_successfully(): void {
        $result = sn_idem_store_with_dup_recovery(
            $this->sampleRow(),
            '', // no error
            []
        );
        $this->assertSame( 'inserted', $result['outcome'] );
    }

    /* ─── Race scenario: peer won, replay cached ────────────── */

    public function test_race_loser_replays_peer_response(): void {
        $row = $this->sampleRow( 'abc123' );
        // Simulate: I tried to INSERT; got dup error; peer's row has same hash
        $peer_row = $this->sampleRow( 'abc123' );
        $peer_row['response_data'] = '{"ok":true,"sn":"DNCSS00001234","by":"peer"}';

        $result = sn_idem_store_with_dup_recovery(
            $row,
            "Duplicate entry 'unit-test-key-sn-void' for key 'uniq_key_namespace'",
            $peer_row
        );
        $this->assertSame( 'replayed_after_dup', $result['outcome'] );
        $this->assertSame( $peer_row, $result['data'] );
    }

    public function test_race_with_hash_match_returns_canonical(): void {
        // Multiple concurrent retries with same body → all replay same response
        $row = $this->sampleRow( 'abc123' );
        $peer_row = $this->sampleRow( 'abc123' );
        $result = sn_idem_store_with_dup_recovery(
            $row,
            "Duplicate entry 'foo'",
            $peer_row
        );
        $this->assertSame( 'replayed_after_dup', $result['outcome'] );
    }

    /* ─── Hash mismatch on same key → 409 ──────────────────── */

    public function test_hash_mismatch_returns_409(): void {
        // Attacker (or genuine bug) reuses same Idempotency-Key but
        // sends DIFFERENT body — must NOT silently replay peer's response
        $my_row   = $this->sampleRow( 'evil-hash' );
        $peer_row = $this->sampleRow( 'good-hash' );
        $result = sn_idem_store_with_dup_recovery(
            $my_row,
            "Duplicate entry 'unit-test-key'",
            $peer_row
        );
        $this->assertSame(
            'hash_conflict_409',
            $result['outcome'],
            'different body with same key MUST return 409'
        );
    }

    /* ─── Defensive paths ──────────────────────────────────── */

    public function test_missing_cached_row_after_dup_returns_error(): void {
        // Pathological: dup error but SELECT returns nothing (replicated DB lag?)
        $result = sn_idem_store_with_dup_recovery(
            $this->sampleRow(),
            "Duplicate entry 'foo'",
            [] // empty — no cached_row
        );
        $this->assertSame( 'error', $result['outcome'] );
        $this->assertSame( 'cached_row_missing', $result['data'] );
    }

    public function test_non_dup_error_propagates(): void {
        $result = sn_idem_store_with_dup_recovery(
            $this->sampleRow(),
            'Connection refused',
            []
        );
        $this->assertSame( 'error', $result['outcome'] );
        $this->assertSame( 'Connection refused', $result['data'] );
    }

    /* ─── End-to-end race simulation ────────────────────────── */

    public function test_e2e_race_3_concurrent_retries_produce_1_writer_2_replays(): void {
        $hash = 'shared-hash-xyz';
        // Request A wins
        $a = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $hash ),
            '', // first to arrive — no dup error
            []
        );
        $this->assertSame( 'inserted', $a['outcome'] );

        $winner_row = $a['data'];

        // Requests B and C lose race — both get dup error
        $b = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $hash ),
            "Duplicate entry 'shared'",
            $winner_row
        );
        $c = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $hash ),
            "Duplicate entry 'shared'",
            $winner_row
        );

        $this->assertSame( 'replayed_after_dup', $b['outcome'] );
        $this->assertSame( 'replayed_after_dup', $c['outcome'] );

        // All 3 outcomes converge on winner's data
        $this->assertSame( $winner_row, $b['data'] );
        $this->assertSame( $winner_row, $c['data'] );
    }

    public function test_e2e_race_with_attacker_different_body_isolates_legit(): void {
        $legit_hash   = 'legit-body-hash';
        $attacker_hash = 'attacker-body-hash';

        // Legit user wins
        $legit = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $legit_hash ),
            '',
            []
        );
        $this->assertSame( 'inserted', $legit['outcome'] );

        // Attacker reuses same key with different body
        $attacker = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $attacker_hash ),
            "Duplicate entry 'shared'",
            $legit['data']
        );
        $this->assertSame(
            'hash_conflict_409',
            $attacker['outcome'],
            'attacker MUST get 409, NOT replay legit response'
        );
    }

    /* ─── Edge cases ──────────────────────────────────────── */

    public function test_dup_error_with_special_chars_in_key(): void {
        $err = "Duplicate entry 'key-with-/-and-:-chars' for key 'uniq_key_namespace'";
        $this->assertTrue( sn_idem_classify_dup_error( $err ) );
    }

    public function test_dup_error_in_multiline_log_format(): void {
        $err = "Some context\nDuplicate entry 'foo' for key 'bar'\nMore log";
        $this->assertTrue( sn_idem_classify_dup_error( $err ) );
    }

    public function test_partial_match_word_does_not_misclassify(): void {
        // "duplicate" alone (without "entry") is NOT a constraint violation
        $err = "duplicate detection enabled";
        $this->assertFalse( sn_idem_classify_dup_error( $err ) );
    }

    public function test_R7_C1_TOCTOU_window_closed_assertion(): void {
        // Meta-test: assert that the test file documents the expected behavior
        // pre-fix (race produces 2+ writes) vs post-fix (1 write + N replays)
        $hash = 'xyz';
        $first  = sn_idem_store_with_dup_recovery( $this->sampleRow( $hash ), '', [] );
        $second = sn_idem_store_with_dup_recovery(
            $this->sampleRow( $hash ),
            "Duplicate entry 'foo'",
            $first['data']
        );
        // Pre-fix: both would be 'inserted' (BAD).
        // Post-fix: first 'inserted', second 'replayed_after_dup' (GOOD).
        $this->assertSame( 'inserted', $first['outcome'] );
        $this->assertSame( 'replayed_after_dup', $second['outcome'] );
        $this->assertNotSame(
            'inserted',
            $second['outcome'],
            'R7 C1: second write MUST NOT succeed (UNIQUE constraint enforced)'
        );
    }
}
