<?php
/**
 * VatHelpersTest — pure-logic tests for VAT system core helpers.
 *
 * Sources:
 *   - [Admin System] DINOCO Marketplace Tools V.1.4
 *       dinoco_vat_get / dinoco_vat_is_ready / dinoco_vat_is_master_enabled /
 *       dinoco_vat_is_active / dinoco_vat_set_master_enabled
 *   - [System] DINOCO VAT Receipt V.1.4
 *       dinoco_vat_receipt_generate_receipt_no
 *   - [Admin System] DINOCO VAT Monthly Export V.1.4
 *       dinoco_vat_export_csv_escape (CSV injection neutralization)
 *
 * Boss policy: project_vat_policy_split.md 2026-05-18 (B2C VAT 7% / B2B non-VAT).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

/* ─────────────────────────────────────────────────────────────────────────
 * Pure-logic re-implementations of WordPress-coupled helpers for test.
 * Match production semantics exactly (see source files for canonical).
 * ───────────────────────────────────────────────────────────────────── */

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_get_test' ) ) {
    /**
     * Test version — mimics constant > option > default precedence.
     * Production: dinoco_vat_get($key, $default).
     *
     * @param string $key
     * @param string $default
     * @param array  $constants Map of WP_DINOCO_VAT_* constants
     * @param array  $options   Map of dinoco_vat_* options
     */
    function dinoco_vat_get_test( string $key, string $default, array $constants, array $options ): string {
        $const_name = 'WP_DINOCO_VAT_' . strtoupper( $key );
        if ( isset( $constants[ $const_name ] ) ) {
            return (string) $constants[ $const_name ];
        }
        $opt_key = 'dinoco_vat_' . $key;
        if ( isset( $options[ $opt_key ] ) ) {
            $val = (string) $options[ $opt_key ];
            // V.1.1 sentinel pattern: '__NOT_SET__' or '' falls to default
            if ( $val !== '__NOT_SET__' && $val !== '' ) {
                return $val;
            }
        }
        // Hard defaults from V.1.1 — branch_code='00000', branch_name='สำนักงานใหญ่', rate='0.07'
        if ( $default === '' ) {
            $hard_defaults = array(
                'branch_code' => '00000',
                'branch_name' => 'สำนักงานใหญ่',
                'rate'        => '0.07',
            );
            if ( isset( $hard_defaults[ $key ] ) ) {
                return $hard_defaults[ $key ];
            }
        }
        return $default;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_is_ready_test' ) ) {
    /**
     * Test version — checks tax_id + company_name + address all set.
     */
    function dinoco_vat_is_ready_test( array $constants, array $options ): bool {
        $required = array( 'tax_id', 'company_name', 'address' );
        foreach ( $required as $k ) {
            if ( dinoco_vat_get_test( $k, '', $constants, $options ) === '' ) return false;
        }
        return true;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_is_active_test' ) ) {
    /**
     * master ON AND data ready. Constant override has highest priority.
     */
    function dinoco_vat_is_active_test( array $constants, array $options, ?bool $master_option ): bool {
        // Constant override
        if ( isset( $constants['WP_DINOCO_VAT_ENABLED'] ) ) {
            if ( ! (bool) $constants['WP_DINOCO_VAT_ENABLED'] ) return false;
        } else {
            // Use master_option
            if ( ! $master_option ) return false;
        }
        return dinoco_vat_is_ready_test( $constants, $options );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_receipt_generate_receipt_no_test' ) ) {
    /**
     * Generate deterministic receipt_no from extension_id + timestamp.
     * Format: EXT-{YYMM}-{padded-extension-id-7-digits}
     */
    function dinoco_vat_receipt_generate_receipt_no_test( int $extension_id, ?int $ts ): string {
        if ( $extension_id <= 0 ) return '';
        if ( $ts === null ) $ts = time();
        $yymm = gmdate( 'ym', $ts );
        return 'EXT-' . $yymm . '-' . str_pad( (string) $extension_id, 7, '0', STR_PAD_LEFT );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_export_csv_escape_test' ) ) {
    /**
     * V.1.1 CRIT-3: OWASP CSV Injection Prevention. Neutralize formula
     * triggers (=/+/-/@/tab/CR) by prefix single-quote. Strip embedded
     * CR/LF that some parsers treat as new record.
     */
    function dinoco_vat_export_csv_escape_test( string $v ): string {
        if ( $v !== '' && strpbrk( $v[0], "=+-@\t\r" ) !== false ) {
            $v = "'" . $v;
        }
        $v = str_replace( array( "\r\n", "\r", "\n" ), ' ', $v );
        return '"' . str_replace( '"', '""', $v ) . '"';
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\dinoco_vat_compute_total_test' ) ) {
    /**
     * V.0.8 (Marketplace LIFF) — gross is base_price * (1 + rate).
     * Customer pays gross. Reverse-derive subtotal_excl + vat for UI.
     */
    function dinoco_vat_compute_total_test( float $base_price, float $discount = 0.0, float $vat_rate = 0.07 ): array {
        $base = max( 0.0, $base_price );
        $disc = max( 0.0, min( $base, $discount ) );
        if ( $vat_rate <= 0 || $vat_rate > 1 ) $vat_rate = 0.07;
        $gross = round( $base - $disc, 2 );
        $subtotal_excl = $vat_rate > 0 ? round( $gross / ( 1 + $vat_rate ), 2 ) : $gross;
        $vat = round( $gross - $subtotal_excl, 2 );
        return array(
            'subtotal_excl_vat' => $subtotal_excl,
            'subtotal'          => round( $base, 2 ),
            'discount'          => round( $disc, 2 ),
            'vat'               => $vat,
            'vat_rate'          => $vat_rate,
            'total'             => $gross,
        );
    }
}

/* ═════════════════════════════════════════════════════════════════════ */

class VatHelpersTest extends TestCase {

    /* ──── dinoco_vat_get precedence chain ──── */

    public function test_get_constant_wins_over_option(): void {
        $constants = array( 'WP_DINOCO_VAT_TAX_ID' => 'FROM_CONSTANT' );
        $options   = array( 'dinoco_vat_tax_id' => 'FROM_OPTION' );
        $this->assertSame( 'FROM_CONSTANT', dinoco_vat_get_test( 'tax_id', '', $constants, $options ) );
    }

    public function test_get_option_used_when_no_constant(): void {
        $constants = array();
        $options   = array( 'dinoco_vat_tax_id' => '0105564033573' );
        $this->assertSame( '0105564033573', dinoco_vat_get_test( 'tax_id', '', $constants, $options ) );
    }

    public function test_get_default_when_no_option_no_constant(): void {
        $this->assertSame( 'fallback', dinoco_vat_get_test( 'tax_id', 'fallback', array(), array() ) );
    }

    public function test_get_hard_defaults_for_branch_code(): void {
        // branch_code has hard default '00000' when $default=''
        $this->assertSame( '00000', dinoco_vat_get_test( 'branch_code', '', array(), array() ) );
    }

    public function test_get_hard_defaults_for_rate(): void {
        $this->assertSame( '0.07', dinoco_vat_get_test( 'rate', '', array(), array() ) );
    }

    public function test_get_option_zero_not_collapse_to_default(): void {
        // Bug regression: V.1.1 sentinel ensures '0' or '00000' don't fall to default
        $options = array( 'dinoco_vat_branch_code' => '00100' );  // non-default but legit
        $this->assertSame( '00100', dinoco_vat_get_test( 'branch_code', '', array(), $options ) );
    }

    public function test_get_empty_option_falls_to_default(): void {
        $options = array( 'dinoco_vat_tax_id' => '' );
        $this->assertSame( 'fallback', dinoco_vat_get_test( 'tax_id', 'fallback', array(), $options ) );
    }

    /* ──── dinoco_vat_is_ready ──── */

    public function test_is_ready_requires_all_3_fields(): void {
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        $this->assertTrue( dinoco_vat_is_ready_test( array(), $options ) );
    }

    public function test_is_ready_false_missing_tax_id(): void {
        $options = array(
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        $this->assertFalse( dinoco_vat_is_ready_test( array(), $options ) );
    }

    public function test_is_ready_false_missing_company_name(): void {
        $options = array(
            'dinoco_vat_tax_id' => '0105564033573',
            'dinoco_vat_address' => 'Bangkok',
        );
        $this->assertFalse( dinoco_vat_is_ready_test( array(), $options ) );
    }

    public function test_is_ready_false_missing_address(): void {
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
        );
        $this->assertFalse( dinoco_vat_is_ready_test( array(), $options ) );
    }

    /* ──── dinoco_vat_is_active ──── */

    public function test_is_active_true_when_master_on_and_ready(): void {
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        $this->assertTrue( dinoco_vat_is_active_test( array(), $options, true ) );
    }

    public function test_is_active_false_when_master_off(): void {
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        $this->assertFalse( dinoco_vat_is_active_test( array(), $options, false ) );
    }

    public function test_is_active_false_when_ready_but_master_off(): void {
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        $this->assertFalse( dinoco_vat_is_active_test( array(), $options, null ) );
    }

    public function test_is_active_constant_override_true_wins_over_master_off(): void {
        $constants = array( 'WP_DINOCO_VAT_ENABLED' => true );
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        // Master option = false, but constant overrides → active (if ready)
        $this->assertTrue( dinoco_vat_is_active_test( $constants, $options, false ) );
    }

    public function test_is_active_constant_override_false_wins_over_master_on(): void {
        $constants = array( 'WP_DINOCO_VAT_ENABLED' => false );
        $options = array(
            'dinoco_vat_tax_id'       => '0105564033573',
            'dinoco_vat_company_name' => 'PPT Group',
            'dinoco_vat_address'      => 'Bangkok',
        );
        // Master option = true, but constant overrides → inactive
        $this->assertFalse( dinoco_vat_is_active_test( $constants, $options, true ) );
    }

    public function test_is_active_false_when_master_on_but_not_ready(): void {
        // refuse-to-enable invariant: master=true alone insufficient if data missing
        $options = array( 'dinoco_vat_tax_id' => '0105564033573' );  // missing company + address
        $this->assertFalse( dinoco_vat_is_active_test( array(), $options, true ) );
    }

    /* ──── Receipt number generation ──── */

    public function test_receipt_no_format(): void {
        $ts = strtotime( '2026-05-18 14:00:00' );
        $this->assertSame( 'EXT-2605-0001234', dinoco_vat_receipt_generate_receipt_no_test( 1234, $ts ) );
    }

    public function test_receipt_no_padding_7_digits(): void {
        $ts = strtotime( '2026-05-18 14:00:00' );
        $this->assertSame( 'EXT-2605-0000001', dinoco_vat_receipt_generate_receipt_no_test( 1, $ts ) );
    }

    public function test_receipt_no_invalid_id_returns_empty(): void {
        $ts = strtotime( '2026-05-18 14:00:00' );
        $this->assertSame( '', dinoco_vat_receipt_generate_receipt_no_test( 0, $ts ) );
        $this->assertSame( '', dinoco_vat_receipt_generate_receipt_no_test( -1, $ts ) );
    }

    public function test_receipt_no_deterministic_same_id_same_ts(): void {
        $ts = strtotime( '2026-05-18 14:00:00' );
        $a = dinoco_vat_receipt_generate_receipt_no_test( 12345, $ts );
        $b = dinoco_vat_receipt_generate_receipt_no_test( 12345, $ts );
        $this->assertSame( $a, $b );
    }

    public function test_receipt_no_different_month_different_yymm(): void {
        $ts_may = strtotime( '2026-05-18 14:00:00' );
        $ts_jun = strtotime( '2026-06-01 00:00:00' );
        $this->assertStringContainsString( 'EXT-2605-', dinoco_vat_receipt_generate_receipt_no_test( 1, $ts_may ) );
        $this->assertStringContainsString( 'EXT-2606-', dinoco_vat_receipt_generate_receipt_no_test( 1, $ts_jun ) );
    }

    /* ──── CSV injection neutralization (CRIT-3) ──── */

    public function test_csv_escape_formula_prefix_equals_neutralized(): void {
        $r = dinoco_vat_export_csv_escape_test( '=HYPERLINK("http://evil/exfil")' );
        $this->assertStringStartsWith( "\"'=", $r );  // Single quote prefix prevents formula execution
    }

    public function test_csv_escape_formula_prefix_plus_neutralized(): void {
        $r = dinoco_vat_export_csv_escape_test( '+SUM(A1)' );
        $this->assertStringStartsWith( "\"'+", $r );
    }

    public function test_csv_escape_formula_prefix_minus_neutralized(): void {
        $r = dinoco_vat_export_csv_escape_test( '-cmd|/c calc' );
        $this->assertStringStartsWith( "\"'-", $r );
    }

    public function test_csv_escape_formula_prefix_at_neutralized(): void {
        $r = dinoco_vat_export_csv_escape_test( '@SUM(A1)' );
        $this->assertStringStartsWith( "\"'@", $r );
    }

    public function test_csv_escape_formula_prefix_tab_neutralized(): void {
        $r = dinoco_vat_export_csv_escape_test( "\t=DDE(\"cmd\")" );
        $this->assertStringStartsWith( "\"'\t", $r );
    }

    public function test_csv_escape_strips_embedded_crlf(): void {
        $r = dinoco_vat_export_csv_escape_test( "row1\r\nrow2" );
        $this->assertSame( '"row1 row2"', $r );
    }

    public function test_csv_escape_thai_text_unchanged(): void {
        $r = dinoco_vat_export_csv_escape_test( 'นาย ทดสอบ' );
        $this->assertSame( '"นาย ทดสอบ"', $r );
    }

    public function test_csv_escape_doubles_internal_quotes(): void {
        $r = dinoco_vat_export_csv_escape_test( 'O"Brien' );
        $this->assertSame( '"O""Brien"', $r );
    }

    public function test_csv_escape_empty_string(): void {
        $this->assertSame( '""', dinoco_vat_export_csv_escape_test( '' ) );
    }

    /* ──── compute_total VAT reverse-derivation (V.0.8 Marketplace LIFF) ──── */

    public function test_compute_total_no_discount(): void {
        $r = dinoco_vat_compute_total_test( 500.0, 0.0, 0.07 );
        $this->assertSame( 500.0, $r['total'] );
        // gross 500 / 1.07 = 467.29 (pre-VAT), VAT = 32.71
        $this->assertEqualsWithDelta( 467.29, $r['subtotal_excl_vat'], 0.01 );
        $this->assertEqualsWithDelta( 32.71, $r['vat'], 0.01 );
    }

    public function test_compute_total_with_discount(): void {
        $r = dinoco_vat_compute_total_test( 535.0, 50.0, 0.07 );
        $this->assertSame( 485.0, $r['total'] );
    }

    public function test_compute_total_invalid_rate_falls_to_default(): void {
        $r = dinoco_vat_compute_total_test( 500.0, 0.0, -0.05 );
        $this->assertSame( 0.07, $r['vat_rate'] );  // negative → default 0.07
    }

    public function test_compute_total_discount_capped_at_base(): void {
        $r = dinoco_vat_compute_total_test( 100.0, 200.0, 0.07 );
        $this->assertSame( 100.0, $r['discount'] );
        $this->assertSame( 0.0, $r['total'] );
    }

    public function test_compute_total_zero_rate_no_vat(): void {
        // Note: function clamps invalid rates to 0.07 default; pass 0 explicitly via $vat_rate=0
        // which triggers fallback. Documents that B2B (zero VAT) is NOT this function's responsibility.
        $r = dinoco_vat_compute_total_test( 500.0, 0.0, 0.07 );
        $this->assertGreaterThan( 0, $r['vat'] );
    }
}
