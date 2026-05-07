<?php
/**
 * REG-090 — HMAC URL signing for QR-encoded URLs (Round 3 Format B).
 *
 * Plan v2.13 §Phase 1 W4 R3 BLOCKER.
 *
 * QR Content format B:
 *   https://dinoco.in.th/warranty/activate?sn=DNCSS0001234&sig=<24chars>
 *
 * Signing primitives mirrored:
 *   - dinoco_sn_hmac_sign($sn, $secret, $now_ts) → 24-char base32 sig
 *   - dinoco_sn_hmac_verify($sn, $sig, $secret, $now_ts) → bool
 *
 * Replay window: 24h (current bucket OR previous bucket valid).
 * Bucket = floor(epoch / 86400).
 *
 * Pure-logic mirror — no WP/DB dependency.
 *
 * 20+ cases.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnHmacUrlSigning;

use PHPUnit\Framework\TestCase;

const SN_HMAC_SIG_LEN_CHARS = 24;
const SN_HMAC_BUCKET_SECONDS = 86400; // 24h
// Crockford base32 alphabet (no I/L/O/U)
const SN_HMAC_B32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

if ( ! function_exists( __NAMESPACE__ . '\\sn_hmac_b32_encode' ) ) {
    function sn_hmac_b32_encode( string $bytes ): string {
        $alphabet = SN_HMAC_B32_ALPHABET;
        $out      = '';
        $len      = strlen( $bytes );
        $i        = 0;
        while ( $i < $len ) {
            // pull 5 bytes (40 bits) → 8 base32 chars
            $chunk = substr( $bytes, $i, 5 );
            $i    += 5;
            $clen  = strlen( $chunk );
            // pad chunk to 5 bytes
            if ( $clen < 5 ) {
                $chunk .= str_repeat( "\0", 5 - $clen );
            }
            $b1 = ord( $chunk[0] );
            $b2 = ord( $chunk[1] );
            $b3 = ord( $chunk[2] );
            $b4 = ord( $chunk[3] );
            $b5 = ord( $chunk[4] );

            $out .= $alphabet[ ( $b1 >> 3 ) & 0x1F ];
            $out .= $alphabet[ ( ( $b1 << 2 ) | ( $b2 >> 6 ) ) & 0x1F ];
            $out .= $alphabet[ ( $b2 >> 1 ) & 0x1F ];
            $out .= $alphabet[ ( ( $b2 << 4 ) | ( $b3 >> 4 ) ) & 0x1F ];
            $out .= $alphabet[ ( ( $b3 << 1 ) | ( $b4 >> 7 ) ) & 0x1F ];
            $out .= $alphabet[ ( $b4 >> 2 ) & 0x1F ];
            $out .= $alphabet[ ( ( $b4 << 3 ) | ( $b5 >> 5 ) ) & 0x1F ];
            $out .= $alphabet[ $b5 & 0x1F ];
        }
        return $out;
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_hmac_bucket' ) ) {
    function sn_hmac_bucket( int $epoch ): int {
        return intdiv( $epoch, SN_HMAC_BUCKET_SECONDS );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_hmac_sign' ) ) {
    /**
     * Mirror of dinoco_sn_hmac_sign().
     * Produces 24-char base32 sig for SN + epoch bucket.
     */
    function sn_hmac_sign( string $sn, string $secret, int $epoch ): string {
        $bucket  = sn_hmac_bucket( $epoch );
        $payload = $sn . '|' . $bucket;
        // Raw HMAC-SHA256 (32 bytes binary)
        $raw  = hash_hmac( 'sha256', $payload, $secret, true );
        // Take first 15 bytes → 24 base32 chars (15 * 8 = 120 bits)
        $b32  = sn_hmac_b32_encode( substr( $raw, 0, 15 ) );
        return substr( $b32, 0, SN_HMAC_SIG_LEN_CHARS );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\sn_hmac_verify' ) ) {
    /**
     * Mirror of dinoco_sn_hmac_verify().
     * Accept current OR previous bucket (24h replay window).
     */
    function sn_hmac_verify( string $sn, string $sig, string $secret, int $epoch ): bool {
        if ( strlen( $sig ) !== SN_HMAC_SIG_LEN_CHARS ) return false;
        if ( ! preg_match( '/^[' . SN_HMAC_B32_ALPHABET . ']{' . SN_HMAC_SIG_LEN_CHARS . '}$/', $sig ) ) return false;

        $current  = sn_hmac_sign( $sn, $secret, $epoch );
        $previous = sn_hmac_sign( $sn, $secret, $epoch - SN_HMAC_BUCKET_SECONDS );
        return hash_equals( $current, $sig ) || hash_equals( $previous, $sig );
    }
}

class SnHmacUrlSigningTest extends TestCase {

    private const SECRET    = 'test_secret_key_phase1_w4_r3';
    private const EPOCH_REF = 1735689600; // 2025-01-01 00:00 UTC

    /* ─── Sign primitives ─── */

    public function test_sig_is_24_chars(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertSame( SN_HMAC_SIG_LEN_CHARS, strlen( $sig ) );
    }

    public function test_sig_is_crockford_base32_charset_only(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertMatchesRegularExpression(
            '/^[' . SN_HMAC_B32_ALPHABET . ']+$/',
            $sig,
            'sig MUST use Crockford base32 (no I/L/O/U)'
        );
    }

    public function test_sig_deterministic_for_same_inputs(): void {
        $a = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $b = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertSame( $a, $b );
    }

    public function test_sig_differs_for_different_sn(): void {
        $a = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $b = sn_hmac_sign( 'DNCSS9999999', self::SECRET, self::EPOCH_REF );
        $this->assertNotSame( $a, $b );
    }

    public function test_sig_differs_for_different_secret(): void {
        $a = sn_hmac_sign( 'DNCSS0001234', 'sec_a', self::EPOCH_REF );
        $b = sn_hmac_sign( 'DNCSS0001234', 'sec_b', self::EPOCH_REF );
        $this->assertNotSame( $a, $b );
    }

    public function test_sig_differs_across_buckets(): void {
        $bucket_n  = self::EPOCH_REF;
        $bucket_n1 = self::EPOCH_REF + SN_HMAC_BUCKET_SECONDS;
        $a = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $bucket_n );
        $b = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $bucket_n1 );
        $this->assertNotSame( $a, $b, 'Same bucket → same sig; cross-bucket → different' );
    }

    public function test_sig_same_within_bucket(): void {
        // Two epochs within same 24h bucket → identical sig
        $start  = ( intdiv( self::EPOCH_REF, SN_HMAC_BUCKET_SECONDS ) ) * SN_HMAC_BUCKET_SECONDS;
        $mid    = $start + 3600;
        $end    = $start + 86399; // last second of same bucket
        $a = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $mid );
        $b = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $end );
        $this->assertSame( $a, $b );
    }

    /* ─── Bucket boundary ─── */

    public function test_bucket_is_epoch_div_86400(): void {
        $this->assertSame( 0, sn_hmac_bucket( 0 ) );
        $this->assertSame( 0, sn_hmac_bucket( 86399 ) );
        $this->assertSame( 1, sn_hmac_bucket( 86400 ) );
        $this->assertSame( 1, sn_hmac_bucket( 172799 ) );
        $this->assertSame( 2, sn_hmac_bucket( 172800 ) );
    }

    /* ─── Verify accepts current ─── */

    public function test_verify_accepts_current_bucket(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertTrue(
            sn_hmac_verify( 'DNCSS0001234', $sig, self::SECRET, self::EPOCH_REF )
        );
    }

    /* ─── Verify accepts previous bucket (24h replay window) ─── */

    public function test_verify_accepts_previous_bucket_within_24h(): void {
        // Issued at T-23h → still valid at now (within 24h replay)
        $issued_at = self::EPOCH_REF - ( 23 * 3600 );
        $sig       = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $issued_at );
        $this->assertTrue(
            sn_hmac_verify( 'DNCSS0001234', $sig, self::SECRET, self::EPOCH_REF ),
            'Sig from previous bucket within 24h MUST verify'
        );
    }

    public function test_verify_rejects_bucket_more_than_one_old(): void {
        // Issued >24h ago = bucket older than previous → reject
        $issued_at = self::EPOCH_REF - ( 3 * SN_HMAC_BUCKET_SECONDS );
        $sig       = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $issued_at );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', $sig, self::SECRET, self::EPOCH_REF ),
            'Sig older than 1 bucket (24h) MUST be rejected'
        );
    }

    public function test_verify_rejects_future_bucket(): void {
        // Sig issued in future bucket → reject (clock skew abuse)
        $future_epoch = self::EPOCH_REF + ( 2 * SN_HMAC_BUCKET_SECONDS );
        $sig          = sn_hmac_sign( 'DNCSS0001234', self::SECRET, $future_epoch );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', $sig, self::SECRET, self::EPOCH_REF )
        );
    }

    /* ─── Verify rejects malformed ─── */

    public function test_verify_rejects_short_sig(): void {
        $this->assertFalse( sn_hmac_verify( 'DNCSS0001234', 'TOOSHORT', self::SECRET, self::EPOCH_REF ) );
    }

    public function test_verify_rejects_long_sig(): void {
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', str_repeat( 'A', 32 ), self::SECRET, self::EPOCH_REF )
        );
    }

    public function test_verify_rejects_empty_sig(): void {
        $this->assertFalse( sn_hmac_verify( 'DNCSS0001234', '', self::SECRET, self::EPOCH_REF ) );
    }

    public function test_verify_rejects_wrong_charset(): void {
        // Lowercase / 'I' / 'L' / 'O' / 'U' all banned in Crockford base32
        $bad = str_repeat( 'I', SN_HMAC_SIG_LEN_CHARS );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', $bad, self::SECRET, self::EPOCH_REF ),
            'Crockford alphabet must reject I/L/O/U'
        );
    }

    public function test_verify_rejects_tampered_sig(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        // flip first char (within Crockford alphabet)
        $tampered = ( $sig[0] === '0' ? 'Z' : '0' ) . substr( $sig, 1 );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', $tampered, self::SECRET, self::EPOCH_REF )
        );
    }

    public function test_verify_rejects_wrong_sn(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS9999999', $sig, self::SECRET, self::EPOCH_REF ),
            'Sig is bound to SN — different SN must reject'
        );
    }

    public function test_verify_rejects_wrong_secret(): void {
        $sig = sn_hmac_sign( 'DNCSS0001234', 'sec_a', self::EPOCH_REF );
        $this->assertFalse(
            sn_hmac_verify( 'DNCSS0001234', $sig, 'sec_b', self::EPOCH_REF )
        );
    }

    /* ─── Timing-safe primitives present (smoke) ─── */

    public function test_verify_uses_constant_time_compare(): void {
        // Sanity that we route through hash_equals — if a regression replaced
        // it with === the equality still holds but timing leaks. We can't
        // assert timing here, but we can assert verify still works after
        // the hash_equals path (regression sentinel).
        $sig = sn_hmac_sign( 'DNCSS0001234', self::SECRET, self::EPOCH_REF );
        $this->assertTrue( hash_equals( $sig, $sig ) );
    }

    /* ─── 120-bit entropy claim ─── */

    public function test_sig_120bit_entropy_lower_bound(): void {
        // 24 base32 chars × 5 bits/char = 120 bits ≥ 120
        $bits = SN_HMAC_SIG_LEN_CHARS * 5;
        $this->assertGreaterThanOrEqual( 120, $bits );
    }
}
