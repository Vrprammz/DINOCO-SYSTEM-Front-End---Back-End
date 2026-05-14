<?php
/**
 * SnStolenReportTest — pure-logic test of W11.1 F#14 stolen plate report flow.
 *
 * Source: [System] DINOCO SN REST API V.0.36+ — dinoco_sn_rest_stolen_report()
 * Plan: ~/.claude/plans/wiki-doc-sequential-lantern.md v2.13 §F.14
 * Phase: 3 W11.1 (companion to W11.2 SnStolenRecoveryTest covering /stolen/{id}/recover)
 *
 * Asserts pure-logic decision points used by the REST handler:
 *   1. Photo-evidence required (V.0.28 HIGH-4 — block reports w/o evidence)
 *   2. SN input normalization (uppercase + trim)
 *   3. Ownership gate (customer can report own plate; admin = any)
 *   4. Terminal-status gate (voided/recalled → 409 already_terminal)
 *   5. State gate (must be registered/claimed/shipped/allocated_to_order → else 422)
 *   6. Required input gate (sn required → 400)
 *   7. Audit row shape (event_type=plate_recalled + category=stolen)
 *   8. Layered rate-limit identifier shape (user/IP/SN keys distinct)
 *
 * Pure-logic only — no DB, no LINE API, no idempotency runtime.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_validate_evidence' ) ) {
    /**
     * Mirror of evidence-required guard (V.0.28 HIGH-4).
     */
    function sn_stolen_validate_evidence( $evidence_ids_raw ) {
        $evidence_ids = array();
        if ( is_array( $evidence_ids_raw ) ) {
            $evidence_ids = array_values( array_filter( array_map( 'absint', $evidence_ids_raw ) ) );
        }
        if ( empty( $evidence_ids ) ) {
            return array( 'allowed' => false, 'error_code' => 'photo_evidence_required', 'http_status' => 400 );
        }
        return array( 'allowed' => true, 'evidence_ids' => $evidence_ids );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_normalize_sn' ) ) {
    /**
     * Mirror of SN normalization.
     */
    function sn_stolen_normalize_sn( $sn ) {
        return strtoupper( trim( (string) $sn ) );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_validate_ownership' ) ) {
    /**
     * Mirror of ownership gate — customer = own plate only; admin = any.
     */
    function sn_stolen_validate_ownership( $is_admin, $owner_id, $reporter_id ) {
        $owner_id    = (int) $owner_id;
        $reporter_id = (int) $reporter_id;
        if ( $is_admin ) {
            return array( 'allowed' => true );
        }
        if ( $owner_id !== $reporter_id ) {
            return array( 'allowed' => false, 'error_code' => 'rest_forbidden', 'http_status' => 403 );
        }
        return array( 'allowed' => true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_validate_state' ) ) {
    /**
     * Mirror of state-gate logic — terminal vs reportable vs invalid.
     */
    function sn_stolen_validate_state( $status ) {
        $status = strtolower( trim( (string) $status ) );
        $terminal   = array( 'voided', 'recalled' );
        $reportable = array( 'registered', 'claimed', 'shipped', 'allocated_to_order' );

        if ( in_array( $status, $terminal, true ) ) {
            return array( 'allowed' => false, 'error_code' => 'already_terminal', 'http_status' => 409 );
        }
        if ( ! in_array( $status, $reportable, true ) ) {
            return array( 'allowed' => false, 'error_code' => 'invalid_state', 'http_status' => 422 );
        }
        return array( 'allowed' => true );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_build_audit_context' ) ) {
    /**
     * Mirror of audit-context shape used in dinoco_sn_audit_log() call.
     */
    function sn_stolen_build_audit_context( $stolen_log_id, $reporter_id, $police_report_no ) {
        return array(
            'event_type'  => 'plate_recalled',
            'status_from' => null,
            'status_to'   => 'recalled',
            'category'    => 'stolen',
            'context'     => array(
                'category'         => 'stolen',
                'stolen_log_id'    => (int) $stolen_log_id,
                'reporter_user_id' => (int) $reporter_id,
                'police_report_no' => (string) $police_report_no,
            ),
            'audit_event' => 'stolen_report',
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_stolen_rate_limit_keys' ) ) {
    /**
     * Mirror of layered rate-limit key shapes (R7 C3 CVSS 7.4 fix).
     * 3 distinct buckets: per-user / per-IP / per-SN.
     */
    function sn_stolen_rate_limit_keys( $user_id, $ip, $sn ) {
        $sn = strtoupper( trim( (string) $sn ) );
        return array(
            'user' => array( 'key' => 'sn_stolen_user_' . (int) $user_id, 'max' => 5,  'window' => 3600 ),
            'ip'   => array( 'key' => 'sn_stolen_ip_'   . md5( (string) $ip ), 'max' => 10, 'window' => 3600 ),
            'sn'   => array( 'key' => 'sn_stolen_sn_'   . md5( $sn ), 'max' => 3,  'window' => 86400 ),
        );
    }
}

class SnStolenReportTest extends TestCase {

    /* ─── 1. Evidence gate (V.0.28 HIGH-4) ─── */

    public function test_evidence_missing_blocked_400() {
        $r = sn_stolen_validate_evidence( null );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'photo_evidence_required', $r['error_code'] );
        $this->assertSame( 400, $r['http_status'] );
    }

    public function test_evidence_empty_array_blocked_400() {
        $r = sn_stolen_validate_evidence( array() );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'photo_evidence_required', $r['error_code'] );
    }

    public function test_evidence_with_valid_ids_allowed() {
        $r = sn_stolen_validate_evidence( array( 42, 99 ) );
        $this->assertTrue( $r['allowed'] );
        $this->assertSame( array( 42, 99 ), $r['evidence_ids'] );
    }

    public function test_evidence_strings_coerced_to_int() {
        $r = sn_stolen_validate_evidence( array( '101', '202' ) );
        $this->assertTrue( $r['allowed'] );
        $this->assertSame( array( 101, 202 ), $r['evidence_ids'] );
    }

    public function test_evidence_zero_values_filtered_out() {
        $r = sn_stolen_validate_evidence( array( 0, '0', null ) );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'photo_evidence_required', $r['error_code'] );
    }

    /* ─── 2. SN normalization ─── */

    public function test_sn_normalize_uppercase_and_trim() {
        $this->assertSame( 'DNCSS123ABC', sn_stolen_normalize_sn( '  dncss123abc  ' ) );
    }

    public function test_sn_normalize_empty_input_returns_empty() {
        $this->assertSame( '', sn_stolen_normalize_sn( '   ' ) );
    }

    /* ─── 3. Ownership gate ─── */

    public function test_ownership_admin_can_report_any_plate() {
        $r = sn_stolen_validate_ownership( true, 42, 99 );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_ownership_customer_own_plate_allowed() {
        $r = sn_stolen_validate_ownership( false, 42, 42 );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_ownership_customer_other_plate_403() {
        $r = sn_stolen_validate_ownership( false, 42, 99 );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'rest_forbidden', $r['error_code'] );
        $this->assertSame( 403, $r['http_status'] );
    }

    public function test_ownership_unowned_plate_customer_blocked() {
        // owner_id=0 means unowned (admin-side report scenario);
        // customer (reporter > 0) cannot report unowned plate.
        $r = sn_stolen_validate_ownership( false, 0, 42 );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'rest_forbidden', $r['error_code'] );
    }

    /* ─── 4. State gate ─── */

    public function test_state_voided_blocked_409() {
        $r = sn_stolen_validate_state( 'voided' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'already_terminal', $r['error_code'] );
        $this->assertSame( 409, $r['http_status'] );
    }

    public function test_state_recalled_blocked_409() {
        $r = sn_stolen_validate_state( 'recalled' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'already_terminal', $r['error_code'] );
    }

    public function test_state_registered_allowed() {
        $r = sn_stolen_validate_state( 'registered' );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_state_claimed_allowed() {
        $r = sn_stolen_validate_state( 'claimed' );
        $this->assertTrue( $r['allowed'] );
    }

    public function test_state_in_pool_blocked_422() {
        // In-pool plates have no owner → not yet reportable as stolen.
        $r = sn_stolen_validate_state( 'in_pool' );
        $this->assertFalse( $r['allowed'] );
        $this->assertSame( 'invalid_state', $r['error_code'] );
        $this->assertSame( 422, $r['http_status'] );
    }

    public function test_state_case_insensitive() {
        $r = sn_stolen_validate_state( 'REGISTERED' );
        $this->assertTrue( $r['allowed'] );
    }

    /* ─── 5. Audit context shape ─── */

    public function test_audit_event_type_is_plate_recalled() {
        $ctx = sn_stolen_build_audit_context( 1, 42, 'CR-2026-001' );
        $this->assertSame( 'plate_recalled', $ctx['event_type'] );
        $this->assertSame( 'recalled', $ctx['status_to'] );
    }

    public function test_audit_category_is_stolen() {
        $ctx = sn_stolen_build_audit_context( 1, 42, 'CR-2026-001' );
        $this->assertSame( 'stolen', $ctx['category'] );
        $this->assertSame( 'stolen', $ctx['context']['category'] );
    }

    public function test_audit_event_audit_field_is_stolen_report() {
        $ctx = sn_stolen_build_audit_context( 99, 42, 'CR-X' );
        $this->assertSame( 'stolen_report', $ctx['audit_event'] );
    }

    public function test_audit_context_contains_stolen_log_id() {
        $ctx = sn_stolen_build_audit_context( 99, 42, 'CR-X' );
        $this->assertSame( 99, $ctx['context']['stolen_log_id'] );
        $this->assertSame( 42, $ctx['context']['reporter_user_id'] );
    }

    /* ─── 6. Rate-limit key shape (R7 C3 layered defense) ─── */

    public function test_rate_limit_three_distinct_buckets() {
        $keys = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'DNCSS123' );
        $this->assertArrayHasKey( 'user', $keys );
        $this->assertArrayHasKey( 'ip', $keys );
        $this->assertArrayHasKey( 'sn', $keys );
    }

    public function test_rate_limit_user_5_per_hour() {
        $keys = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'DNCSS123' );
        $this->assertSame( 5, $keys['user']['max'] );
        $this->assertSame( 3600, $keys['user']['window'] );
        $this->assertSame( 'sn_stolen_user_42', $keys['user']['key'] );
    }

    public function test_rate_limit_ip_10_per_hour_md5_hashed() {
        $keys = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'DNCSS123' );
        $this->assertSame( 10, $keys['ip']['max'] );
        $this->assertSame( 3600, $keys['ip']['window'] );
        // IP md5-hashed to avoid plaintext IP in transient key (PDPA hardening)
        $this->assertStringStartsWith( 'sn_stolen_ip_', $keys['ip']['key'] );
        $this->assertSame( 'sn_stolen_ip_' . md5( '1.2.3.4' ), $keys['ip']['key'] );
    }

    public function test_rate_limit_sn_3_per_24h_md5_hashed() {
        $keys = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'dncss123' );
        $this->assertSame( 3, $keys['sn']['max'] );
        $this->assertSame( 86400, $keys['sn']['window'] );
        // SN uppercased + md5 → case-insensitive cap
        $this->assertSame( 'sn_stolen_sn_' . md5( 'DNCSS123' ), $keys['sn']['key'] );
    }

    public function test_rate_limit_sn_case_insensitive_same_bucket() {
        $a = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'dncss123' );
        $b = sn_stolen_rate_limit_keys( 99, '5.6.7.8', 'DNCSS123' );
        // Same plate → same bucket regardless of reporter or IP
        $this->assertSame( $a['sn']['key'], $b['sn']['key'] );
    }

    public function test_rate_limit_user_keys_distinct_per_user() {
        $a = sn_stolen_rate_limit_keys( 42, '1.2.3.4', 'DNCSS123' );
        $b = sn_stolen_rate_limit_keys( 99, '1.2.3.4', 'DNCSS123' );
        $this->assertNotSame( $a['user']['key'], $b['user']['key'] );
    }
}
