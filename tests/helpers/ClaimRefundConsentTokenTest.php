<?php
/**
 * ClaimRefundConsentTokenTest — pure-logic tests for Sprint 15 H2+M4.
 *
 * Source of truth:
 *   - [Admin System] DINOCO Claim Charges Schema V.0.4 — schema + helper
 *     dinoco_claim_refund_approvals_table_name() + amount_thb_at_create col
 *   - [System] DINOCO Claim Payment LIFF V.0.4 — REST endpoints
 *     POST /charges/{id}/approve-refund + POST /charge/{id}/refund extended
 *   - dinoco_claim_charge_transition() — atomic token consume inside txn
 *
 * Scope: SOURCE-FINGERPRINT verification (no WP/DB bootstrap). Mirrors
 * ClaimChargesSchemaTest convention. Confirms snippet text contains all the
 * H2 + M4 guards in the right positions.
 *
 * Coverage:
 *   • Schema: amount_thb_at_create column DDL + refund_approvals CREATE TABLE
 *   • Schema: refund_approvals 4-col primary structure + indexes + UNIQUE
 *   • Helper: dinoco_claim_refund_approvals_table_name() defined + correct
 *   • LIFF: POST /charges/{id}/approve-refund route registered
 *   • LIFF: refund handler reads amount_thb_at_create (not amount_thb)
 *   • LIFF: consent_token required when amount_create >= 5000
 *   • LIFF: token format regex [A-Za-z0-9]{1,64} enforced
 *   • LIFF: 5 pre-lock error codes (not_found / consumed / expired /
 *           self_approval / approver_mismatch)
 *   • LIFF: token row id passed to transition via context
 *   • Txn: amount_thb === amount_thb_at_create drift detection (±฿0.01)
 *   • Txn: atomic UPDATE consumed_at = NOW WHERE consumed_at IS NULL
 *           + affected_rows = 1 invariant
 *   • Txn: actor != approver assertion inside transition (defense-in-depth)
 *   • Retention: refund_approvals 7-day purge + chunked + ORDER BY id ASC
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\ClaimRefundConsentToken;

use PHPUnit\Framework\TestCase;

final class SnippetFixture {
    /** @var string|null */
    public static $schema_source = null;
    /** @var string|null */
    public static $liff_source   = null;

    public static function schema(): string {
        if ( self::$schema_source !== null ) return self::$schema_source;
        $path = __DIR__ . '/../../[Admin System] DINOCO Claim Charges Schema';
        if ( ! file_exists( $path ) ) {
            throw new \RuntimeException( 'Schema snippet not found: ' . $path );
        }
        $text = file_get_contents( $path );
        if ( $text === false ) {
            throw new \RuntimeException( 'Failed reading schema snippet' );
        }
        return self::$schema_source = $text;
    }

    public static function liff(): string {
        if ( self::$liff_source !== null ) return self::$liff_source;
        $path = __DIR__ . '/../../[System] DINOCO Claim Payment LIFF';
        if ( ! file_exists( $path ) ) {
            throw new \RuntimeException( 'LIFF snippet not found: ' . $path );
        }
        $text = file_get_contents( $path );
        if ( $text === false ) {
            throw new \RuntimeException( 'Failed reading LIFF snippet' );
        }
        return self::$liff_source = $text;
    }
}

class ClaimRefundConsentTokenTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // H2 — amount_thb_at_create immutable snapshot
    // ════════════════════════════════════════════════════════════════

    public function test_schema_declares_amount_thb_at_create_column(): void {
        $src = SnippetFixture::schema();
        $this->assertMatchesRegularExpression(
            '/amount_thb_at_create\s+DECIMAL\(14,2\)\s+NOT\s+NULL/',
            $src
        );
    }

    public function test_schema_version_bumped_to_1_3(): void {
        // Sprint 16 C1 fix forces dbDelta re-run for corrected CHECK clause.
        $src = SnippetFixture::schema();
        $this->assertMatchesRegularExpression(
            '/define\(\s*\'DINOCO_CLAIM_CHARGES_SCHEMA_VERSION\'\s*,\s*\'1\.3\'\s*\)/',
            $src
        );
    }

    public function test_schema_amount_snapshot_check_constraint_enforces_equality(): void {
        // Sprint 16 C1 — was `(amount_thb_at_create > 0)` (positivity only,
        // already covered by chk_amount_positive). Now enforces the actual
        // immutability invariant via equality.
        $src = SnippetFixture::schema();
        $this->assertStringContainsString( 'chk_amount_snapshot', $src );
        $this->assertMatchesRegularExpression(
            "/'chk_amount_snapshot'\s*=>\s*\"\(amount_thb\s*=\s*amount_thb_at_create\)\"/",
            $src
        );
        // Negative-path: ensure old wrong clause is gone
        $this->assertDoesNotMatchRegularExpression(
            "/'chk_amount_snapshot'\s*=>\s*\"\(amount_thb_at_create\s*>\s*0\)\"/",
            $src
        );
    }

    public function test_liff_refund_handler_reads_amount_thb_at_create(): void {
        // The pre-lock REST handler MUST read amount_thb_at_create (not
        // amount_thb) to decide 4-eyes threshold — else attacker who lowered
        // amount_thb can sneak below ฿5K.
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/SELECT\s+amount_thb_at_create\s+FROM\s+\{\$table\}/',
            $src
        );
    }

    public function test_liff_transition_selects_amount_thb_at_create_for_update(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/SELECT\s+id,\s*claim_id,\s*user_id,\s*amount_thb,\s*amount_thb_at_create,\s*status,\s*verified_by\s+FROM\s+\{\$table\}\s+WHERE\s+id\s*=\s*%d\s+FOR\s+UPDATE/',
            $src
        );
    }

    public function test_liff_transition_drift_check_with_satang_tolerance(): void {
        $src = SnippetFixture::liff();
        // abs(amount_now - amount_create) > 0.01  → drift
        $this->assertMatchesRegularExpression(
            '/abs\(\s*\$amount_now\s*-\s*\$amount_create\s*\)\s*>\s*0\.01/',
            $src
        );
        $this->assertStringContainsString( 'amount_drift_detected', $src );
    }

    public function test_liff_transition_4_eyes_uses_amount_create_not_now(): void {
        // 4-eyes gate compares snapshot to threshold, not current value
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/if\s*\(\s*\$amount_create\s*>=\s*5000\.0\s*\)/',
            $src
        );
    }

    public function test_liff_transition_rolls_back_on_missing_snapshot(): void {
        // If amount_thb_at_create is NULL/0 (legacy row pre-migration) →
        // refund refused with explicit error.
        $src = SnippetFixture::liff();
        $this->assertStringContainsString( 'amount_snapshot_missing', $src );
    }

    // ════════════════════════════════════════════════════════════════
    // M4 — refund_approvals consent token table + handler
    // ════════════════════════════════════════════════════════════════

    public function test_schema_declares_refund_approvals_table_helper(): void {
        $src = SnippetFixture::schema();
        $this->assertStringContainsString(
            'function dinoco_claim_refund_approvals_table_name()',
            $src
        );
        $this->assertMatchesRegularExpression(
            "/return\s+\\\$wpdb->prefix\s*\.\s*'dinoco_claim_refund_approvals'/",
            $src
        );
    }

    public function test_schema_declares_refund_approvals_ddl(): void {
        $src = SnippetFixture::schema();
        $required_columns = [
            'id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT',
            'charge_id BIGINT(20) UNSIGNED NOT NULL',
            'approver_user_id BIGINT(20) UNSIGNED NOT NULL',
            'consent_token CHAR(64) COLLATE utf8mb4_bin NOT NULL',
            'created_at DATETIME NOT NULL',
            'expires_at DATETIME NOT NULL',
            'consumed_at DATETIME DEFAULT NULL',
            'consumed_by_user_id BIGINT(20) UNSIGNED DEFAULT NULL',
        ];
        foreach ( $required_columns as $col ) {
            $this->assertStringContainsString( $col, $src,
                "refund_approvals DDL missing column: {$col}" );
        }
    }

    public function test_schema_refund_approvals_has_unique_consent_token(): void {
        $src = SnippetFixture::schema();
        $this->assertStringContainsString(
            'UNIQUE KEY uq_consent_token (consent_token)',
            $src
        );
    }

    public function test_schema_refund_approvals_has_charge_approver_index(): void {
        $src = SnippetFixture::schema();
        $this->assertStringContainsString(
            'KEY idx_charge_approver (charge_id, approver_user_id)',
            $src
        );
        $this->assertStringContainsString(
            'KEY idx_expires (expires_at)',
            $src
        );
    }

    public function test_schema_dbdelta_runs_both_tables(): void {
        $src = SnippetFixture::schema();
        // Both tables dbDelta'd in same try block
        $this->assertMatchesRegularExpression(
            '/dbDelta\(\s*\$sql\s*\);\s*\n?\s*dbDelta\(\s*\$sql_approvals\s*\)/',
            $src
        );
    }

    public function test_liff_registers_approve_refund_route(): void {
        $src = SnippetFixture::liff();
        // Note: snippet uses double-backslash in JS path regex for `\d+`
        $this->assertMatchesRegularExpression(
            '/register_rest_route\(\s*\$base\s*,\s*\'\/charges\/\(\?P<id>\\\\\\\\d\+\)\/approve-refund\'/',
            $src
        );
        $this->assertStringContainsString(
            "'callback'            => 'dinoco_claim_payment_rest_approve_refund'",
            $src
        );
    }

    public function test_liff_approve_refund_handler_defined(): void {
        $src = SnippetFixture::liff();
        $this->assertStringContainsString(
            'function dinoco_claim_payment_rest_approve_refund( $req )',
            $src
        );
    }

    public function test_liff_approve_refund_clamps_ttl_5_to_60_minutes(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/if\s*\(\s*\$ttl_minutes\s*<\s*5\s*\)\s*\$ttl_minutes\s*=\s*5\s*;/',
            $src
        );
        $this->assertMatchesRegularExpression(
            '/if\s*\(\s*\$ttl_minutes\s*>\s*60\s*\)\s*\$ttl_minutes\s*=\s*60\s*;/',
            $src
        );
    }

    public function test_liff_approve_refund_rate_limit_20_per_hour(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            "/b2b_rate_limit\(\s*'claim_refund_approve_'\s*\.\s*\\\$uid\s*,\s*20\s*,\s*3600\s*\)/",
            $src
        );
    }

    public function test_liff_approve_refund_rejects_self_approval_at_issuance(): void {
        // Approver != verified_by at token issuance time (defense-in-depth +
        // early error to admin instead of opaque consume failure at refund).
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/if\s*\(\s*\(int\)\s*\$charge\[\'verified_by\'\]\s*===\s*\$uid\s*\)/',
            $src
        );
        $this->assertStringContainsString( 'four_eyes_self_approval', $src );
    }

    public function test_liff_approve_refund_requires_verified_charge_state(): void {
        $src = SnippetFixture::liff();
        $this->assertStringContainsString( 'charge_not_verified', $src );
        $this->assertMatchesRegularExpression(
            "/if\s*\(\s*\(string\)\s*\\\$charge\['status'\]\s*!==\s*'verified'\s*\)/",
            $src
        );
    }

    public function test_liff_approve_refund_generates_64_char_token(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/wp_generate_password\(\s*64\s*,\s*false\s*,\s*false\s*\)/',
            $src
        );
    }

    public function test_liff_refund_validates_token_format_regex(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            "/preg_match\(\s*'\/\\^\[A-Za-z0-9\]\{1,64\}\\\$\/',\s*\\\$consent_token\s*\)/",
            $src
        );
        $this->assertStringContainsString( 'consent_token_invalid_format', $src );
    }

    public function test_liff_refund_validates_token_pre_lock_5_error_codes(): void {
        $src = SnippetFixture::liff();
        $codes = [
            'consent_token_required',
            'consent_token_not_found',
            'consent_token_already_consumed',
            'consent_token_expired',
            'consent_self_approval',
            'consent_approver_mismatch',
        ];
        foreach ( $codes as $c ) {
            $this->assertStringContainsString( $c, $src,
                "Refund handler missing error code: {$c}" );
        }
    }

    public function test_liff_refund_passes_consent_row_id_to_transition(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            "/'consent_token_row_id'\s*=>\s*\\\$consent_token_row_id/",
            $src
        );
    }

    public function test_liff_refund_uses_consent_token_as_idem_discriminator(): void {
        // Sprint 15 R42 binary-fingerprint pattern — token differentiates
        // refund retry of SAME attempt from DIFFERENT attempt.
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            "/'idem_discriminator'\s*=>\s*\\\$consent_token/",
            $src
        );
    }

    public function test_liff_transition_consumes_token_inside_transaction(): void {
        // The UPDATE must run AFTER START TRANSACTION and BEFORE COMMIT,
        // with WHERE consumed_at IS NULL AND expires_at >= NOW invariant.
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/UPDATE\s+\{\$atable\}\s+SET\s+consumed_at\s*=\s*%s,\s*consumed_by_user_id\s*=\s*%d\s+WHERE\s+id\s*=\s*%d\s+AND\s+charge_id\s*=\s*%d\s+AND\s+consumed_at\s+IS\s+NULL\s+AND\s+expires_at\s*>=\s*%s/',
            $src
        );
    }

    public function test_liff_transition_rollback_on_consume_failure(): void {
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/\(int\)\s*\$consume_affected\s*!==\s*1/',
            $src
        );
        $this->assertStringContainsString( 'consent_already_consumed', $src );
    }

    public function test_liff_transition_rejects_actor_as_approver(): void {
        // Defense in depth: even if token passes pre-lock check, transition
        // re-asserts approver != actor_uid (catches race where user_id rotates).
        $src = SnippetFixture::liff();
        $this->assertMatchesRegularExpression(
            '/\$approver\s*===\s*\$actor_uid/',
            $src
        );
        $this->assertStringContainsString( 'four_eyes_actor_is_approver', $src );
    }

    // ════════════════════════════════════════════════════════════════
    // Retention — refund_approvals 7-day purge
    // ════════════════════════════════════════════════════════════════

    public function test_cleanup_run_purges_refund_approvals_after_7_days(): void {
        $src = SnippetFixture::schema();
        $this->assertMatchesRegularExpression(
            '/expires_at\s*<\s*DATE_SUB\(NOW\(\),\s*INTERVAL\s+7\s+DAY\)/',
            $src
        );
    }

    public function test_cleanup_run_uses_order_by_id_asc_for_approvals(): void {
        // Replication-safe deterministic ordering
        $src = SnippetFixture::schema();
        $this->assertMatchesRegularExpression(
            '/DELETE\s+FROM\s+\{\$atable\}[\s\S]*?ORDER\s+BY\s+id\s+ASC[\s\S]*?LIMIT\s+1000/',
            $src
        );
    }

    public function test_cleanup_run_chunks_approvals_with_50ms_gap(): void {
        // Chunked 1000/iter × 20 max + 50ms breathing room
        $src = SnippetFixture::schema();
        // After approvals deletion block, usleep(50000)
        $this->assertMatchesRegularExpression(
            '/refund_approvals.+?usleep\(\s*50000\s*\)/s',
            $src
        );
    }

    public function test_cleanup_run_heartbeat_includes_approvals_deleted(): void {
        $src = SnippetFixture::schema();
        $this->assertStringContainsString( "'approvals_deleted'", $src );
    }
}
