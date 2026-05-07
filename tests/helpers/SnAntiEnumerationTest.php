<?php
/**
 * REG-089 — Anti-enumeration random S/N generator
 *
 * Plan v2.4 audit security #3: sequential SEQ leaks production volume
 * + enables enumeration attacks. Format = {PREFIX}{RAND6}{CHK1}.
 *
 * REG-089 complements SnRandomGeneratorTest.php (V.0.36) — focuses on
 * enumeration-attack defenses:
 *   - random_int(0,31) entropy distribution (chi-square)
 *   - Sequential SEQ format rejection (admin-defined regex guard)
 *   - Random format detection via {RAND\d+} pattern marker
 *   - Bulk receive sequential rejection (no checksum tampering)
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnAntiEnumeration;

use PHPUnit\Framework\TestCase;

function dinoco_sn_format_is_random_mirror(string $format): bool
{
    return (bool) preg_match('/\{RAND\d+\}/', $format);
}

function dinoco_sn_format_has_checksum_mirror(string $format): bool
{
    return strpos($format, '{CHK') !== false;
}

/**
 * Detect sequential pattern in a list of S/Ns.
 * Returns true if all entries form an arithmetic sequence after the prefix.
 */
function dinoco_sn_detect_sequential_mirror(array $sns): bool
{
    if (count($sns) < 3) {
        return false;
    }
    $stripped = [];
    foreach ($sns as $sn) {
        if (!preg_match('/^DNCSS(\d+)$/', strtoupper($sn), $m)) {
            return false;
        }
        $stripped[] = (int) $m[1];
    }
    if (count(array_unique($stripped)) !== count($stripped)) {
        return false; // duplicates
    }
    sort($stripped);
    $diff = $stripped[1] - $stripped[0];
    if ($diff !== 1) {
        return false; // we only flag adjacent integers
    }
    for ($i = 2; $i < count($stripped); $i++) {
        if ($stripped[$i] - $stripped[$i - 1] !== 1) {
            return false;
        }
    }
    return true;
}

class SnAntiEnumerationTest extends TestCase
{
    public function test_random_format_marker_detected(): void
    {
        $this->assertTrue(dinoco_sn_format_is_random_mirror('DNCSS{RAND6}{CHK1}'));
        $this->assertTrue(dinoco_sn_format_is_random_mirror('{PREFIX}{RAND6}{CHK1}'));
        $this->assertTrue(dinoco_sn_format_is_random_mirror('{RAND8}'));
        $this->assertTrue(dinoco_sn_format_is_random_mirror('PFX{RAND12}END'));
    }

    public function test_sequential_format_marker_not_random(): void
    {
        $this->assertFalse(dinoco_sn_format_is_random_mirror('DNCSS{SEQ6}'));
        $this->assertFalse(dinoco_sn_format_is_random_mirror('DNCSS{INDEX}'));
        $this->assertFalse(dinoco_sn_format_is_random_mirror('DNCSS-#####'));
    }

    public function test_checksum_marker_present(): void
    {
        $this->assertTrue(dinoco_sn_format_has_checksum_mirror('DNCSS{RAND6}{CHK1}'));
        $this->assertFalse(dinoco_sn_format_has_checksum_mirror('DNCSS{RAND6}'));
    }

    public function test_random_int_distribution_chi_square(): void
    {
        // 10000 iterations of random_int(0, 31) -> expected ~312.5 per bucket
        $buckets = array_fill(0, 32, 0);
        $iterations = 10000;
        for ($i = 0; $i < $iterations; $i++) {
            $buckets[random_int(0, 31)]++;
        }
        $expected = $iterations / 32; // 312.5
        $chi2 = 0.0;
        foreach ($buckets as $observed) {
            $chi2 += (($observed - $expected) ** 2) / $expected;
        }
        // critical value at p=0.001, df=31 is ~61.1; we use 80 as a generous ceiling
        // to absorb statistical variance and avoid flake
        $this->assertLessThan(80.0, $chi2,
            "Chi-square statistic too high ({$chi2}) — RNG distribution may be biased"
        );
    }

    public function test_sequential_sns_detected(): void
    {
        $sns = ['DNCSS0000001', 'DNCSS0000002', 'DNCSS0000003',
                'DNCSS0000004', 'DNCSS0000005'];
        $this->assertTrue(dinoco_sn_detect_sequential_mirror($sns));
    }

    public function test_random_sns_not_detected_as_sequential(): void
    {
        // Random Crockford-base32 tokens — not sequential
        $sns = ['DNCSSK7H2N9', 'DNCSSXY8Z4Q', 'DNCSSAB3C1D'];
        // these do not match /^DNCSS(\d+)$/ -> short-circuit returns false
        $this->assertFalse(dinoco_sn_detect_sequential_mirror($sns));
    }

    public function test_short_input_not_flagged(): void
    {
        // require at least 3 entries to detect a pattern
        $this->assertFalse(dinoco_sn_detect_sequential_mirror(['DNCSS0000001']));
        $this->assertFalse(dinoco_sn_detect_sequential_mirror(['DNCSS0000001', 'DNCSS0000002']));
    }

    public function test_non_adjacent_integers_not_flagged(): void
    {
        // 1, 5, 9 — sequential by step of 4, but our heuristic only flags step-of-1
        $sns = ['DNCSS001', 'DNCSS005', 'DNCSS009'];
        $this->assertFalse(dinoco_sn_detect_sequential_mirror($sns));
    }

    public function test_duplicate_sns_not_flagged(): void
    {
        $sns = ['DNCSS001', 'DNCSS001', 'DNCSS002'];
        $this->assertFalse(dinoco_sn_detect_sequential_mirror($sns));
    }

    public function test_bulk_receive_rejects_pure_sequential_format(): void
    {
        // Audit guard: warehouse can't receive 50 sequential plates without a checksum format
        $sns = [];
        for ($i = 1; $i <= 50; $i++) {
            $sns[] = 'DNCSS' . str_pad((string)$i, 7, '0', STR_PAD_LEFT);
        }
        $this->assertTrue(dinoco_sn_detect_sequential_mirror($sns),
            'A 50-entry adjacent-integer batch must be flagged as sequential'
        );
    }

    public function test_anti_enumeration_format_must_have_both_rand_and_chk(): void
    {
        $approved = 'DNCSS{RAND6}{CHK1}';
        $this->assertTrue(dinoco_sn_format_is_random_mirror($approved));
        $this->assertTrue(dinoco_sn_format_has_checksum_mirror($approved));

        // Format with random but no checksum is incomplete
        $partial = 'DNCSS{RAND6}';
        $this->assertTrue(dinoco_sn_format_is_random_mirror($partial));
        $this->assertFalse(dinoco_sn_format_has_checksum_mirror($partial));
    }
}
