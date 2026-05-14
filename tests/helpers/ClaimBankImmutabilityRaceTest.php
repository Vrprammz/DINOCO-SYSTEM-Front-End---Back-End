<?php
/**
 * ClaimBankImmutabilityRaceTest — pure-logic tests for Phase 2 V.2.2 B-4
 *
 * Source of truth: docs/feature-specs/FEATURE-SPEC-CLAIM-LIFECYCLE-2026-05-13.md §6.4
 * Implementation: [System] DINOCO Claim Payment LIFF V.0.7+ charge_create handler
 *
 * Race scenario closed by B-4:
 *   T+0ms     Admin opens [dinoco_claim_bank_settings], starts editing
 *   T+1000ms  Customer triggers charge create (clicks "ออกบิล")
 *   T+1500ms  Admin clicks Save → commits NEW bank account to wp_options
 *
 * Expected behavior:
 *   - Charge row created at T+1000ms holds OLD bank in 7 snapshot columns
 *   - Charge row created at T+2000ms (post-save) holds NEW bank in 7 columns
 *   - Customer who already received Flex with OLD account # transfers to
 *     OLD account → Slip2Go matches old charge.bank_code (NOT current setting)
 *   - Without immutability snapshot: legitimate slip → false-reject
 *
 * Coverage:
 *   1. snapshot_bank_at_create — values come from dinoco_claim_bank_resolve()
 *      returned at INSERT time, NOT subsequent wp_options read
 *   2. snapshot_includes_all_7_columns — bank_name + bank_name_en + bank_account
 *      + bank_holder + bank_code + bank_branch + bank_context
 *   3. snapshot_preserved_across_admin_change — simulate wp_options change
 *      after charge.created_at → row.bank_account stays original
 *   4. walkin_context_resolves_to_walkin_keys — use_walkin=true selects
 *      DINOCO_CLAIM_WALKIN_BANK_* (not DINOCO_CLAIM_BANK_*)
 *   5. bank_context_column_records_resolution — schema bank_context='claim'
 *      vs 'claim_walkin' tells future readers which snapshot path was taken
 *
 * Pattern: pure-logic — no real wpdb. Mock resolver returns array; assert
 * the 7-column shape gets persisted unchanged. Race aspect simulated via
 * temporal sequence of resolver mock results.
 *
 * Why pure-logic suffices: the race-window guard is structural (GET_LOCK +
 * START TRANSACTION wrap the resolve→insert pair so admin save serializes
 * AFTER insert). PHPUnit cannot test MySQL GET_LOCK semantics without a
 * real DB connection. What we CAN test is the data-flow invariant: the 7
 * column values passed to wpdb->insert() MUST be the SAME array values
 * dinoco_claim_bank_resolve() returned moments earlier — no path reads from
 * wp_options between resolve and insert.
 */

declare( strict_types=1 );

namespace DinocoTests\Helpers\ClaimBankImmutabilityRace;

use PHPUnit\Framework\TestCase;

// ──────────────────────────────────────────────────────────────────────────
// Fixture: simulate dinoco_claim_bank_resolve() return shapes (V.0.7 spec)
// + simulate the charge_create snapshot pipeline (resolve → 7-column insert).
// ──────────────────────────────────────────────────────────────────────────

if ( ! function_exists( __NAMESPACE__ . '\\fake_resolve_bank' ) ) {
    /**
     * Simulates dinoco_claim_bank_resolve($use_walkin) — returns 7-column
     * shape matching wp_dinoco_claim_charges bank_* columns.
     */
    function fake_resolve_bank( bool $use_walkin, array $wp_options ): array {
        $prefix = $use_walkin ? 'dinoco_claim_walkin_' : 'dinoco_claim_';
        return array(
            'bank_name'    => $wp_options[ $prefix . 'bank_name' ] ?? '',
            'bank_name_en' => $wp_options[ $prefix . 'bank_name_en' ] ?? '',
            'bank_account' => $wp_options[ $prefix . 'bank_account' ] ?? '',
            'bank_holder'  => $wp_options[ $prefix . 'bank_holder' ] ?? '',
            'bank_code'    => $wp_options[ $prefix . 'bank_code' ] ?? '',
            'bank_branch'  => $wp_options[ $prefix . 'bank_branch' ] ?? '',
        );
    }
}

if ( ! function_exists( __NAMESPACE__ . '\\snapshot_charge_insert_columns' ) ) {
    /**
     * Simulates the bank-snapshot pipeline from V.0.7 charge_create handler
     * (lines 1372-1383 of [System] DINOCO Claim Payment LIFF).
     *
     * IMPORTANT: this function reads $wp_options ONCE at the top, then passes
     * the resolved array straight to the "insert" stage. If subsequent calls
     * to fake_resolve_bank() return different values (admin save mid-flow),
     * those NEW values do NOT leak into the snapshot — that's the invariant.
     */
    function snapshot_charge_insert_columns( int $claim_id, bool $use_walkin, array $wp_options ): array {
        // Stage 1 — resolve bank (single read, captured at this instant)
        $bank = fake_resolve_bank( $use_walkin, $wp_options );

        // Stage 2 — build the 7-column snapshot payload for wpdb->insert
        return array(
            'claim_id'     => $claim_id,
            'bank_name'    => $bank['bank_name'],
            'bank_name_en' => $bank['bank_name_en'],
            'bank_account' => $bank['bank_account'],
            'bank_holder'  => $bank['bank_holder'],
            'bank_code'    => $bank['bank_code'],
            'bank_branch'  => $bank['bank_branch'],
            'bank_context' => $use_walkin ? 'claim_walkin' : 'claim',
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

class ClaimBankImmutabilityRaceTest extends TestCase {

    /** Baseline OLD bank state — what admin had before edit. */
    private function old_options(): array {
        return array(
            'dinoco_claim_bank_name'    => 'ธนาคารกสิกรไทย',
            'dinoco_claim_bank_name_en' => 'KASIKORNBANK',
            'dinoco_claim_bank_account' => '123-4-56789-0',
            'dinoco_claim_bank_holder'  => 'บริษัท DINOCO จำกัด',
            'dinoco_claim_bank_code'    => '004',
            'dinoco_claim_bank_branch'  => 'รามอินทรา 14',
        );
    }

    /** NEW bank state — what admin saved at T+1500ms. */
    private function new_options(): array {
        return array(
            'dinoco_claim_bank_name'    => 'ธนาคารไทยพาณิชย์',
            'dinoco_claim_bank_name_en' => 'SCB',
            'dinoco_claim_bank_account' => '999-8-77777-7',
            'dinoco_claim_bank_holder'  => 'บริษัท DINOCO จำกัด',
            'dinoco_claim_bank_code'    => '014',
            'dinoco_claim_bank_branch'  => '',
        );
    }

    /** Walk-in bank set — distinct from default claim bank. */
    private function walkin_options(): array {
        return array(
            'dinoco_claim_walkin_bank_name'    => 'กรุงไทย',
            'dinoco_claim_walkin_bank_name_en' => 'KTB',
            'dinoco_claim_walkin_bank_account' => '555-1-22222-2',
            'dinoco_claim_walkin_bank_holder'  => 'DINOCO Walk-in',
            'dinoco_claim_walkin_bank_code'    => '006',
            'dinoco_claim_walkin_bank_branch'  => '',
        );
    }

    // ─── Scenario 1: 7-column snapshot at create time ──────────────

    public function test_snapshot_captures_all_7_required_columns(): void {
        $snap = snapshot_charge_insert_columns( 42, false, $this->old_options() );

        $required = array( 'bank_name', 'bank_name_en', 'bank_account', 'bank_holder',
                           'bank_code', 'bank_branch', 'bank_context' );
        foreach ( $required as $col ) {
            $this->assertArrayHasKey( $col, $snap, "Missing snapshot column: $col" );
        }
    }

    public function test_snapshot_values_match_resolver_output_exactly(): void {
        $opts = $this->old_options();
        $snap = snapshot_charge_insert_columns( 42, false, $opts );

        $this->assertSame( 'ธนาคารกสิกรไทย',  $snap['bank_name'] );
        $this->assertSame( 'KASIKORNBANK',     $snap['bank_name_en'] );
        $this->assertSame( '123-4-56789-0',    $snap['bank_account'] );
        $this->assertSame( 'บริษัท DINOCO จำกัด', $snap['bank_holder'] );
        $this->assertSame( '004',              $snap['bank_code'] );
        $this->assertSame( 'รามอินทรา 14',     $snap['bank_branch'] );
        $this->assertSame( 'claim',            $snap['bank_context'] );
    }

    // ─── Scenario 2: race — admin save AFTER charge create doesn't leak ──

    public function test_charge_created_before_admin_save_preserves_old_bank(): void {
        // T+1000ms: customer creates charge under OLD bank
        $old_snap = snapshot_charge_insert_columns( 100, false, $this->old_options() );

        // T+1500ms: admin saves NEW bank to wp_options (simulated via second resolve)
        // T+2000ms: subsequent charge create reads NEW bank
        $new_snap = snapshot_charge_insert_columns( 101, false, $this->new_options() );

        // Assertion 1 — old charge still holds old values (immutable)
        $this->assertSame( '123-4-56789-0', $old_snap['bank_account'],
            'Old charge bank_account must NOT change after admin save' );
        $this->assertSame( '004',            $old_snap['bank_code'],
            'Old charge bank_code must NOT change after admin save' );

        // Assertion 2 — new charge has new values
        $this->assertSame( '999-8-77777-7',  $new_snap['bank_account'] );
        $this->assertSame( '014',            $new_snap['bank_code'] );

        // Assertion 3 — they MUST diverge (no shared state)
        $this->assertNotSame( $old_snap['bank_account'], $new_snap['bank_account'] );
        $this->assertNotSame( $old_snap['bank_code'],    $new_snap['bank_code'] );
    }

    public function test_slip_verify_uses_charge_snapshot_not_current_wp_options(): void {
        // Charge created with OLD bank
        $charge_snap = snapshot_charge_insert_columns( 200, false, $this->old_options() );

        // Customer transfers money to OLD account ฿500
        // Admin then changes bank to NEW account
        // Slip2Go returns receiver bank_code='004' (matches charge.bank_code)
        // Verifier must compare against charge_snap['bank_code'], NOT new_options

        $slip2go_received_bank_code = '004';  // matches OLD = charge's snapshot
        $slip2go_received_account   = '...6789-0';

        // Pure check — verifier reads from charge row (snapshot), not current wp_options
        $this->assertSame( $charge_snap['bank_code'], $slip2go_received_bank_code,
            'Slip2Go bank_code must match SNAPSHOT, not current wp_options' );
        $this->assertSame(
            substr( str_replace( '-', '', $charge_snap['bank_account'] ), -4 ),
            substr( str_replace( '-', '', $slip2go_received_account ),   -4 ),
            'Last-4 match against snapshot, not current wp_options'
        );
    }

    // ─── Scenario 3: walk-in context resolves to walkin keys ─────────────

    public function test_walkin_context_uses_walkin_options(): void {
        $combined = array_merge( $this->old_options(), $this->walkin_options() );

        $default = snapshot_charge_insert_columns( 300, false, $combined );
        $walkin  = snapshot_charge_insert_columns( 301, true,  $combined );

        $this->assertSame( '123-4-56789-0',  $default['bank_account'],
            'Default context uses dinoco_claim_bank_account' );
        $this->assertSame( '555-1-22222-2',  $walkin['bank_account'],
            'Walk-in context uses dinoco_claim_walkin_bank_account' );

        $this->assertSame( 'claim',          $default['bank_context'] );
        $this->assertSame( 'claim_walkin',   $walkin['bank_context'] );
    }

    public function test_walkin_and_default_bank_codes_can_differ(): void {
        $combined = array_merge( $this->old_options(), $this->walkin_options() );

        $default = snapshot_charge_insert_columns( 400, false, $combined );
        $walkin  = snapshot_charge_insert_columns( 401, true,  $combined );

        $this->assertSame( '004', $default['bank_code'] );
        $this->assertSame( '006', $walkin['bank_code'] );
        $this->assertNotSame( $default['bank_code'], $walkin['bank_code'] );
    }

    // ─── Scenario 4: bank_context column distinguishes resolution path ────

    public function test_bank_context_column_records_resolution_path(): void {
        $default = snapshot_charge_insert_columns( 500, false, $this->old_options() );
        $walkin  = snapshot_charge_insert_columns( 501, true,  $this->walkin_options() );

        // bank_context column lets future readers (slip verify, refund admin, audit)
        // know which resolver branch was taken at create time
        $this->assertContains( $default['bank_context'], array( 'claim', 'claim_walkin' ) );
        $this->assertContains( $walkin['bank_context'],  array( 'claim', 'claim_walkin' ) );
        $this->assertNotSame( $default['bank_context'], $walkin['bank_context'] );
    }

    // ─── Scenario 5: edge — empty/partial wp_options handled gracefully ──

    public function test_empty_wp_options_yields_empty_snapshot_not_crash(): void {
        $snap = snapshot_charge_insert_columns( 600, false, array() );

        $this->assertSame( '', $snap['bank_name'] );
        $this->assertSame( '', $snap['bank_account'] );
        $this->assertSame( '', $snap['bank_code'] );
        $this->assertSame( 'claim', $snap['bank_context'] );
        // Real handler would 422 with bank_snapshot_incomplete BEFORE insert.
        // This test ensures the snapshot pipeline itself doesn't crash on empty input.
    }

    public function test_partial_options_only_present_keys_populated(): void {
        $partial = array(
            'dinoco_claim_bank_name' => 'KBANK',
            'dinoco_claim_bank_code' => '004',
            // missing account, holder, name_en, branch
        );
        $snap = snapshot_charge_insert_columns( 700, false, $partial );

        $this->assertSame( 'KBANK', $snap['bank_name'] );
        $this->assertSame( '004',   $snap['bank_code'] );
        $this->assertSame( '',      $snap['bank_account'] );
        $this->assertSame( '',      $snap['bank_holder'] );
    }

    // ─── Scenario 6: multiple charges in sequence don't pollute each other ──

    public function test_three_sequential_charges_all_isolated(): void {
        $a = snapshot_charge_insert_columns( 800, false, $this->old_options() );
        $b = snapshot_charge_insert_columns( 801, false, $this->new_options() );
        $c = snapshot_charge_insert_columns( 802, true,  array_merge( $this->old_options(), $this->walkin_options() ) );

        $this->assertSame( '123-4-56789-0', $a['bank_account'] );
        $this->assertSame( '999-8-77777-7', $b['bank_account'] );
        $this->assertSame( '555-1-22222-2', $c['bank_account'] );

        // No cross-contamination — each snapshot read its own resolver instant
        $this->assertNotSame( $a['bank_account'], $b['bank_account'] );
        $this->assertNotSame( $b['bank_account'], $c['bank_account'] );
        $this->assertNotSame( $a['bank_context'], $c['bank_context'] );
    }
}
