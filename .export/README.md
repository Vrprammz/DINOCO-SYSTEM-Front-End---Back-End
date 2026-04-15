# .export/ — Baseline Snapshots

สร้างโดย `[Admin System] Product Catalog Export Tool` V.1.0 (snippet ใหม่, DB_ID auto-assigned)

## วิธีใช้ (หลัง sync snippet เข้า WP prod)

### 1. เช็ค health + ดึง secret key
```bash
# ต้อง login admin ก่อน (cookie) — ปุ่มเดียวกับ wp-admin
curl -sS "https://akesa.ch/wp-json/dinoco-export/v1/health" \
  --cookie "wordpress_logged_in_xxx=..." | jq
# response: secret_preview + products_in_table + b2f_maker_products_live
```

หรือ define ใน `wp-config.php`:
```php
define('DINOCO_EXPORT_KEY', '<32-hex-string>');
```

### 2. Export 4 ไฟล์ baseline
```bash
KEY="<paste_secret>"
DATE=$(date +%Y%m%d)

# 1) Full JSON
curl -sS "https://akesa.ch/wp-json/dinoco-export/v1/catalog?format=json&key=${KEY}" \
  > ".export/product-catalog-${DATE}.json"

# 2) Flat CSV
curl -sS "https://akesa.ch/wp-json/dinoco-export/v1/catalog?format=csv&key=${KEY}" \
  > ".export/product-catalog-${DATE}.csv"

# 3) Hierarchy tree
curl -sS "https://akesa.ch/wp-json/dinoco-export/v1/catalog?format=tree&key=${KEY}" \
  > ".export/hierarchy-tree-${DATE}.txt"

# 4) B2F maker products
curl -sS "https://akesa.ch/wp-json/dinoco-export/v1/makers?format=csv&key=${KEY}" \
  > ".export/b2f-maker-registrations-${DATE}.csv"
```

### 3. Commit baseline
```bash
git add .export/*.json .export/*.csv .export/*.txt
git commit -m "data: Product Catalog baseline snapshot (pre-architecture rework)"
```

## Schema (catalog JSON)

```
{
  snapshot_at: ISO-8601 UTC,
  total_products: int,       // rows in wp_dinoco_products
  total_relations: int,      // parent SKUs in dinoco_sku_relations
  products: [{
    sku, name, category, image_url,
    base_price,               // THB retail
    price_silver_pct,         // % discount (not THB amount!)
    price_gold_pct,
    price_platinum_pct,
    price_diamond_pct,
    b2b_discount_percent,     // Standard tier fallback
    stock_qty, stock_status,
    oos_timestamp, oos_duration_hours, oos_eta_date,
    boxes_per_unit, units_per_box, min_order_qty,
    is_active, b2b_visible,
    ui_role_override,         // V.42.14 hybrid (auto|set|child|grandchild|single)
    compatible_models,        // parsed to array
    children,                 // direct child SKUs (from dinoco_sku_relations)
    parents,                  // all parent SKUs (DD-3 aware)
    is_set, is_leaf, shared_child,
    last_dip_stock_qty
  }],
  sku_relations: {            // raw option dump
    PARENT_SKU: [child1, child2, ...],
    ...
  }
}
```

## Schema (makers CSV/JSON)

columns: `mp_post_id, maker_id, maker_name, maker_currency, maker_group_id, sku, mp_unit_cost, mp_moq, mp_lead_time_days, mp_shipping_land, mp_shipping_sea, mp_status, post_status, post_date, post_modified`

## Security

- auth = admin cookie **หรือ** `?key=<secret>`
- rate limit 20 req/hour/IP
- cost data (`mp_unit_cost`) = confidential → **ห้ามแชร์ไฟล์ CSV ออกนอก team**
- rotate key: `GET /health?rotate=1` (admin only)
