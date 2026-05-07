<?php
/**
 * REG-087 — PDPA export scope (sn_pool extension)
 *
 * Plan v2.13 Phase 4 W14.4 — GDPR V.4.1 sn_pool extension.
 * Verifies the SN-related portion of the customer data export bundle:
 *   - Includes sn_pool entries WHERE registered_user_id = ?
 *   - Includes sn_pool_meta (purchase_dealer_id, purchase_date)
 *   - Includes audit rows where actor_user_id = ? OR approver_user_id = ?
 *   - Anonymizes on delete: registered_user_id -> 0
 *   - Retention: 5y sensitive_op rows + 3y operational rows
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnPdpaExportScope;

use PHPUnit\Framework\TestCase;

/**
 * Pure-logic mirror of dinoco_gdpr_collect_sn_for_user($user_id, $sn_pool_db).
 */
function dinoco_sn_pdpa_collect_mirror(int $user_id, array $sn_pool, array $sn_pool_meta, array $audit): array
{
    $owned = array_values(array_filter(
        $sn_pool,
        static fn(array $row) => ($row['registered_user_id'] ?? 0) === $user_id
    ));
    $meta = [];
    foreach ($owned as $row) {
        $sn = $row['sn'];
        if (isset($sn_pool_meta[$sn])) {
            $meta[] = $sn_pool_meta[$sn] + ['sn' => $sn];
        }
    }
    $audit_rows = array_values(array_filter(
        $audit,
        static fn(array $row) => (($row['actor_user_id'] ?? 0) === $user_id)
            || (($row['approver_user_id'] ?? 0) === $user_id)
    ));
    return [
        'sn_pool' => $owned,
        'sn_pool_meta' => $meta,
        'audit' => $audit_rows,
    ];
}

/**
 * Anonymize a row for hard-delete request.
 * Returns the redacted row (registered_user_id -> 0, phone masked).
 */
function dinoco_sn_pdpa_anonymize_mirror(array $row): array
{
    $row['registered_user_id'] = 0;
    if (isset($row['context_json']) && is_array($row['context_json'])) {
        if (isset($row['context_json']['phone'])) {
            $phone = (string) $row['context_json']['phone'];
            $len = strlen($phone);
            if ($len > 4) {
                $row['context_json']['phone'] = '***-***-' . substr($phone, -4);
            } else {
                $row['context_json']['phone'] = '***';
            }
        }
    }
    return $row;
}

/**
 * Retention check — based on PDPA Art 17.
 *
 * sensitive_op: financial/4-eyes/refund — 5 yr retention
 * operational: receive/activate/transfer — 3 yr retention
 */
function dinoco_sn_pdpa_retention_days_mirror(string $event_type): int
{
    $sensitive = [
        'refund_issued', 'extension_purchased', 'replacement_shipped',
        'fraud_flagged', 'four_eyes_approval', 'manual_refund',
    ];
    if (in_array($event_type, $sensitive, true)) {
        return 5 * 365;
    }
    return 3 * 365;
}

class SnPdpaExportScopeTest extends TestCase
{
    public function test_collects_only_user_owned_plates(): void
    {
        $sn_pool = [
            ['sn' => 'DNCSS001', 'registered_user_id' => 100],
            ['sn' => 'DNCSS002', 'registered_user_id' => 100],
            ['sn' => 'DNCSS003', 'registered_user_id' => 200],
        ];
        $r = dinoco_sn_pdpa_collect_mirror(100, $sn_pool, [], []);
        $this->assertCount(2, $r['sn_pool']);
        foreach ($r['sn_pool'] as $row) {
            $this->assertSame(100, $row['registered_user_id']);
        }
    }

    public function test_includes_meta_for_owned_plates_only(): void
    {
        $sn_pool = [
            ['sn' => 'DNCSS001', 'registered_user_id' => 100],
            ['sn' => 'DNCSS003', 'registered_user_id' => 200],
        ];
        $sn_pool_meta = [
            'DNCSS001' => ['purchase_dealer_id' => 7, 'purchase_date' => '2026-01-01'],
            'DNCSS003' => ['purchase_dealer_id' => 9, 'purchase_date' => '2026-02-01'],
        ];
        $r = dinoco_sn_pdpa_collect_mirror(100, $sn_pool, $sn_pool_meta, []);
        $this->assertCount(1, $r['sn_pool_meta']);
        $this->assertSame('DNCSS001', $r['sn_pool_meta'][0]['sn']);
    }

    public function test_audit_rows_include_actor_role(): void
    {
        $audit = [
            ['id' => 1, 'actor_user_id' => 100, 'approver_user_id' => 0],
            ['id' => 2, 'actor_user_id' => 200, 'approver_user_id' => 0],
            ['id' => 3, 'actor_user_id' => 0, 'approver_user_id' => 100], // approver only
        ];
        $r = dinoco_sn_pdpa_collect_mirror(100, [], [], $audit);
        $ids = array_column($r['audit'], 'id');
        $this->assertSame([1, 3], $ids);
    }

    public function test_anonymize_zeroes_user_id(): void
    {
        $row = ['sn' => 'DNCSS001', 'registered_user_id' => 100];
        $redacted = dinoco_sn_pdpa_anonymize_mirror($row);
        $this->assertSame(0, $redacted['registered_user_id']);
        $this->assertSame('DNCSS001', $redacted['sn']);
    }

    public function test_anonymize_masks_phone_in_context_json(): void
    {
        $row = [
            'sn' => 'DNCSS001',
            'context_json' => ['phone' => '0812345678', 'reason' => 'transfer'],
        ];
        $redacted = dinoco_sn_pdpa_anonymize_mirror($row);
        $this->assertSame('***-***-5678', $redacted['context_json']['phone']);
        $this->assertSame('transfer', $redacted['context_json']['reason']); // unrelated kept
    }

    public function test_anonymize_short_phone(): void
    {
        $row = ['context_json' => ['phone' => '123']];
        $redacted = dinoco_sn_pdpa_anonymize_mirror($row);
        $this->assertSame('***', $redacted['context_json']['phone']);
    }

    public function test_anonymize_idempotent(): void
    {
        $row = ['registered_user_id' => 100, 'context_json' => ['phone' => '0812345678']];
        $r1 = dinoco_sn_pdpa_anonymize_mirror($row);
        $r2 = dinoco_sn_pdpa_anonymize_mirror($r1);
        $this->assertSame($r1, $r2);
    }

    public function test_retention_5y_for_financial_events(): void
    {
        $financial = ['refund_issued', 'extension_purchased', 'replacement_shipped',
                      'fraud_flagged', 'four_eyes_approval', 'manual_refund'];
        foreach ($financial as $e) {
            $this->assertSame(5 * 365, dinoco_sn_pdpa_retention_days_mirror($e), "Event: {$e}");
        }
    }

    public function test_retention_3y_for_operational_events(): void
    {
        $operational = ['plate_received', 'plate_activated', 'transfer', 'lookup', 'audit_view'];
        foreach ($operational as $e) {
            $this->assertSame(3 * 365, dinoco_sn_pdpa_retention_days_mirror($e), "Event: {$e}");
        }
    }

    public function test_empty_user_returns_empty_export(): void
    {
        $r = dinoco_sn_pdpa_collect_mirror(99999, [], [], []);
        $this->assertSame([], $r['sn_pool']);
        $this->assertSame([], $r['sn_pool_meta']);
        $this->assertSame([], $r['audit']);
    }

    public function test_export_response_shape(): void
    {
        $r = dinoco_sn_pdpa_collect_mirror(100, [], [], []);
        $this->assertArrayHasKey('sn_pool', $r);
        $this->assertArrayHasKey('sn_pool_meta', $r);
        $this->assertArrayHasKey('audit', $r);
    }
}
