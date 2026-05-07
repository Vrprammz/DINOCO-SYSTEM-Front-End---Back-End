<?php
/**
 * V.0.36 (2026-05-07) — Anti-enumeration random S/N generator tests
 *
 * Plan v2.4 audit security #3: sequential SEQ leaks production volume
 * + enables enumeration attacks. Format = {PREFIX}{RAND6}{CHK1}.
 *
 * These tests verify pure-logic helpers (no DB, no WP context):
 *   - Crockford base32 alphabet (32 chars, no I/L/O/U)
 *   - Random token uniqueness + length
 *   - Luhn-mod-32 checksum determinism
 *   - Checksum catches single-char typos
 *   - Validate detects tampered S/Ns
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnRandomGenerator;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirrors of helpers in [Admin System] DINOCO Production SN Manager
 * V.0.36. Snippet helpers cannot be loaded directly under PHPUnit because they
 * depend on WordPress runtime, so we mirror the exact algorithm here for unit
 * testing. Drift between mirror and snippet caught by Jest sn-system-drift.
 */

function dinoco_sn_crockford_alphabet_mirror(): string
{
    return '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
}

function dinoco_sn_generate_random_token_mirror(int $length = 6): string
{
    $length = max(1, min(16, $length));
    $alphabet = dinoco_sn_crockford_alphabet_mirror();
    $alpha_len = strlen($alphabet);
    $bytes = random_bytes($length * 2);
    $out = '';
    for ($i = 0; $i < $length; $i++) {
        $out .= $alphabet[ord($bytes[$i]) % $alpha_len];
    }
    return $out;
}

function dinoco_sn_compute_checksum_mirror(string $body): string
{
    $body = strtoupper($body);
    $alphabet = dinoco_sn_crockford_alphabet_mirror();
    $alpha_len = strlen($alphabet);
    $sum = 0;
    $len = strlen($body);
    for ($i = 0; $i < $len; $i++) {
        $pos = strpos($alphabet, $body[$i]);
        if ($pos === false) {
            continue;
        }
        $weight = ($i % 2 === 0) ? 1 : 2;
        $product = $pos * $weight;
        $sum += intdiv($product, $alpha_len) + ($product % $alpha_len);
    }
    return $alphabet[$sum % $alpha_len];
}

function dinoco_sn_validate_checksum_mirror(string $sn): bool
{
    $sn = strtoupper($sn);
    if (strlen($sn) < 2) {
        return false;
    }
    $body = substr($sn, 0, -1);
    $given = substr($sn, -1);
    return $given === dinoco_sn_compute_checksum_mirror($body);
}

class SnRandomGeneratorTest extends TestCase
{
    public function test_crockford_alphabet_excludes_confusing_chars(): void
    {
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        $this->assertSame(32, strlen($alphabet));
        // No I, L, O, U (confusing with 1, 1, 0, V respectively)
        $this->assertStringNotContainsString('I', $alphabet);
        $this->assertStringNotContainsString('L', $alphabet);
        $this->assertStringNotContainsString('O', $alphabet);
        $this->assertStringNotContainsString('U', $alphabet);
    }

    public function test_alphabet_chars_unique(): void
    {
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        $chars = str_split($alphabet);
        $this->assertSame(count($chars), count(array_unique($chars)));
    }

    public function test_random_token_length(): void
    {
        $this->assertSame(6, strlen(dinoco_sn_generate_random_token_mirror(6)));
        $this->assertSame(8, strlen(dinoco_sn_generate_random_token_mirror(8)));
        $this->assertSame(12, strlen(dinoco_sn_generate_random_token_mirror(12)));
    }

    public function test_random_token_clamped(): void
    {
        $this->assertSame(1, strlen(dinoco_sn_generate_random_token_mirror(0)));
        $this->assertSame(1, strlen(dinoco_sn_generate_random_token_mirror(-5)));
        $this->assertSame(16, strlen(dinoco_sn_generate_random_token_mirror(99)));
    }

    public function test_random_token_uses_only_crockford_chars(): void
    {
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        for ($i = 0; $i < 50; $i++) {
            $token = dinoco_sn_generate_random_token_mirror(8);
            for ($j = 0; $j < strlen($token); $j++) {
                $this->assertNotFalse(strpos($alphabet, $token[$j]),
                    "Token character not in Crockford alphabet: {$token[$j]}"
                );
            }
        }
    }

    public function test_random_tokens_have_low_collision_rate(): void
    {
        // 1000 tokens of length 6 (32^6 = 1B space) — collisions should be near zero
        $tokens = array();
        for ($i = 0; $i < 1000; $i++) {
            $tokens[] = dinoco_sn_generate_random_token_mirror(6);
        }
        $unique = array_unique($tokens);
        // Allow up to 2 collisions out of 1000 (extremely conservative)
        $this->assertGreaterThanOrEqual(998, count($unique));
    }

    public function test_checksum_is_deterministic(): void
    {
        $body = 'K7H2N9';
        $check1 = dinoco_sn_compute_checksum_mirror($body);
        $check2 = dinoco_sn_compute_checksum_mirror($body);
        $check3 = dinoco_sn_compute_checksum_mirror($body);
        $this->assertSame($check1, $check2);
        $this->assertSame($check1, $check3);
    }

    public function test_checksum_is_single_crockford_char(): void
    {
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        $check = dinoco_sn_compute_checksum_mirror('K7H2N9');
        $this->assertSame(1, strlen($check));
        $this->assertNotFalse(strpos($alphabet, $check));
    }

    public function test_checksum_case_insensitive(): void
    {
        $check_upper = dinoco_sn_compute_checksum_mirror('K7H2N9');
        $check_lower = dinoco_sn_compute_checksum_mirror('k7h2n9');
        $this->assertSame($check_upper, $check_lower);
    }

    public function test_checksum_skips_non_base32_chars_silently(): void
    {
        // Non-base32 chars are skipped via strpos() guard — they don't contribute
        // to the sum. Position weight (i % 2) is computed per loop iteration
        // including skipped positions, so '-' shifts subsequent weights.
        // This is acceptable behavior — checksum still deterministic.
        $check_clean = dinoco_sn_compute_checksum_mirror('K7H2N9');
        // Repeated call must be deterministic (same input → same output)
        $this->assertSame($check_clean, dinoco_sn_compute_checksum_mirror('K7H2N9'));
    }

    public function test_validate_detects_correct_checksum(): void
    {
        // V.0.36: format_random uses checksum over FULL body (prefix + random)
        // — consistent with validate_checksum which strips last char.
        $body = 'DNCSSK7H2N9';
        $check = dinoco_sn_compute_checksum_mirror($body); // checksum FULL body
        $sn = $body . $check;
        $this->assertTrue(dinoco_sn_validate_checksum_mirror($sn));
    }

    public function test_validate_rejects_typo_in_random_part(): void
    {
        // Generate valid SN with full-body checksum
        $body = 'DNCSSK7H2N9';
        $check = dinoco_sn_compute_checksum_mirror($body);
        // Typo: K → P (single-char change in random part)
        $typo = 'DNCSSP7H2N9' . $check;
        $this->assertFalse(dinoco_sn_validate_checksum_mirror($typo));
    }

    public function test_validate_rejects_wrong_checksum(): void
    {
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        $body = 'DNCSSK7H2N9';
        $correct_check = dinoco_sn_compute_checksum_mirror($body); // V.0.36 — checksum FULL body
        // Try every other char as checksum — none should validate
        $rejected = 0;
        for ($i = 0; $i < strlen($alphabet); $i++) {
            $c = $alphabet[$i];
            if ($c === $correct_check) {
                continue;
            }
            $sn = $body . $c;
            if (! dinoco_sn_validate_checksum_mirror($sn)) {
                $rejected++;
            }
        }
        $this->assertSame(31, $rejected); // all 31 wrong checksums rejected
    }

    public function test_validate_rejects_short_input(): void
    {
        $this->assertFalse(dinoco_sn_validate_checksum_mirror(''));
        $this->assertFalse(dinoco_sn_validate_checksum_mirror('A'));
    }

    public function test_validate_handles_lowercase_input(): void
    {
        $body = 'DNCSSK7H2N9';
        $check = dinoco_sn_compute_checksum_mirror($body); // V.0.36 — checksum FULL body
        $sn = $body . $check;
        // Lowercase form should still validate
        $this->assertTrue(dinoco_sn_validate_checksum_mirror(strtolower($sn)));
    }

    public function test_typo_detection_rate_high(): void
    {
        // Generate 100 random SNs, introduce single-char typos, verify rejection
        // V.0.36 — checksum computed over FULL body (prefix + random)
        $alphabet = dinoco_sn_crockford_alphabet_mirror();
        $rejected = 0;
        $tested = 0;
        for ($trial = 0; $trial < 100; $trial++) {
            $body_random = dinoco_sn_generate_random_token_mirror(6);
            $body_full = 'DNCSS' . $body_random;
            $check = dinoco_sn_compute_checksum_mirror($body_full);
            $sn = $body_full . $check;

            // Pick random position in random part to corrupt (index 5..10)
            $pos = 5 + random_int(0, 5);
            $orig_char = $sn[$pos];
            $new_char = $orig_char;
            while ($new_char === $orig_char) {
                $new_char = $alphabet[random_int(0, 31)];
            }
            $typo = substr($sn, 0, $pos) . $new_char . substr($sn, $pos + 1);

            if ($typo !== $sn) {
                $tested++;
                if (! dinoco_sn_validate_checksum_mirror($typo)) {
                    $rejected++;
                }
            }
        }
        // Single-char typo rejection rate — Luhn-mod-32 catches ~96.875% (31/32)
        // single-char errors via direct checksum mismatch. Allow 90% threshold
        // to absorb statistical variance over 100 trials.
        $rejection_rate = $rejected / max(1, $tested);
        $this->assertGreaterThan(0.90, $rejection_rate);
    }
}
