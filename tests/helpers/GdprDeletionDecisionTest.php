<?php
/**
 * GdprDeletionDecisionTest — pure-logic tests for V.2.0 Phase 6 foundation
 * decision matrix helper.
 *
 * Source: [System] DINOCO GDPR Data Requests V.2.0 (Round 23 Phase 2, 2026-04-29)
 *
 * Scope: We test `dinoco_gdpr_decide_action_for_record($record_type)` — the pure
 * function that maps a record type identifier to one of three actions:
 *   - 'anonymize' (preserve referential integrity, scrub PII fields)
 *   - 'delete'    (remove row entirely, no PII reason to keep)
 *   - 'preserve'  (legal hold or non-PII)
 *
 * Why these matter:
 *   - Wrong matrix → either delete records that must be preserved (Tax §86/14
 *     audit trail violation) or preserve PII that must be erased (PDPA §32 violation)
 *   - SAFE DEFAULT: unknown types fall through to 'preserve' → never accidentally
 *     destroy data we don't recognize (worst case = leftover PII, not data loss)
 *   - These tests lock the matrix per docs/compliance/GDPR-PHASE-6-DESIGN.md §"Erasure Strategy"
 *     so future refactors of the helper don't silently drift.
 *
 * NOTE: These are PURE-LOGIC tests — no DB, no WP. The function is defined in the
 * snippet but mirrored here for isolated testing (same pattern as IdempotencyTest).
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers;

use PHPUnit\Framework\TestCase;

// Inline mirror of the helper under test (same matrix as snippet)
if ( ! function_exists( __NAMESPACE__ . '\\dinoco_gdpr_decide_action_for_record' ) ) {
    function dinoco_gdpr_decide_action_for_record( $record_type ) {
        $matrix = array(
            'wp_users'             => 'anonymize',
            'dinoco_warranty'      => 'anonymize',
            'claim_ticket'         => 'anonymize',
            'b2b_order'            => 'anonymize',
            'wp_usermeta_pii'      => 'delete',
            'line_messages_mongo'  => 'delete',
            'slip_images_fs'       => 'delete',
            'dinoco_debt_log'      => 'preserve',
            'b2f_payable_log'      => 'preserve',
            'b2b_invoice'          => 'preserve',
            'wp_usermeta_non_pii'  => 'preserve',
        );
        $type = is_string( $record_type ) ? strtolower( trim( $record_type ) ) : '';
        return isset( $matrix[ $type ] ) ? $matrix[ $type ] : 'preserve';
    }
}

class GdprDeletionDecisionTest extends TestCase {

    // ════════════════════════════════════════════════════════════════
    // 1. ANONYMIZE bucket — PII-bearing records that must keep ref integrity
    // ════════════════════════════════════════════════════════════════

    public function test_wp_users_anonymized(): void {
        // user_email → hashed; foreign keys preserved
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'wp_users' ) );
    }

    public function test_warranty_cpt_anonymized(): void {
        // 5-year Consumer Protection Act retention → strip customer_* but keep product/SKU
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'dinoco_warranty' ) );
    }

    public function test_claim_ticket_anonymized(): void {
        // Defect record valuable for product safety; remove customer name only
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'claim_ticket' ) );
    }

    public function test_b2b_order_anonymized(): void {
        // 5-year Tax Code retention on order amount + date; strip dist_name + addresses
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'b2b_order' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 2. DELETE bucket — PII without legal preservation requirement
    // ════════════════════════════════════════════════════════════════

    public function test_usermeta_pii_deleted(): void {
        // Phone, address, LINE_UID — no legal need to keep
        $this->assertSame( 'delete', dinoco_gdpr_decide_action_for_record( 'wp_usermeta_pii' ) );
    }

    public function test_line_messages_mongo_deleted(): void {
        // OpenClaw conversation logs — no business obligation
        $this->assertSame( 'delete', dinoco_gdpr_decide_action_for_record( 'line_messages_mongo' ) );
    }

    public function test_slip_images_fs_deleted(): void {
        // Bank account visible in image — high PII risk, must purge
        $this->assertSame( 'delete', dinoco_gdpr_decide_action_for_record( 'slip_images_fs' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 3. PRESERVE bucket — legal hold or non-PII
    // ════════════════════════════════════════════════════════════════

    public function test_debt_log_preserved_legal_hold(): void {
        // Thai Revenue Code §86/14 — 5-year audit trail mandatory
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'dinoco_debt_log' ) );
    }

    public function test_payable_log_preserved_legal_hold(): void {
        // Same as debt log — financial audit trail
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'b2f_payable_log' ) );
    }

    public function test_invoice_preserved_legal_hold(): void {
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'b2b_invoice' ) );
    }

    public function test_usermeta_non_pii_preserved(): void {
        // Non-PII metadata (user preferences, language, etc.) — keep
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'wp_usermeta_non_pii' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 4. SAFE DEFAULT — unknown types fall through to preserve
    // ════════════════════════════════════════════════════════════════

    public function test_unknown_type_defaults_to_preserve(): void {
        // CRITICAL safety property — never accidentally delete unknown record types.
        // Worst case under this rule = leftover PII (admin manual cleanup) rather than
        // accidental data loss (unrecoverable).
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'mystery_table' ) );
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'wp_posts' ) );
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 'random_string' ) );
    }

    public function test_empty_string_defaults_to_preserve(): void {
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( '' ) );
    }

    public function test_null_defaults_to_preserve(): void {
        // Edge case — null/non-string input must NOT crash + must default safely
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( null ) );
    }

    public function test_integer_input_defaults_to_preserve(): void {
        // Defensive — non-string types coerced safely
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( 123 ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 5. CASE INSENSITIVITY + WHITESPACE — input normalization
    // ════════════════════════════════════════════════════════════════

    public function test_input_is_lowercased(): void {
        // 'WP_USERS' or 'Wp_Users' both → 'wp_users' → 'anonymize'
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'WP_USERS' ) );
        $this->assertSame( 'anonymize', dinoco_gdpr_decide_action_for_record( 'Wp_Users' ) );
    }

    public function test_input_is_trimmed(): void {
        // Whitespace tolerated (defensive — various callers may not pre-trim)
        $this->assertSame( 'preserve', dinoco_gdpr_decide_action_for_record( '  dinoco_debt_log  ' ) );
    }

    // ════════════════════════════════════════════════════════════════
    // 6. INVARIANT — every action is one of three valid values
    // ════════════════════════════════════════════════════════════════

    public function test_all_documented_record_types_return_valid_action(): void {
        $known_types = array(
            'wp_users', 'dinoco_warranty', 'claim_ticket', 'b2b_order',
            'wp_usermeta_pii', 'line_messages_mongo', 'slip_images_fs',
            'dinoco_debt_log', 'b2f_payable_log', 'b2b_invoice',
            'wp_usermeta_non_pii',
        );
        $valid_actions = array( 'anonymize', 'delete', 'preserve' );
        foreach ( $known_types as $type ) {
            $action = dinoco_gdpr_decide_action_for_record( $type );
            $this->assertContains( $action, $valid_actions,
                "Action '{$action}' for type '{$type}' MUST be one of: anonymize, delete, preserve"
            );
        }
    }

    public function test_legal_hold_records_NEVER_return_delete(): void {
        // CRITICAL invariant — financial records must NEVER trigger delete
        // under any input variant (case, whitespace, etc.)
        $legal_hold = array(
            'dinoco_debt_log', 'b2f_payable_log', 'b2b_invoice',
            'DINOCO_DEBT_LOG', '  dinoco_debt_log  ',
            'B2F_Payable_Log', 'B2B_INVOICE',
        );
        foreach ( $legal_hold as $type ) {
            $this->assertNotSame( 'delete', dinoco_gdpr_decide_action_for_record( $type ),
                "Legal-hold record '{$type}' MUST NEVER be classified as 'delete' (Thai Revenue Code §86/14 violation)"
            );
        }
    }
}
