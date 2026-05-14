<?php
/**
 * ClaimBankResolverTest — pure-logic tests for Claim Bank Settings (Sprint 9 Phase 1 Task 1.9).
 *
 * Source of truth: [Admin System] DINOCO Service Center & Claims V.33.0 (DB_ID 27)
 *   - dinoco_claim_bank_code_whitelist()
 *   - dinoco_claim_bank_field_keys($bucket)
 *   - dinoco_claim_bank_read_bucket($bucket)
 *   - dinoco_claim_bank_resolve($use_walkin)
 *   - dinoco_claim_bank_validate($payload, $bucket)
 *   - dinoco_claim_bank_maybe_migrate_constants()  [partial — flag-driven only]
 *
 * We re-declare helpers INLINE (no WP bootstrap, no DB, no HTTP) — mirrors
 * ClaimNotifPureLogicTest / CurrencyTest / FlagAuditTest pattern. We stub
 * get_option / constant / sanitize_text_field via class fixtures so the
 * tests exercise the same control-flow as the real snippet without needing
 * a WordPress runtime.
 *
 * Coverage:
 *   • Tier 1 (wp_options) takes priority over Tier 2 (constants)
 *   • Tier 2 (constants) used when wp_options empty
 *   • Tier 3 (sentinel) returned when both empty
 *   • Walk-in bucket falls back to default when walk-in not configured
 *   • Walk-in bucket isolated from default when explicitly configured
 *   • Validation regex: bank_account format
 *   • Validation whitelist: bank_code must be canonical Slip2Go code
 *   • Validation URL: bank_logo_url https-only enforcement
 *   • Validation max-length: bank_holder (128) + bank_name (64)
 *   • Migration idempotency: won't re-seed when flag already set
 *   • bank_name_en auto-fill from whitelist when blank
 *   • Field-keys mapping default vs walkin prefix correctness
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\ClaimBank;

use PHPUnit\Framework\TestCase;

// ──────────────────────────────────────────────────────────────────────────
// Fixture: in-memory wp_option + constant stores. The helpers under test
// call get_option() and defined()/constant() which we shim in this namespace.
// ──────────────────────────────────────────────────────────────────────────

final class FakeStore {
    public static $options = array();   // wp_options
    public static $constants = array(); // PHP constants
    public static $audit_log_calls = array();
    public static $flag_audit_log_calls = array();

    public static function reset(): void {
        self::$options = array();
        self::$constants = array();
        self::$audit_log_calls = array();
        self::$flag_audit_log_calls = array();
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Shim WP functions used by the helpers under test (namespaced so they
// only override within this test file's scope).
// ──────────────────────────────────────────────────────────────────────────

if ( ! function_exists( __NAMESPACE__ . '\\get_option' ) ) {
    function get_option( $key, $default = '' ) {
        return FakeStore::$options[ $key ] ?? $default;
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\update_option' ) ) {
    function update_option( $key, $value, $autoload = null ) {
        FakeStore::$options[ $key ] = $value;
        return true;
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\defined' ) ) {
    function defined( $name ) {
        return array_key_exists( $name, FakeStore::$constants );
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\constant' ) ) {
    function constant( $name ) {
        return FakeStore::$constants[ $name ] ?? null;
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\sanitize_text_field' ) ) {
    function sanitize_text_field( $v ) {
        $v = is_string( $v ) ? $v : '';
        $v = strip_tags( $v );
        $v = trim( preg_replace( '/[\r\n\t]+/', ' ', $v ) );
        return $v;
    }
}
if ( ! function_exists( __NAMESPACE__ . '\\esc_url_raw' ) ) {
    function esc_url_raw( $v ) {
        return is_string( $v ) ? trim( $v ) : '';
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Inline helpers — copied from Service Center V.33.0. When the snippets
// split into composer packages, swap to `require` + real source.
// ──────────────────────────────────────────────────────────────────────────

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_code_whitelist' ) ) {
    function dinoco_claim_bank_code_whitelist() {
        return array(
            '002' => 'Bangkok Bank',
            '004' => 'KBANK',
            '006' => 'Krungthai Bank',
            '011' => 'TMBThanachart',
            '014' => 'SCB',
            '025' => 'CIMB Thai',
            '030' => 'Government Savings Bank',
            '069' => 'Kiatnakin Phatra Bank',
            '073' => 'LH Bank',
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_field_keys' ) ) {
    function dinoco_claim_bank_field_keys( $bucket = 'default' ) {
        $bucket = ( $bucket === 'walkin' ) ? 'walkin' : 'default';
        $opt_prefix   = ( $bucket === 'walkin' ) ? 'dinoco_claim_walkin_bank_' : 'dinoco_claim_bank_';
        $const_prefix = ( $bucket === 'walkin' ) ? 'DINOCO_CLAIM_WALKIN_BANK_' : 'DINOCO_CLAIM_BANK_';
        $fields = array( 'name', 'name_en', 'account', 'holder', 'code', 'branch', 'logo_url' );
        $options = array();
        $constants = array();
        foreach ( $fields as $f ) {
            $options[ $f ]   = $opt_prefix . $f;
            $constants[ $f ] = $const_prefix . strtoupper( $f );
        }
        return array( 'options' => $options, 'constants' => $constants );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_read_bucket' ) ) {
    function dinoco_claim_bank_read_bucket( $bucket ) {
        $keys = dinoco_claim_bank_field_keys( $bucket );
        $out = array(
            'bank_name' => '', 'bank_name_en' => '', 'bank_account' => '',
            'bank_holder' => '', 'bank_code' => '', 'bank_branch' => '',
            'bank_logo_url' => '', 'bucket' => $bucket, 'source' => 'sentinel',
        );
        $opt_values = array();
        $any_opt_set = false;
        foreach ( $keys['options'] as $field => $opt_key ) {
            $v = get_option( $opt_key, '' );
            $opt_values[ $field ] = is_string( $v ) ? trim( $v ) : '';
            if ( $opt_values[ $field ] !== '' ) $any_opt_set = true;
        }
        $const_values = array();
        $any_const_set = false;
        if ( ! $any_opt_set ) {
            foreach ( $keys['constants'] as $field => $const_name ) {
                $v = defined( $const_name ) ? constant( $const_name ) : '';
                $const_values[ $field ] = is_string( $v ) ? trim( $v ) : '';
                if ( $const_values[ $field ] !== '' ) $any_const_set = true;
            }
        }
        $required = array( 'name', 'account', 'holder', 'code' );
        if ( $any_opt_set ) {
            $missing = array();
            foreach ( $required as $f ) {
                if ( $opt_values[ $f ] === '' ) $missing[] = $f;
            }
            $out['bank_name']     = $opt_values['name'];
            $out['bank_name_en']  = $opt_values['name_en'];
            $out['bank_account']  = $opt_values['account'];
            $out['bank_holder']   = $opt_values['holder'];
            $out['bank_code']     = $opt_values['code'];
            $out['bank_branch']   = $opt_values['branch'];
            $out['bank_logo_url'] = $opt_values['logo_url'];
            $out['source'] = 'wp_options';
            if ( ! empty( $missing ) ) {
                $out['error'] = 'incomplete_bank_settings';
                $out['missing_fields'] = $missing;
            }
            if ( $out['bank_name_en'] === '' ) {
                $wl = dinoco_claim_bank_code_whitelist();
                if ( isset( $wl[ $out['bank_code'] ] ) ) $out['bank_name_en'] = $wl[ $out['bank_code'] ];
            }
            return $out;
        }
        if ( $any_const_set ) {
            $missing = array();
            foreach ( $required as $f ) {
                if ( ! isset( $const_values[ $f ] ) || $const_values[ $f ] === '' ) $missing[] = $f;
            }
            $out['bank_name']     = $const_values['name']     ?? '';
            $out['bank_name_en']  = $const_values['name_en']  ?? '';
            $out['bank_account']  = $const_values['account']  ?? '';
            $out['bank_holder']   = $const_values['holder']   ?? '';
            $out['bank_code']     = $const_values['code']     ?? '';
            $out['bank_branch']   = $const_values['branch']   ?? '';
            $out['bank_logo_url'] = $const_values['logo_url'] ?? '';
            $out['source'] = 'constants';
            if ( ! empty( $missing ) ) {
                $out['error'] = 'incomplete_bank_settings';
                $out['missing_fields'] = $missing;
            }
            if ( $out['bank_name_en'] === '' ) {
                $wl = dinoco_claim_bank_code_whitelist();
                if ( isset( $wl[ $out['bank_code'] ] ) ) $out['bank_name_en'] = $wl[ $out['bank_code'] ];
            }
            return $out;
        }
        $out['error'] = 'no_claim_bank_configured';
        $out['bank_name'] = 'ไม่ได้ตั้งค่า';
        return $out;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_resolve' ) ) {
    function dinoco_claim_bank_resolve( $use_walkin = false ) {
        $bucket = $use_walkin ? 'walkin' : 'default';
        $resolved = dinoco_claim_bank_read_bucket( $bucket );
        if ( $use_walkin && ! empty( $resolved['error'] ) ) {
            $fallback = dinoco_claim_bank_read_bucket( 'default' );
            if ( empty( $fallback['error'] ) ) {
                $fallback['bucket'] = 'walkin_via_default';
                return $fallback;
            }
        }
        return $resolved;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_validate' ) ) {
    function dinoco_claim_bank_validate( $payload, $bucket = 'default' ) {
        $errors = array();
        $clean  = array();
        $name = isset( $payload['bank_name'] ) ? trim( (string) $payload['bank_name'] ) : '';
        if ( $name === '' ) $errors['bank_name'] = 'ต้องระบุชื่อธนาคาร';
        elseif ( mb_strlen( $name ) > 64 ) $errors['bank_name'] = 'ชื่อธนาคารเกิน 64 ตัวอักษร';
        $clean['bank_name'] = sanitize_text_field( $name );

        $name_en = isset( $payload['bank_name_en'] ) ? trim( (string) $payload['bank_name_en'] ) : '';
        if ( mb_strlen( $name_en ) > 64 ) $errors['bank_name_en'] = 'ชื่อภาษาอังกฤษเกิน 64 ตัวอักษร';
        $clean['bank_name_en'] = sanitize_text_field( $name_en );

        $account = isset( $payload['bank_account'] ) ? trim( (string) $payload['bank_account'] ) : '';
        if ( $account === '' ) $errors['bank_account'] = 'ต้องระบุเลขบัญชี';
        elseif ( ! preg_match( '/^[0-9-]{8,20}$/', $account ) ) $errors['bank_account'] = 'รูปแบบเลขบัญชีไม่ถูกต้อง';
        $clean['bank_account'] = sanitize_text_field( $account );

        $holder = isset( $payload['bank_holder'] ) ? trim( (string) $payload['bank_holder'] ) : '';
        if ( $holder === '' ) $errors['bank_holder'] = 'ต้องระบุชื่อบัญชี';
        elseif ( mb_strlen( $holder ) > 128 ) $errors['bank_holder'] = 'ชื่อบัญชีเกิน 128 ตัวอักษร';
        $clean['bank_holder'] = sanitize_text_field( $holder );

        $code = isset( $payload['bank_code'] ) ? trim( (string) $payload['bank_code'] ) : '';
        $wl = dinoco_claim_bank_code_whitelist();
        if ( $code === '' ) $errors['bank_code'] = 'ต้องระบุรหัสธนาคาร';
        elseif ( ! isset( $wl[ $code ] ) ) $errors['bank_code'] = 'รหัสธนาคารไม่ถูกต้อง';
        $clean['bank_code'] = sanitize_text_field( $code );

        $branch = isset( $payload['bank_branch'] ) ? trim( (string) $payload['bank_branch'] ) : '';
        if ( mb_strlen( $branch ) > 128 ) $errors['bank_branch'] = 'ชื่อสาขาเกิน 128 ตัวอักษร';
        $clean['bank_branch'] = sanitize_text_field( $branch );

        $logo = isset( $payload['bank_logo_url'] ) ? trim( (string) $payload['bank_logo_url'] ) : '';
        if ( $logo !== '' ) {
            if ( ! preg_match( '#^https://#i', $logo ) ) $errors['bank_logo_url'] = 'URL โลโก้ต้องขึ้นต้นด้วย https://';
            elseif ( ! filter_var( $logo, FILTER_VALIDATE_URL ) ) $errors['bank_logo_url'] = 'URL ไม่ถูกต้อง';
            elseif ( mb_strlen( $logo ) > 500 ) $errors['bank_logo_url'] = 'URL ยาวเกิน 500 ตัวอักษร';
        }
        $clean['bank_logo_url'] = esc_url_raw( $logo );

        return array(
            'ok'        => empty( $errors ),
            'errors'    => $errors,
            'sanitized' => $clean,
            'bucket'    => $bucket,
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_claim_bank_maybe_migrate_constants' ) ) {
    function dinoco_claim_bank_maybe_migrate_constants() {
        if ( get_option( 'dinoco_claim_bank_seeded_from_constants', '' ) === '1' ) {
            return 0; // already ran
        }
        $touched = 0;
        foreach ( array( 'default', 'walkin' ) as $bucket ) {
            $keys = dinoco_claim_bank_field_keys( $bucket );
            foreach ( $keys['options'] as $field => $opt_key ) {
                $const_name = $keys['constants'][ $field ];
                if ( ! defined( $const_name ) ) continue;
                $current = get_option( $opt_key, '' );
                if ( $current !== '' && $current !== false ) continue;
                $val = constant( $const_name );
                if ( ! is_string( $val ) || trim( $val ) === '' ) continue;
                update_option( $opt_key, sanitize_text_field( $val ), false );
                $touched++;
            }
        }
        update_option( 'dinoco_claim_bank_seeded_from_constants', '1', true );
        return $touched;
    }
}

// ──────────────────────────────────────────────────────────────────────────

final class ClaimBankResolverTest extends TestCase {

    protected function setUp(): void {
        FakeStore::reset();
    }

    // ════════════════════════════════════════════════════════════════════
    // Tier 1: wp_options take priority
    // ════════════════════════════════════════════════════════════════════

    public function test_tier1_wp_options_take_priority_over_constants(): void {
        // Both wp_options AND constants set — wp_options must win
        FakeStore::$options['dinoco_claim_bank_name']    = 'ธนาคารกสิกรไทย';
        FakeStore::$options['dinoco_claim_bank_account'] = '123-4-56789-0';
        FakeStore::$options['dinoco_claim_bank_holder']  = 'บริษัท DINOCO จำกัด';
        FakeStore::$options['dinoco_claim_bank_code']    = '004';

        FakeStore::$constants['DINOCO_CLAIM_BANK_NAME']    = 'CONSTANT-NAME-IGNORED';
        FakeStore::$constants['DINOCO_CLAIM_BANK_ACCOUNT'] = '999-9-99999-9';
        FakeStore::$constants['DINOCO_CLAIM_BANK_HOLDER']  = 'CONSTANT-HOLDER-IGNORED';
        FakeStore::$constants['DINOCO_CLAIM_BANK_CODE']    = '002';

        $result = dinoco_claim_bank_resolve( false );
        $this->assertSame( 'wp_options', $result['source'] );
        $this->assertSame( 'ธนาคารกสิกรไทย', $result['bank_name'] );
        $this->assertSame( '123-4-56789-0', $result['bank_account'] );
        $this->assertSame( '004', $result['bank_code'] );
        // Auto-fill from whitelist when name_en empty
        $this->assertSame( 'KBANK', $result['bank_name_en'] );
        $this->assertArrayNotHasKey( 'error', $result );
    }

    // ════════════════════════════════════════════════════════════════════
    // Tier 2: constants used when wp_options empty
    // ════════════════════════════════════════════════════════════════════

    public function test_tier2_constants_used_when_options_empty(): void {
        FakeStore::$constants['DINOCO_CLAIM_BANK_NAME']    = 'ธนาคารไทยพาณิชย์';
        FakeStore::$constants['DINOCO_CLAIM_BANK_ACCOUNT'] = '987-6-54321-0';
        FakeStore::$constants['DINOCO_CLAIM_BANK_HOLDER']  = 'DINOCO CO LTD';
        FakeStore::$constants['DINOCO_CLAIM_BANK_CODE']    = '014';

        $result = dinoco_claim_bank_resolve( false );
        $this->assertSame( 'constants', $result['source'] );
        $this->assertSame( 'ธนาคารไทยพาณิชย์', $result['bank_name'] );
        $this->assertSame( '014', $result['bank_code'] );
        $this->assertSame( 'SCB', $result['bank_name_en'] ); // auto-fill from whitelist
        $this->assertArrayNotHasKey( 'error', $result );
    }

    // ════════════════════════════════════════════════════════════════════
    // Tier 3: sentinel when both empty
    // ════════════════════════════════════════════════════════════════════

    public function test_tier3_sentinel_when_both_empty(): void {
        $result = dinoco_claim_bank_resolve( false );
        $this->assertSame( 'sentinel', $result['source'] );
        $this->assertSame( 'no_claim_bank_configured', $result['error'] );
        $this->assertSame( 'ไม่ได้ตั้งค่า', $result['bank_name'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Walk-in fallback to default + isolation when explicit
    // ════════════════════════════════════════════════════════════════════

    public function test_walkin_falls_back_to_default_when_walkin_empty(): void {
        FakeStore::$options['dinoco_claim_bank_name']    = 'ธนาคารกสิกรไทย';
        FakeStore::$options['dinoco_claim_bank_account'] = '111-1-11111-1';
        FakeStore::$options['dinoco_claim_bank_holder']  = 'DINOCO';
        FakeStore::$options['dinoco_claim_bank_code']    = '004';
        // No walk-in options set

        $result = dinoco_claim_bank_resolve( true );
        $this->assertSame( 'walkin_via_default', $result['bucket'] );
        $this->assertSame( 'ธนาคารกสิกรไทย', $result['bank_name'] );
        $this->assertSame( '111-1-11111-1', $result['bank_account'] );
    }

    public function test_walkin_explicit_isolation_from_default(): void {
        FakeStore::$options['dinoco_claim_bank_name']    = 'ธนาคารกสิกรไทย';
        FakeStore::$options['dinoco_claim_bank_account'] = '111-1-11111-1';
        FakeStore::$options['dinoco_claim_bank_holder']  = 'DINOCO';
        FakeStore::$options['dinoco_claim_bank_code']    = '004';

        FakeStore::$options['dinoco_claim_walkin_bank_name']    = 'ธนาคารกรุงเทพ';
        FakeStore::$options['dinoco_claim_walkin_bank_account'] = '222-2-22222-2';
        FakeStore::$options['dinoco_claim_walkin_bank_holder']  = 'DINOCO Walk-in';
        FakeStore::$options['dinoco_claim_walkin_bank_code']    = '002';

        $default = dinoco_claim_bank_resolve( false );
        $walkin  = dinoco_claim_bank_resolve( true );

        $this->assertSame( '004', $default['bank_code'] );
        $this->assertSame( '002', $walkin['bank_code'] );
        $this->assertSame( 'ธนาคารกสิกรไทย', $default['bank_name'] );
        $this->assertSame( 'ธนาคารกรุงเทพ', $walkin['bank_name'] );
        $this->assertNotSame( $default['bank_account'], $walkin['bank_account'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Validation: bank_account regex
    // ════════════════════════════════════════════════════════════════════

    public function test_validation_bank_account_accepts_valid_thai_format(): void {
        $valid_accounts = array( '1234567890', '123-4-56789-0', '987-654-3210', '12345678' );
        foreach ( $valid_accounts as $a ) {
            $v = dinoco_claim_bank_validate( array(
                'bank_name' => 'X', 'bank_account' => $a, 'bank_holder' => 'Y', 'bank_code' => '004'
            ) );
            $this->assertArrayNotHasKey( 'bank_account', $v['errors'],
                "Account [$a] should be accepted, got error: " . ( $v['errors']['bank_account'] ?? '' ) );
        }
    }

    public function test_validation_bank_account_rejects_invalid_format(): void {
        $invalid_accounts = array(
            '',                              // empty
            '1234567',                       // too short (7)
            '123456789012345678901',         // too long (21)
            'abc-def-1234',                  // contains letters
            '123 456 7890',                  // contains spaces
            '123/456/7890',                  // wrong separator
        );
        foreach ( $invalid_accounts as $a ) {
            $v = dinoco_claim_bank_validate( array(
                'bank_name' => 'X', 'bank_account' => $a, 'bank_holder' => 'Y', 'bank_code' => '004'
            ) );
            $this->assertArrayHasKey( 'bank_account', $v['errors'],
                "Account [$a] should be rejected" );
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // Validation: bank_code whitelist
    // ════════════════════════════════════════════════════════════════════

    public function test_validation_bank_code_accepts_canonical_slip2go_codes(): void {
        $canonical = array( '002', '004', '006', '011', '014', '025', '030', '069', '073' );
        foreach ( $canonical as $code ) {
            $v = dinoco_claim_bank_validate( array(
                'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => $code
            ) );
            $this->assertArrayNotHasKey( 'bank_code', $v['errors'],
                "Canonical code [$code] should be accepted" );
        }
    }

    public function test_validation_bank_code_rejects_unknown_codes(): void {
        $rogue = array( '', '999', 'abc', '004x', '4', '0040' );
        foreach ( $rogue as $code ) {
            $v = dinoco_claim_bank_validate( array(
                'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => $code
            ) );
            $this->assertArrayHasKey( 'bank_code', $v['errors'],
                "Code [$code] should be rejected" );
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // Validation: bank_logo_url https-only + URL well-formed
    // ════════════════════════════════════════════════════════════════════

    public function test_validation_bank_logo_url_https_only(): void {
        // Valid https
        $v = dinoco_claim_bank_validate( array(
            'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => '004',
            'bank_logo_url' => 'https://example.com/logo.png'
        ) );
        $this->assertArrayNotHasKey( 'bank_logo_url', $v['errors'] );

        // Empty is OK (optional field)
        $v = dinoco_claim_bank_validate( array(
            'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => '004',
            'bank_logo_url' => ''
        ) );
        $this->assertArrayNotHasKey( 'bank_logo_url', $v['errors'] );

        // Http rejected
        $v = dinoco_claim_bank_validate( array(
            'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => '004',
            'bank_logo_url' => 'http://example.com/logo.png'
        ) );
        $this->assertArrayHasKey( 'bank_logo_url', $v['errors'] );

        // ftp rejected
        $v = dinoco_claim_bank_validate( array(
            'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => '004',
            'bank_logo_url' => 'ftp://example.com/logo.png'
        ) );
        $this->assertArrayHasKey( 'bank_logo_url', $v['errors'] );

        // Malformed URL rejected
        $v = dinoco_claim_bank_validate( array(
            'bank_name' => 'X', 'bank_account' => '1234567890', 'bank_holder' => 'Y', 'bank_code' => '004',
            'bank_logo_url' => 'https://'
        ) );
        $this->assertArrayHasKey( 'bank_logo_url', $v['errors'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Validation: max-length enforcement
    // ════════════════════════════════════════════════════════════════════

    public function test_validation_bank_holder_max_128_chars(): void {
        $v = dinoco_claim_bank_validate( array(
            'bank_name'   => 'X',
            'bank_account'=> '1234567890',
            'bank_holder' => str_repeat( 'a', 129 ),
            'bank_code'   => '004',
        ) );
        $this->assertArrayHasKey( 'bank_holder', $v['errors'] );

        $v = dinoco_claim_bank_validate( array(
            'bank_name'   => 'X',
            'bank_account'=> '1234567890',
            'bank_holder' => str_repeat( 'a', 128 ),
            'bank_code'   => '004',
        ) );
        $this->assertArrayNotHasKey( 'bank_holder', $v['errors'] );
    }

    public function test_validation_bank_name_max_64_chars(): void {
        $v = dinoco_claim_bank_validate( array(
            'bank_name'   => str_repeat( 'a', 65 ),
            'bank_account'=> '1234567890',
            'bank_holder' => 'Y',
            'bank_code'   => '004',
        ) );
        $this->assertArrayHasKey( 'bank_name', $v['errors'] );

        $v = dinoco_claim_bank_validate( array(
            'bank_name'   => str_repeat( 'a', 64 ),
            'bank_account'=> '1234567890',
            'bank_holder' => 'Y',
            'bank_code'   => '004',
        ) );
        $this->assertArrayNotHasKey( 'bank_name', $v['errors'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Validation: required fields
    // ════════════════════════════════════════════════════════════════════

    public function test_validation_requires_all_four_mandatory_fields(): void {
        $v = dinoco_claim_bank_validate( array() );
        $this->assertFalse( $v['ok'] );
        $this->assertArrayHasKey( 'bank_name', $v['errors'] );
        $this->assertArrayHasKey( 'bank_account', $v['errors'] );
        $this->assertArrayHasKey( 'bank_holder', $v['errors'] );
        $this->assertArrayHasKey( 'bank_code', $v['errors'] );
    }

    public function test_validation_succeeds_for_complete_payload(): void {
        $v = dinoco_claim_bank_validate( array(
            'bank_name'    => 'ธนาคารกสิกรไทย',
            'bank_name_en' => 'KASIKORNBANK',
            'bank_account' => '123-4-56789-0',
            'bank_holder'  => 'บริษัท DINOCO จำกัด',
            'bank_code'    => '004',
            'bank_branch'  => 'รามอินทรา 14',
            'bank_logo_url'=> 'https://cdn.example.com/kbank.png',
        ) );
        $this->assertTrue( $v['ok'] );
        $this->assertEmpty( $v['errors'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Migration idempotency
    // ════════════════════════════════════════════════════════════════════

    public function test_migration_seeds_from_constants_on_first_run(): void {
        FakeStore::$constants['DINOCO_CLAIM_BANK_NAME']    = 'KBANK';
        FakeStore::$constants['DINOCO_CLAIM_BANK_ACCOUNT'] = '123-4-56789-0';
        FakeStore::$constants['DINOCO_CLAIM_BANK_HOLDER']  = 'DINOCO';
        FakeStore::$constants['DINOCO_CLAIM_BANK_CODE']    = '004';

        $touched = dinoco_claim_bank_maybe_migrate_constants();
        $this->assertGreaterThan( 0, $touched );
        $this->assertSame( 'KBANK', FakeStore::$options['dinoco_claim_bank_name'] );
        $this->assertSame( '1', FakeStore::$options['dinoco_claim_bank_seeded_from_constants'] );
    }

    public function test_migration_idempotent_when_flag_already_set(): void {
        FakeStore::$constants['DINOCO_CLAIM_BANK_NAME'] = 'CONSTANT_VALUE';
        FakeStore::$options['dinoco_claim_bank_seeded_from_constants'] = '1';

        $touched = dinoco_claim_bank_maybe_migrate_constants();
        $this->assertSame( 0, $touched );
        // Should NOT have written constant value into wp_option
        $this->assertArrayNotHasKey( 'dinoco_claim_bank_name', FakeStore::$options );
    }

    public function test_migration_does_not_overwrite_existing_wp_options(): void {
        FakeStore::$constants['DINOCO_CLAIM_BANK_NAME'] = 'OLD_CONSTANT';
        FakeStore::$options['dinoco_claim_bank_name']   = 'EXISTING_OPTION';
        // Other required constants too so any_const_set logic exercised
        FakeStore::$constants['DINOCO_CLAIM_BANK_ACCOUNT'] = '999-9-99999-9';

        dinoco_claim_bank_maybe_migrate_constants();
        $this->assertSame( 'EXISTING_OPTION', FakeStore::$options['dinoco_claim_bank_name'] );
        // But empty fields can be seeded
        $this->assertSame( '999-9-99999-9', FakeStore::$options['dinoco_claim_bank_account'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Field keys mapping
    // ════════════════════════════════════════════════════════════════════

    public function test_field_keys_default_bucket_prefix(): void {
        $k = dinoco_claim_bank_field_keys( 'default' );
        $this->assertSame( 'dinoco_claim_bank_name', $k['options']['name'] );
        $this->assertSame( 'dinoco_claim_bank_account', $k['options']['account'] );
        $this->assertSame( 'DINOCO_CLAIM_BANK_NAME', $k['constants']['name'] );
        $this->assertSame( 'DINOCO_CLAIM_BANK_LOGO_URL', $k['constants']['logo_url'] );
    }

    public function test_field_keys_walkin_bucket_prefix(): void {
        $k = dinoco_claim_bank_field_keys( 'walkin' );
        $this->assertSame( 'dinoco_claim_walkin_bank_name', $k['options']['name'] );
        $this->assertSame( 'dinoco_claim_walkin_bank_account', $k['options']['account'] );
        $this->assertSame( 'DINOCO_CLAIM_WALKIN_BANK_NAME', $k['constants']['name'] );
        $this->assertSame( 'DINOCO_CLAIM_WALKIN_BANK_LOGO_URL', $k['constants']['logo_url'] );
    }

    public function test_field_keys_unknown_bucket_defaults_to_default(): void {
        $k = dinoco_claim_bank_field_keys( 'rogue_value' );
        $this->assertSame( 'dinoco_claim_bank_name', $k['options']['name'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Incomplete bucket detection
    // ════════════════════════════════════════════════════════════════════

    public function test_incomplete_wp_options_returns_error(): void {
        FakeStore::$options['dinoco_claim_bank_name'] = 'ธนาคารกสิกรไทย';
        // Missing account, holder, code

        $result = dinoco_claim_bank_resolve( false );
        $this->assertSame( 'wp_options', $result['source'] );
        $this->assertSame( 'incomplete_bank_settings', $result['error'] );
        $this->assertContains( 'account', $result['missing_fields'] );
        $this->assertContains( 'holder', $result['missing_fields'] );
        $this->assertContains( 'code', $result['missing_fields'] );
    }

    // ════════════════════════════════════════════════════════════════════
    // Whitelist completeness
    // ════════════════════════════════════════════════════════════════════

    public function test_whitelist_contains_required_canonical_codes(): void {
        $wl = dinoco_claim_bank_code_whitelist();
        // Must contain the 3 codes called out in spec §6.4 + the boss's KBANK
        $this->assertArrayHasKey( '002', $wl ); // Bangkok Bank
        $this->assertArrayHasKey( '004', $wl ); // KBANK
        $this->assertArrayHasKey( '014', $wl ); // SCB
        $this->assertSame( 'KBANK', $wl['004'] );
        $this->assertSame( 'Bangkok Bank', $wl['002'] );
        $this->assertSame( 'SCB', $wl['014'] );
    }
}
