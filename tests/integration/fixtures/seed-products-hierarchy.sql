-- =============================================================================
-- Seed: Product Hierarchy (DD-3 + DD-4 exercise fixture)
-- =============================================================================
--
-- Topology:
--
--   SET-A (parent)
--     ├── CHILD-A1
--     │     ├── LEAF-X         (unique to CHILD-A1)
--     │     └── LEAF-SHARED    (DD-3 — also under CHILD-A2)
--     └── CHILD-A2
--           ├── LEAF-Y         (unique to CHILD-A2)
--           └── LEAF-SHARED    (DD-3 — same leaf as above)
--
--   STANDALONE-S — leaf with no parents (single-only test cases)
--
-- Stock seed:
--   LEAF-X       = 10
--   LEAF-Y       = 15
--   LEAF-SHARED  = 4   ← MIN bottleneck for SET-A rollup
--   STANDALONE-S = 100
--
-- DD-3 invariant test (HierarchyDD3SharedChildTest):
--   SET-A available qty = MIN(LEAF-X, LEAF-SHARED, LEAF-Y, LEAF-SHARED)
--                       = MIN(10, 4, 15, 4)
--                       = 4   (LEAF-SHARED counted ONCE despite appearing twice)
--
-- Stock subtract from LEAF-SHARED must propagate up through both CHILD-A1 +
-- CHILD-A2 paths, but the leaf itself decrements only ONCE per call.
--
-- Pricing (b2b_compute_dealer_price test data):
--   base 1000, b2b_discount_percent=10, price_silver=15, price_gold=20,
--   price_platinum=25, price_diamond=30 (all as % discount, V.32.6+ schema).
-- =============================================================================

REPLACE INTO `{PREFIX}dinoco_products`
    (`sku`, `name`, `category`, `base_price`, `b2b_discount_percent`,
     `price_silver`, `price_gold`, `price_platinum`, `price_diamond`,
     `boxes_per_unit`, `units_per_box`, `min_order_qty`,
     `is_active`, `b2b_visible`, `stock_qty`, `low_stock_threshold`, `reorder_point`)
VALUES
    ('SET-A',        'Test SET A',           'test', 5000.00, 0,  10, 15, 20, 25, 1,  1,  1, 1, 1,  0, 1, 1),
    ('CHILD-A1',     'Test Child A1',        'test', 2500.00, 0,   8, 12, 16, 20, 1,  1,  1, 1, 1,  0, 1, 1),
    ('CHILD-A2',     'Test Child A2',        'test', 2500.00, 0,   8, 12, 16, 20, 1,  1,  1, 1, 1,  0, 1, 1),
    ('LEAF-X',       'Test Leaf X (unique)', 'test', 1500.00, 10, 15, 20, 25, 30, 1,  1,  1, 1, 1, 10, 5, 2),
    ('LEAF-Y',       'Test Leaf Y (unique)', 'test', 1000.00, 10, 15, 20, 25, 30, 1,  1,  1, 1, 1, 15, 5, 2),
    ('LEAF-SHARED',  'Test Leaf Shared DD3', 'test',  500.00, 10, 15, 20, 25, 30, 1,  1,  1, 1, 1,  4, 5, 2),
    ('STANDALONE-S', 'Test Standalone',      'test',  300.00, 5,   8, 12, 16, 20, 1,  1,  1, 1, 1, 100, 5, 2),
    -- Box-calc fixtures (units_per_box / boxes_per_unit edge cases)
    ('BAG-6L-X20',   'Test 6L Bag (20/box)', 'test',   50.00, 0,   0,  0,  0,  0, 1, 20,  1, 1, 1, 200, 50, 20),
    ('BULKY-2BOX',   'Test Bulky (2 boxes)', 'test', 2000.00, 0,   0,  0,  0,  0, 2,  1,  1, 1, 1,  10,  3, 1);

-- SKU hierarchy relations (matches dinoco_sku_relations wp_options structure)
-- Format: parent_sku → [child1, child2, ...]
-- Stored as PHP-serialized array so b2b/b2f code can read it.
REPLACE INTO `{PREFIX}options` (`option_name`, `option_value`, `autoload`)
VALUES (
    'dinoco_sku_relations',
    'a:3:{s:5:"SET-A";a:2:{i:0;s:8:"CHILD-A1";i:1;s:8:"CHILD-A2";}s:8:"CHILD-A1";a:2:{i:0;s:6:"LEAF-X";i:1;s:11:"LEAF-SHARED";}s:8:"CHILD-A2";a:2:{i:0;s:6:"LEAF-Y";i:1;s:11:"LEAF-SHARED";}}',
    'no'
);

-- Default warehouse (required for warehouse_stock seeding)
REPLACE INTO `{PREFIX}dinoco_warehouses` (`id`, `name`, `code`, `address`, `is_default`, `is_active`, `created_at`)
VALUES (1, 'Test Main Warehouse', 'TEST_MAIN', '', 1, 1, '2026-04-01 00:00:00');

-- Warehouse stock mirror (Phase 5 multi-warehouse)
REPLACE INTO `{PREFIX}dinoco_warehouse_stock` (`warehouse_id`, `sku`, `stock_qty`)
VALUES
    (1, 'LEAF-X',       10),
    (1, 'LEAF-Y',       15),
    (1, 'LEAF-SHARED',   4),
    (1, 'STANDALONE-S', 100),
    (1, 'BAG-6L-X20',   200),
    (1, 'BULKY-2BOX',    10);
