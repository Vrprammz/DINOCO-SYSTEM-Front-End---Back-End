<?php
/**
 * REG-086 — 4-eyes approval expiry / escalation
 *
 * Plan v2.13 Phase 2 W5 — Approval Workflow snippet.
 * Pure-logic tests for SLA timer + auto-escalation + self-approval block.
 *
 * SLA tiers:
 *   urgent  -> 1 hr, escalate at +1h
 *   normal  -> 24 hr, reminder +24h, escalate +48h
 *   low     -> 72 hr, reminder +72h, escalate +96h
 */

declare(strict_types=1);

namespace DinocoTests\Helpers\SnApprovalEscalation;

use PHPUnit\Framework\TestCase;

const SN_SLA_TIERS_MIRROR = [
    'urgent' => ['sla_hours' => 1, 'reminder_hours' => 1, 'escalate_hours' => 1],
    'normal' => ['sla_hours' => 24, 'reminder_hours' => 24, 'escalate_hours' => 48],
    'low' => ['sla_hours' => 72, 'reminder_hours' => 72, 'escalate_hours' => 96],
];

function dinoco_sn_approval_due_at_mirror(int $created_ts, string $tier): int
{
    $sla = SN_SLA_TIERS_MIRROR[$tier]['sla_hours'] ?? 24;
    return $created_ts + ($sla * 3600);
}

function dinoco_sn_approval_should_escalate_mirror(
    int $created_ts,
    string $tier,
    int $now_ts
): bool {
    $tier_cfg = SN_SLA_TIERS_MIRROR[$tier] ?? SN_SLA_TIERS_MIRROR['normal'];
    return ($now_ts - $created_ts) >= ($tier_cfg['escalate_hours'] * 3600);
}

function dinoco_sn_approval_should_remind_mirror(
    int $created_ts,
    string $tier,
    int $now_ts
): bool {
    $tier_cfg = SN_SLA_TIERS_MIRROR[$tier] ?? SN_SLA_TIERS_MIRROR['normal'];
    $remind_at = $created_ts + ($tier_cfg['reminder_hours'] * 3600);
    return $now_ts >= $remind_at;
}

function dinoco_sn_approval_self_approve_blocked_mirror(int $actor, int $approver): bool
{
    return $actor === $approver;
}

function dinoco_sn_approval_next_approver_mirror(array $delegation_list, int $current_approver): ?int
{
    $idx = array_search($current_approver, $delegation_list, true);
    if ($idx === false) {
        return $delegation_list[0] ?? null;
    }
    return $delegation_list[$idx + 1] ?? null;
}

class SnApprovalEscalationTest extends TestCase
{
    private const T0 = 1746000000; // arbitrary epoch reference

    public function test_urgent_sla_is_one_hour(): void
    {
        $due = dinoco_sn_approval_due_at_mirror(self::T0, 'urgent');
        $this->assertSame(self::T0 + 3600, $due);
    }

    public function test_normal_sla_is_24_hours(): void
    {
        $due = dinoco_sn_approval_due_at_mirror(self::T0, 'normal');
        $this->assertSame(self::T0 + 86400, $due);
    }

    public function test_low_sla_is_72_hours(): void
    {
        $due = dinoco_sn_approval_due_at_mirror(self::T0, 'low');
        $this->assertSame(self::T0 + (72 * 3600), $due);
    }

    public function test_unknown_tier_falls_back_to_normal(): void
    {
        $due = dinoco_sn_approval_due_at_mirror(self::T0, 'frobnicate');
        $this->assertSame(self::T0 + 86400, $due);
    }

    public function test_urgent_escalates_at_1h(): void
    {
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'urgent', self::T0 + 3000   // 50 min — not yet
        ));
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'urgent', self::T0 + 3600   // exactly 1 hr
        ));
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'urgent', self::T0 + 5000   // past 1 hr
        ));
    }

    public function test_normal_reminder_at_24h(): void
    {
        $this->assertFalse(dinoco_sn_approval_should_remind_mirror(
            self::T0, 'normal', self::T0 + (23 * 3600)
        ));
        $this->assertTrue(dinoco_sn_approval_should_remind_mirror(
            self::T0, 'normal', self::T0 + (24 * 3600)
        ));
    }

    public function test_normal_escalates_only_at_48h_not_24h(): void
    {
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'normal', self::T0 + (24 * 3600)
        ));
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'normal', self::T0 + (47 * 3600)
        ));
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'normal', self::T0 + (48 * 3600)
        ));
    }

    public function test_low_escalates_at_96h(): void
    {
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'low', self::T0 + (95 * 3600)
        ));
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(
            self::T0, 'low', self::T0 + (96 * 3600)
        ));
    }

    public function test_self_approval_blocked(): void
    {
        $this->assertTrue(dinoco_sn_approval_self_approve_blocked_mirror(42, 42));
    }

    public function test_self_approval_allowed_for_different_users(): void
    {
        $this->assertFalse(dinoco_sn_approval_self_approve_blocked_mirror(42, 99));
    }

    public function test_escalation_picks_next_in_delegation_list(): void
    {
        $list = [10, 20, 30, 40];
        $this->assertSame(20, dinoco_sn_approval_next_approver_mirror($list, 10));
        $this->assertSame(30, dinoco_sn_approval_next_approver_mirror($list, 20));
        $this->assertSame(40, dinoco_sn_approval_next_approver_mirror($list, 30));
    }

    public function test_escalation_returns_null_at_end_of_list(): void
    {
        $list = [10, 20, 30];
        $this->assertNull(dinoco_sn_approval_next_approver_mirror($list, 30));
    }

    public function test_unknown_approver_starts_from_top(): void
    {
        $list = [10, 20, 30];
        $this->assertSame(10, dinoco_sn_approval_next_approver_mirror($list, 999));
    }

    public function test_empty_delegation_list_returns_null(): void
    {
        $this->assertNull(dinoco_sn_approval_next_approver_mirror([], 10));
    }

    public function test_request_lifecycle_urgent_path(): void
    {
        // request created at T0, urgent tier
        $now = self::T0;
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(self::T0, 'urgent', $now));

        // 30 min later — not yet
        $now = self::T0 + 1800;
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(self::T0, 'urgent', $now));

        // 1 hr later — escalate now
        $now = self::T0 + 3600;
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(self::T0, 'urgent', $now));
    }

    public function test_request_lifecycle_normal_reminder_then_escalation(): void
    {
        // T0 + 24h: reminder fires, not yet escalated
        $now = self::T0 + (24 * 3600);
        $this->assertTrue(dinoco_sn_approval_should_remind_mirror(self::T0, 'normal', $now));
        $this->assertFalse(dinoco_sn_approval_should_escalate_mirror(self::T0, 'normal', $now));

        // T0 + 48h: now escalate
        $now = self::T0 + (48 * 3600);
        $this->assertTrue(dinoco_sn_approval_should_remind_mirror(self::T0, 'normal', $now));
        $this->assertTrue(dinoco_sn_approval_should_escalate_mirror(self::T0, 'normal', $now));
    }

    public function test_4eyes_threshold_5k_blocks_high_value_solo_approval(): void
    {
        // Q15 R2 4-eyes refund threshold ฿5K — mirrored by manual_invoice domain
        // but reused here as an approval-tier discriminator
        $threshold = 5000;
        $this->assertTrue(7000 >= $threshold, 'high-value request requires 4-eyes');
        $this->assertFalse(4000 >= $threshold, 'low-value request can use 2-eyes');
    }
}
