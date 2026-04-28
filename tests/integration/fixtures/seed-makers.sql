-- =============================================================================
-- Seed: Test Makers (1 per currency: THB / CNY / USD)
-- =============================================================================
--
-- Creates 3 maker users + matching CPT posts for B2F tests:
--   ID 9101 — THB maker (no exchange rate needed)
--   ID 9102 — CNY maker (rate 4.85 THB/CNY)
--   ID 9103 — USD maker (rate 35.0 THB/USD)
--
-- B2F multi-currency: po_currency snapshot from maker_currency at PO creation,
-- po_exchange_rate immutable after `submitted` state.
-- =============================================================================

REPLACE INTO `{PREFIX}users` (`ID`, `user_login`, `user_pass`, `user_nicename`, `user_email`, `user_registered`, `display_name`)
VALUES
    (9101, 'test_maker_thb', '$P$test', 'test-maker-thb', 'thb@test.dinoco', '2026-04-01 00:00:00', 'Test THB Maker'),
    (9102, 'test_maker_cny', '$P$test', 'test-maker-cny', 'cny@test.dinoco', '2026-04-01 00:00:00', 'Test CNY Maker'),
    (9103, 'test_maker_usd', '$P$test', 'test-maker-usd', 'usd@test.dinoco', '2026-04-01 00:00:00', 'Test USD Maker');

-- Maker post records (b2f_maker CPT)
REPLACE INTO `{PREFIX}posts` (`ID`, `post_author`, `post_date`, `post_content`, `post_title`, `post_status`, `post_type`)
VALUES
    (9201, 9101, '2026-04-01 00:00:00', '', 'Test Maker THB',          'publish', 'b2f_maker'),
    (9202, 9102, '2026-04-01 00:00:00', '', 'Test Maker CNY (China)',  'publish', 'b2f_maker'),
    (9203, 9103, '2026-04-01 00:00:00', '', 'Test Maker USD (Vietnam)', 'publish', 'b2f_maker');

-- Maker metadata
REPLACE INTO `{PREFIX}postmeta` (`post_id`, `meta_key`, `meta_value`)
VALUES
    (9201, 'maker_currency',      'THB'),
    (9201, 'maker_exchange_rate', '1.00'),
    (9201, 'maker_group_id',      'C9201testTHB000000000000000000000'),
    (9202, 'maker_currency',      'CNY'),
    (9202, 'maker_exchange_rate', '4.85'),
    (9202, 'maker_group_id',      'C9202testCNY000000000000000000000'),
    (9203, 'maker_currency',      'USD'),
    (9203, 'maker_exchange_rate', '35.00'),
    (9203, 'maker_group_id',      'C9203testUSD000000000000000000000');

-- Junction rows: each maker registers 1 sample SKU (SET-A from products fixture)
REPLACE INTO `{PREFIX}dinoco_product_makers`
    (`product_sku`, `maker_id`, `unit_cost`, `moq`, `lead_time_days`, `status`, `production_mode`, `confirmation_status`, `admin_display_mode`)
VALUES
    ('SET-A',       9201, 4500.00, 5, 7,  'active', 'set_assembled', 'confirmed', 'auto'),
    ('LEAF-X',      9202, 200.00,  10, 14, 'active', 'single',        'confirmed', 'auto'),
    ('LEAF-Y',      9203, 150.00,  10, 14, 'active', 'single',        'confirmed', 'auto');
