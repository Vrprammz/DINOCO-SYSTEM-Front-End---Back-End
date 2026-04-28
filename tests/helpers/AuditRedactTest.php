<?php
/**
 * AuditRedactTest — pure-logic test of `dinoco_audit_redact_context`.
 *
 * Source: [Admin System] DINOCO Audit Log V.1.0 line 101+.
 *
 * Purpose: best-effort PII redaction before audit_log context_json hits DB.
 * Sensitive key substring match → '[REDACTED]'. Recurses into nested arrays.
 *
 * Privacy criticality: this is the LAST line of defense before PII enters
 * audit log persistence. PDPA §17 requires data minimization. If a key like
 * 'national_id' or 'access_token' slips through, regulator-visible data leak.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_audit_redact_context' ) ) {
    function dinoco_audit_redact_context( $ctx ) {
        // Note: real implementation delegates to dinoco_obs_redact_context if loaded.
        // Test the local fallback path (also identical algorithm).
        if ( ! is_array( $ctx ) ) return $ctx;
        $sensitive_keys = array(
            'phone', 'mobile', 'email', 'line_uid', 'lineuid',
            'token', 'secret', 'key', 'password', 'authorization',
            'api_key', 'bearer', 'national_id', 'credit_card',
            'idtoken', 'access_token',
        );
        $out = array();
        foreach ( $ctx as $k => $v ) {
            $lk = strtolower( (string) $k );
            $masked = false;
            foreach ( $sensitive_keys as $sk ) {
                if ( strpos( $lk, $sk ) !== false ) { $masked = true; break; }
            }
            if ( $masked ) {
                $out[ $k ] = '[REDACTED]';
            } elseif ( is_array( $v ) ) {
                $out[ $k ] = dinoco_audit_redact_context( $v );
            } else {
                $out[ $k ] = $v;
            }
        }
        return $out;
    }
}

class AuditRedactTest extends TestCase {

    public function test_non_array_passes_through(): void {
        $this->assertSame( 'plain string', dinoco_audit_redact_context( 'plain string' ) );
        $this->assertSame( 42, dinoco_audit_redact_context( 42 ) );
        $this->assertNull( dinoco_audit_redact_context( null ) );
    }

    public function test_empty_array_returns_empty(): void {
        $this->assertSame( array(), dinoco_audit_redact_context( array() ) );
    }

    public function test_redacts_phone_field(): void {
        $out = dinoco_audit_redact_context( array( 'phone' => '0812345678', 'name' => 'John' ) );
        $this->assertSame( '[REDACTED]', $out['phone'] );
        $this->assertSame( 'John', $out['name'] ); // non-sensitive preserved
    }

    public function test_redacts_email(): void {
        $out = dinoco_audit_redact_context( array( 'email' => 'admin@dinoco.in.th' ) );
        $this->assertSame( '[REDACTED]', $out['email'] );
    }

    public function test_redacts_line_uid_variants(): void {
        $out = dinoco_audit_redact_context( array(
            'line_uid' => 'Uxxxxx',
            'lineUid'  => 'Uyyyyy',
        ) );
        $this->assertSame( '[REDACTED]', $out['line_uid'] );
        $this->assertSame( '[REDACTED]', $out['lineUid'] );
    }

    public function test_redacts_credentials(): void {
        $out = dinoco_audit_redact_context( array(
            'access_token' => 'abc123',
            'api_key'      => 'sk_live_xxx',
            'password'     => 'p@ss',
            'authorization'=> 'Bearer xyz',
            'idtoken'      => 'eyJ...',
            'bearer'       => 'foo',
            'secret'       => 'shh',
        ) );
        foreach ( $out as $v ) {
            $this->assertSame( '[REDACTED]', $v );
        }
    }

    public function test_redacts_national_id_credit_card(): void {
        $out = dinoco_audit_redact_context( array(
            'national_id' => '1234567890123',
            'credit_card' => '4111-1111-1111-1111',
        ) );
        $this->assertSame( '[REDACTED]', $out['national_id'] );
        $this->assertSame( '[REDACTED]', $out['credit_card'] );
    }

    public function test_substring_match_redacts_user_phone_field(): void {
        // Substring match: 'user_phone' contains 'phone' → redact
        $out = dinoco_audit_redact_context( array( 'user_phone' => '0812345678' ) );
        $this->assertSame( '[REDACTED]', $out['user_phone'] );
    }

    public function test_substring_match_redacts_customer_email(): void {
        $out = dinoco_audit_redact_context( array( 'customer_email' => 'a@b' ) );
        $this->assertSame( '[REDACTED]', $out['customer_email'] );
    }

    public function test_case_insensitive_match(): void {
        $out = dinoco_audit_redact_context( array(
            'PHONE'    => '0812345678',
            'API_Key'  => 'sk_xx',
            'Password' => 'p',
        ) );
        $this->assertSame( '[REDACTED]', $out['PHONE'] );
        $this->assertSame( '[REDACTED]', $out['API_Key'] );
        $this->assertSame( '[REDACTED]', $out['Password'] );
    }

    public function test_nested_array_recursion(): void {
        $out = dinoco_audit_redact_context( array(
            'order_id' => 12345,
            'customer' => array(
                'name'  => 'John',
                'phone' => '0812345678',
                'meta'  => array(
                    'access_token' => 'abc',
                    'rank'         => 'silver',
                ),
            ),
        ) );
        $this->assertSame( 12345, $out['order_id'] );
        $this->assertSame( 'John', $out['customer']['name'] );
        $this->assertSame( '[REDACTED]', $out['customer']['phone'] );
        $this->assertSame( '[REDACTED]', $out['customer']['meta']['access_token'] );
        $this->assertSame( 'silver', $out['customer']['meta']['rank'] );
    }

    public function test_non_sensitive_keys_preserved(): void {
        $ctx = array(
            'order_id'       => 12345,
            'amount'         => 1500.50,
            'sku'            => 'DNC-NX500',
            'rank'           => 'gold',
            'distributor_id' => 'D-99',
        );
        $out = dinoco_audit_redact_context( $ctx );
        $this->assertSame( $ctx, $out );
    }

    public function test_mobile_field_redacted(): void {
        $out = dinoco_audit_redact_context( array( 'mobile' => '0812345678' ) );
        $this->assertSame( '[REDACTED]', $out['mobile'] );
    }

    /**
     * Defensive: 'token' substring should redact 'csrf_token' but NOT 'tokenize_count'
     * (current impl uses substr match — both would match. Document current behavior.)
     */
    public function test_substring_token_match_is_aggressive(): void {
        $out = dinoco_audit_redact_context( array(
            'csrf_token'    => 'abc',
            'tokenize_count'=> 5,
        ) );
        $this->assertSame( '[REDACTED]', $out['csrf_token'] );
        // tokenize_count contains 'token' substring → also redacted (aggressive but safe)
        $this->assertSame( '[REDACTED]', $out['tokenize_count'] );
    }

    public function test_idempotent_double_redact(): void {
        $first  = dinoco_audit_redact_context( array( 'phone' => '0812345678', 'name' => 'X' ) );
        $second = dinoco_audit_redact_context( $first );
        $this->assertSame( $first, $second );
    }
}
