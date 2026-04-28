-- =============================================================================
-- Seed: Test Distributors (1 per rank + walk-in + beta-flag)
-- =============================================================================
--
-- Creates 7 distributor users for integration tests:
--   ID 9001 — standard rank
--   ID 9002 — silver rank
--   ID 9003 — gold rank
--   ID 9004 — platinum rank
--   ID 9005 — diamond rank
--   ID 9006 — walk-in (skip stock check, auto-complete)
--   ID 9007 — beta-flag enabled (b2b_flag_bo_beta_distributors)
--
-- IDs 9000-9999 reserved for test fixtures (production users < 1000).
-- Idempotent: REPLACE INTO so repeated seeding is safe.
-- =============================================================================

REPLACE INTO `{PREFIX}users` (`ID`, `user_login`, `user_pass`, `user_nicename`, `user_email`, `user_registered`, `display_name`)
VALUES
    (9001, 'test_dist_standard', '$P$test', 'test-dist-standard', 'standard@test.dinoco', '2026-04-01 00:00:00', 'Test Standard'),
    (9002, 'test_dist_silver',   '$P$test', 'test-dist-silver',   'silver@test.dinoco',   '2026-04-01 00:00:00', 'Test Silver'),
    (9003, 'test_dist_gold',     '$P$test', 'test-dist-gold',     'gold@test.dinoco',     '2026-04-01 00:00:00', 'Test Gold'),
    (9004, 'test_dist_platinum', '$P$test', 'test-dist-platinum', 'platinum@test.dinoco', '2026-04-01 00:00:00', 'Test Platinum'),
    (9005, 'test_dist_diamond',  '$P$test', 'test-dist-diamond',  'diamond@test.dinoco',  '2026-04-01 00:00:00', 'Test Diamond'),
    (9006, 'test_dist_walkin',   '$P$test', 'test-dist-walkin',   'walkin@test.dinoco',   '2026-04-01 00:00:00', 'Test Walk-in'),
    (9007, 'test_dist_beta',     '$P$test', 'test-dist-beta',     'beta@test.dinoco',     '2026-04-01 00:00:00', 'Test BO Beta');

-- Distributor rank metadata
REPLACE INTO `{PREFIX}usermeta` (`user_id`, `meta_key`, `meta_value`)
VALUES
    (9001, 'b2b_rank', 'standard'),
    (9002, 'b2b_rank', 'silver'),
    (9003, 'b2b_rank', 'gold'),
    (9004, 'b2b_rank', 'platinum'),
    (9005, 'b2b_rank', 'diamond'),
    (9006, 'b2b_rank', 'standard'),
    (9006, 'is_walkin', '1'),
    (9007, 'b2b_rank', 'silver');

-- Credit limits (by tier — matches FEATURE-SPEC-B2B-BACKORDER-2026-04-16.md sec 4.6)
REPLACE INTO `{PREFIX}usermeta` (`user_id`, `meta_key`, `meta_value`)
VALUES
    (9001, 'b2b_credit_limit', '50000'),
    (9002, 'b2b_credit_limit', '100000'),
    (9003, 'b2b_credit_limit', '200000'),
    (9004, 'b2b_credit_limit', '500000'),
    (9005, 'b2b_credit_limit', '0'),
    (9006, 'b2b_credit_limit', '0'),
    (9007, 'b2b_credit_limit', '100000');

-- Beta flags — test which BO system pre-rollout (used by Snippet 16 V.1.6 canary)
REPLACE INTO `{PREFIX}options` (`option_name`, `option_value`, `autoload`)
VALUES ('b2b_flag_bo_beta_distributors', 'a:1:{i:0;i:9007;}', 'no');
