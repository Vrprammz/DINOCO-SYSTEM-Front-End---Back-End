<?php
/**
 * REG-097 — Audit retention cron (PDPA §17 storage limitation).
 *
 * Plan v2.13 §Phase 1 W4 R3 HIGH + REG-087.
 *
 * Retention buckets:
 *   - 90 days  — IP/UA anonymize (NULL out request_ip + request_ua, keep row)
 *   - 3 years  — operational rows DELETE
 *   - 5 years  — financial / sensitive_op rows KEEP (regulatory minimum)
 *
 * Sensitive op = event_type ∈ {manual_refund, swap, void, recall, stolen_report,
 *   extension_purchase, marketplace_payment}
 *
 * Operational = everything else.
 *
 * Mirror function:
 *   dinoco_sn_audit_retention_decide($row, $now_ts) → 'anonymize' | 'delete' | 'keep'
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\SnAuditRetention;

use PHPUnit\Framework\TestCase;

const SENSITIVE_OPS = array(
    'manual_refund', 'swap', 'void', 'recall',
    'stolen_report', 'extension_purchase', 'marketplace_payment',
);

const ANON_THRESHOLD_DAYS  = 90;
const OPERATIONAL_TTL_DAYS = 365 * 3; // 3 years
const SENSITIVE_TTL_DAYS   = 365 * 5; // 5 years

if ( ! function_exists( __NAMESPACE__ . '\\decide' ) ) {
    /**
     * @param array $row { event_type:string, created_at_ts:int, request_ip:?string, request_ua:?string }
     * @param int   $now_ts
     * @return string 'anonymize' | 'delete' | 'keep'
     */
    function decide( array $row, int $now_ts ): string {
        $age_days   = intdiv( $now_ts - (int) $row['created_at_ts'], 86400 );
        $is_sense   = in_array( $row['event_type'] ?? '', SENSITIVE_OPS, true );
        $ttl_days   = $is_sense ? SENSITIVE_TTL_DAYS : OPERATIONAL_TTL_DAYS;

        // 1) Beyond TTL → delete (financial keep is enforced by ttl)
        if ( $age_days > $ttl_days ) {
            return $is_sense ? 'keep' : 'delete';
            // For sensitive: > 5y the operational policy is to keep until manual review.
            // We do NOT auto-delete sensitive rows.
        }

        // 2) Beyond anon threshold but within TTL → anonymize PII
        if ( $age_days > ANON_THRESHOLD_DAYS ) {
            // No-op if already anonymized
            if ( $row['request_ip'] === null && $row['request_ua'] === null ) {
                return 'keep';
            }
            return 'anonymize';
        }

        // 3) Within 90 days → keep as-is
        return 'keep';
    }
}

class SnAuditRetentionTest extends TestCase {

    private const NOW = 1_800_000_000; // arbitrary epoch reference (~2027)

    private function row( string $event, int $age_days, ?string $ip = '1.2.3.4', ?string $ua = 'curl/8' ): array {
        return array(
            'event_type'    => $event,
            'created_at_ts' => self::NOW - ( $age_days * 86400 ),
            'request_ip'    => $ip,
            'request_ua'    => $ua,
        );
    }

    /* ─── 90-day anonymization ─── */

    public function test_within_90d_keep(): void {
        $row = $this->row( 'pool_status_changed', 30 );
        $this->assertSame( 'keep', decide( $row, self::NOW ) );
    }

    public function test_at_89d_keep(): void {
        $row = $this->row( 'pool_status_changed', 89 );
        $this->assertSame( 'keep', decide( $row, self::NOW ) );
    }

    public function test_at_91d_anonymize(): void {
        $row = $this->row( 'pool_status_changed', 91 );
        $this->assertSame( 'anonymize', decide( $row, self::NOW ) );
    }

    public function test_already_anonymized_returns_keep(): void {
        $row = $this->row( 'pool_status_changed', 200, null, null );
        $this->assertSame( 'keep', decide( $row, self::NOW ) );
    }

    /* ─── 3-year operational delete ─── */

    public function test_operational_at_3y_minus_1_keep_anon(): void {
        $row = $this->row( 'pool_status_changed', 365 * 3 - 1 );
        $this->assertSame( 'anonymize', decide( $row, self::NOW ) );
    }

    public function test_operational_at_3y_plus_1_delete(): void {
        $row = $this->row( 'pool_status_changed', 365 * 3 + 1 );
        $this->assertSame( 'delete', decide( $row, self::NOW ) );
    }

    public function test_operational_4y_delete(): void {
        $row = $this->row( 'pool_status_changed', 365 * 4 );
        $this->assertSame( 'delete', decide( $row, self::NOW ) );
    }

    /* ─── 5-year sensitive retention ─── */

    public function test_sensitive_swap_at_3y_anonymized(): void {
        $row = $this->row( 'swap', 365 * 3 );
        $this->assertSame( 'anonymize', decide( $row, self::NOW ) );
    }

    public function test_sensitive_manual_refund_at_5y_minus_1_keep(): void {
        // PDPA §17 requires longer retention for financial events
        $row = $this->row( 'manual_refund', 365 * 5 - 1 );
        $this->assertSame( 'anonymize', decide( $row, self::NOW ) );
    }

    public function test_sensitive_at_6y_keep_not_delete(): void {
        $row = $this->row( 'manual_refund', 365 * 6 );
        $this->assertSame(
            'keep',
            decide( $row, self::NOW ),
            'sensitive ops MUST NOT auto-delete past 5y (manual review required)'
        );
    }

    public function test_sensitive_recall_at_5y_anonymized(): void {
        $row = $this->row( 'recall', 365 * 5 );
        $this->assertSame( 'anonymize', decide( $row, self::NOW ) );
    }

    /* ─── Sensitive op enumeration ─── */

    public function test_all_7_sensitive_ops_recognised(): void {
        foreach ( SENSITIVE_OPS as $op ) {
            $row = $this->row( $op, 365 * 6 );
            $this->assertSame(
                'keep', decide( $row, self::NOW ),
                "{$op} is sensitive — must KEEP past 5y"
            );
        }
    }

    public function test_unknown_event_treated_as_operational(): void {
        $row = $this->row( 'made_up_event', 365 * 4 );
        $this->assertSame( 'delete', decide( $row, self::NOW ) );
    }

    /* ─── Boundary safety ─── */

    public function test_zero_age_keep(): void {
        $row = $this->row( 'pool_status_changed', 0 );
        $this->assertSame( 'keep', decide( $row, self::NOW ) );
    }
}
