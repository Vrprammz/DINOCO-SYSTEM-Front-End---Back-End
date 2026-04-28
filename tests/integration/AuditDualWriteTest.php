<?php
/**
 * AuditDualWriteTest — Phase 5 M2 (B.5).
 *
 * Source under test: [Admin System] DINOCO Audit Log V.1.0
 *   - dinoco_audit_log($args) — INSERT one row into wp_dinoco_audit_log
 *   - dinoco_audit_request_id() — request-scoped correlation ID generator
 *   - dinoco_audit_redact_context() — PII masking before persist
 *
 * Pillar 3 of the architectural refactor: every business mutation in DINOCO
 * (debt, stock, FSM, slip apply) emits a row to wp_dinoco_audit_log so we
 * have a single forensic chain across systems linked by request_id.
 *
 * Scope of this M2 test:
 *   1. dinoco_audit_log inserts a row with all expected columns
 *   2. Auto-generated request_id is consistent across same-request calls
 *   3. PII redaction applied to context array before persist (PDPA §17)
 *   4. Defaults applied when optional fields omitted
 *   5. Rejected (success=0) audit rows write the same as success=1 rows
 *   6. Multiple events for same target_type/target_id chain by request_id
 *
 * The "dual-write" in the name refers to wp_dinoco_audit_log being the
 * UNIFIED forensic index — same business mutation may also write to
 * domain-specific tables (slip_log, stock_transactions) but audit_log
 * is the cross-system correlation point.
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class AuditDualWriteTest extends DinocoIntegrationTestCase {

    protected function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-distributors.sql' );

        try {
            $this->eval_snippet_inline( '[Admin System] DINOCO Audit Log' );
        } catch ( \Throwable $e ) {
            $this->markTestSkipped( 'Audit Log snippet cannot be loaded: ' . $e->getMessage() );
        }

        if ( ! function_exists( 'dinoco_audit_log' ) ) {
            $this->markTestSkipped( 'dinoco_audit_log not defined after snippet eval' );
        }

        // Reset request_id global so each test gets a fresh ID (otherwise
        // the per-request cache would leak across PHPUnit tests).
        unset( $GLOBALS['_dinoco_audit_req_id'] );
    }

    /** Fetch the most recent audit row matching filters. */
    private function fetch_latest_row( array $where = array() ): ?object {
        global $wpdb;
        $clauses = array( '1=1' );
        foreach ( $where as $col => $val ) {
            $clauses[] = $wpdb->prepare( "{$col} = %s", (string) $val );
        }
        $sql = "SELECT * FROM {$wpdb->prefix}dinoco_audit_log
                WHERE " . implode( ' AND ', $clauses ) . "
                ORDER BY id DESC LIMIT 1";
        $row = $wpdb->get_row( $sql );
        return $row ? (object) $row : null;
    }

    public function test_basic_insert_writes_row(): void {
        $log_id = dinoco_audit_log( array(
            'event_type'  => 'debt_subtract',
            'actor_type'  => 'admin',
            'actor_id'    => '9001',
            'target_type' => 'distributor',
            'target_id'   => '9001',
            'amount'      => 1500.00,
        ) );

        $this->assertIsInt( $log_id, 'dinoco_audit_log returns insert id on success' );
        $this->assertGreaterThan( 0, $log_id );

        $row = $this->fetch_latest_row( array( 'event_type' => 'debt_subtract' ) );
        $this->assertNotNull( $row );
        $this->assertSame( 'debt_subtract', $row->event_type );
        $this->assertSame( 'admin', $row->actor_type );
        $this->assertSame( '9001', $row->target_id );
        $this->assertSame( '1500.00', $row->amount );
    }

    public function test_request_id_consistent_across_same_request_calls(): void {
        if ( ! function_exists( 'dinoco_audit_request_id' ) ) {
            $this->markTestSkipped( 'dinoco_audit_request_id not available' );
        }

        $rid_1 = dinoco_audit_request_id();
        $rid_2 = dinoco_audit_request_id();

        $this->assertSame( $rid_1, $rid_2, 'Request ID must be stable within same request' );
        $this->assertNotEmpty( $rid_1, 'Request ID must not be empty' );
        $this->assertMatchesRegularExpression( '/^[a-f0-9]{8,64}$/', $rid_1, 'Request ID must be hex-like' );
    }

    public function test_pii_redaction_applied_to_context(): void {
        dinoco_audit_log( array(
            'event_type'  => 'pii_test',
            'target_type' => 'order',
            'target_id'   => '999',
            'context'     => array(
                'customer_phone' => '0812345678',
                'access_token'   => 'eyJhbGciOiJ...',
                'order_id'       => 12345, // not sensitive — should be preserved
                'name'           => 'John', // not sensitive — should be preserved
            ),
        ) );

        $row = $this->fetch_latest_row( array( 'event_type' => 'pii_test' ) );
        $this->assertNotNull( $row );
        $this->assertNotNull( $row->context_json );

        $ctx = json_decode( $row->context_json, true );
        $this->assertIsArray( $ctx );

        $this->assertSame( '[REDACTED]', $ctx['customer_phone'] ?? null, 'phone substring must be redacted' );
        $this->assertSame( '[REDACTED]', $ctx['access_token'] ?? null, 'access_token must be redacted' );
        $this->assertSame( 12345, $ctx['order_id'] ?? null, 'order_id non-sensitive must be preserved' );
        $this->assertSame( 'John', $ctx['name'] ?? null, 'name non-sensitive must be preserved' );
    }

    public function test_defaults_applied_when_optional_fields_omitted(): void {
        dinoco_audit_log( array(
            'event_type' => 'minimal',
        ) );

        $row = $this->fetch_latest_row( array( 'event_type' => 'minimal' ) );
        $this->assertNotNull( $row );
        $this->assertSame( '1', (string) $row->success, 'success defaults to 1' );
        $this->assertNotNull( $row->created_at, 'created_at auto-populated' );
        $this->assertNotEmpty( $row->request_id, 'request_id auto-filled' );
    }

    public function test_failed_event_writes_with_success_zero(): void {
        dinoco_audit_log( array(
            'event_type' => 'fsm_transition',
            'target_id'  => '500',
            'success'    => false,
            'error_msg'  => 'invalid_transition',
        ) );

        $row = $this->fetch_latest_row( array( 'event_type' => 'fsm_transition', 'target_id' => '500' ) );
        $this->assertNotNull( $row );
        $this->assertSame( '0', (string) $row->success );
        $this->assertSame( 'invalid_transition', $row->error_msg );
    }

    public function test_multiple_events_share_request_id_for_chain(): void {
        if ( ! function_exists( 'dinoco_audit_request_id' ) ) {
            $this->markTestSkipped( 'dinoco_audit_request_id not available' );
        }

        $expected_rid = dinoco_audit_request_id();

        dinoco_audit_log( array( 'event_type' => 'chain_a', 'target_id' => '777' ) );
        dinoco_audit_log( array( 'event_type' => 'chain_b', 'target_id' => '777' ) );
        dinoco_audit_log( array( 'event_type' => 'chain_c', 'target_id' => '777' ) );

        global $wpdb;
        $rids = $wpdb->get_col(
            "SELECT request_id FROM {$wpdb->prefix}dinoco_audit_log
             WHERE event_type IN ('chain_a','chain_b','chain_c') AND target_id = '777'
             ORDER BY id ASC"
        );

        $this->assertCount( 3, $rids );
        $this->assertSame( $rids[0], $rids[1], 'chain_a and chain_b share request_id' );
        $this->assertSame( $rids[1], $rids[2], 'chain_b and chain_c share request_id' );
        $this->assertSame( $expected_rid, $rids[0], 'all chained events match the request scope' );
    }

    public function test_chain_fetcher_returns_related_rows(): void {
        if ( ! function_exists( 'dinoco_audit_chain' ) ) {
            $this->markTestSkipped( 'dinoco_audit_chain not available' );
        }

        dinoco_audit_log( array( 'event_type' => 'event_x', 'target_type' => 'order', 'target_id' => '888' ) );
        dinoco_audit_log( array( 'event_type' => 'event_y', 'target_type' => 'order', 'target_id' => '888' ) );
        dinoco_audit_log( array( 'event_type' => 'event_z', 'target_type' => 'order', 'target_id' => '999' ) );

        $chain = dinoco_audit_chain( 'order', '888' );
        $this->assertIsArray( $chain );
        $this->assertGreaterThanOrEqual( 2, count( $chain ), 'Chain must include all rows for target order #888' );

        foreach ( $chain as $row ) {
            $this->assertSame( '888', (string) $row->target_id, 'Chain rows must filter by target_id' );
        }
    }

    public function test_event_type_indexed_for_fast_lookup(): void {
        global $wpdb;
        $indexes = $wpdb->get_results(
            "SHOW INDEX FROM {$wpdb->prefix}dinoco_audit_log WHERE Key_name = 'idx_event_created'"
        );
        $this->assertNotEmpty( $indexes, 'idx_event_created index must exist for hot-path event filtering' );
    }
}
