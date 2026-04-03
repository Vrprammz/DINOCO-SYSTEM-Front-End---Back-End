# DINOCO System Data Model

> Updated: 2026-04-04 | Covers all CPTs, ACF fields, custom tables, wp_options, user meta
> Source: Deep code review -- actual ACF field definitions from source files

---

## 1. Custom Post Types (CPTs)

### 1.1 B2C / Core CPTs (Registered by ACF/WordPress)

| CPT Slug | Label | Registered In | Purpose |
|----------|-------|---------------|---------|
| `warranty_registration` | Warranty Registration | ACF (WP Admin) | Product registration records |
| `claim_ticket` | Claim Ticket | ACF (WP Admin) | Warranty claim tickets |
| `warranty_claim` | Warranty Claim | ACF (WP Admin) | Used by LIFF AI module |
| `brand_voice` | Brand Voice | [Admin System] Brand Voice Pool | Social listening entries |
| `knowledge_base` | Knowledge Base | ACF (WP Admin) | AI KB entries |

### 1.2 B2B CPTs (Registered by ACF/Code)

| CPT Slug | Label | Registered In | Purpose |
|----------|-------|---------------|---------|
| `distributor` | Distributor | ACF (WP Admin) | Distributor/dealer profiles |
| `b2b_product` | B2B Product | ACF / B2B Snippet 6 | Product catalog with pricing tiers |
| `b2b_order` | B2B Order | ACF (WP Admin) | Orders from distributors |

### 1.3 B2F CPTs (Registered by B2F Snippet 0, DB_ID: 1160)

| CPT Slug | Label | Registered In | Purpose |
|----------|-------|---------------|---------|
| `b2f_maker` | B2F Maker | Snippet 0 | Factory/manufacturer profiles |
| `b2f_maker_product` | B2F Maker Product | Snippet 0 | Products that a maker produces |
| `b2f_order` | B2F Order | Snippet 0 | Purchase Orders to makers |
| `b2f_receiving` | B2F Receiving | Snippet 0 | Goods receiving records |
| `b2f_payment` | B2F Payment | Snippet 0 | Payment records to makers |

---

## 2. ACF Field Groups -- Complete Reference

### 2.1 `b2f_maker` Fields (Group: group_b2f_maker)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `maker_name` | text | Yes | ชื่อโรงงาน |
| `maker_contact` | text | No | ผู้ติดต่อ |
| `maker_phone` | text | No | เบอร์โทร |
| `maker_email` | email | No | อีเมล |
| `maker_address` | textarea | No | ที่อยู่ |
| `maker_line_group_id` | text | No | LINE Group ID (unique, validated by `b2f_validate_group_id()`) |
| `maker_tax_id` | text | No | เลขผู้เสียภาษี |
| `maker_bank_name` | text | No | ชื่อธนาคาร |
| `maker_bank_account` | text | No | เลขบัญชี |
| `maker_bank_holder` | text | No | ชื่อบัญชี |
| `maker_bank_code` | select | No | รหัสธนาคาร (002/004/006/011/014/025/030/069/073) |
| `maker_status` | select | No | active / inactive |
| `maker_notes` | textarea | No | หมายเหตุ |
| `maker_credit_limit` | number | No | วงเงินเครดิต (default: 0) |
| `maker_current_debt` | number | No | ค้างจ่ายปัจจุบัน (readonly, managed by Snippet 7) |
| `maker_credit_term_days` | number | No | เครดิต (วัน) (default: 30) |
| `maker_credit_hold` | true_false | No | ระงับเครดิต |
| `maker_credit_hold_reason` | select | No | auto / manual |
| `maker_currency` | select | No | THB / CNY / USD (default: THB) |
| `maker_bot_enabled` | true_false | No | เปิด/ปิด Bot (default: 1) |

### 2.2 `b2f_maker_product` Fields (Group: group_b2f_maker_product)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `mp_maker_id` | post_object (b2f_maker) | Yes | Maker ที่ผลิต |
| `mp_product_sku` | text | Yes | SKU |
| `mp_product_name` | text | No | ชื่อสินค้า |
| `mp_unit_cost` | number | Yes | ราคาทุน/หน่วย (in maker currency) |
| `mp_moq` | number | No | MOQ (default: 1) |
| `mp_lead_time_days` | number | No | Lead ผลิต (วัน) (default: 7) |
| `mp_lead_land` | number | No | Lead ส่งทางรถ (วัน) (default: 7) |
| `mp_lead_sea` | number | No | Lead ส่งทางเรือ (วัน) (default: 14) |
| `mp_last_order_date` | date_picker | No | สั่งล่าสุด |
| `mp_notes` | textarea | No | หมายเหตุ |
| `mp_shipping_land` | number | No | ค่าส่งทางรถ (THB/ชิ้น) |
| `mp_shipping_sea` | number | No | ค่าส่งทางเรือ (THB/ชิ้น) |
| `mp_status` | select | No | active / discontinued |

### 2.3 `b2f_order` Fields (Group: group_b2f_order)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `po_number` | text | No | PO Number (readonly, auto-generated) |
| `po_maker_id` | post_object (b2f_maker) | Yes | Maker |
| `po_status` | select | No | draft/submitted/confirmed/amended/rejected/delivering/received/partial_received/paid/partial_paid/completed/cancelled |
| `po_items` | **repeater** | Yes | รายการสินค้า (min: 1) |
| -- `poi_sku` | text | Yes | SKU |
| -- `poi_product_name` | text | No | ชื่อสินค้า |
| -- `poi_qty_ordered` | number | Yes | จำนวนสั่ง |
| -- `poi_unit_cost` | number | Yes | ราคาทุน/หน่วย |
| -- `poi_qty_shipped` | number | No | ส่งแล้ว |
| -- `poi_qty_received` | number | No | รับแล้ว |
| -- `poi_qty_rejected` | number | No | Reject |
| -- `poi_shipping_per_unit` | number | No | ค่าส่ง/ชิ้น (THB) |
| `po_deliveries` | **repeater** | No | ประวัติจัดส่ง |
| -- `dlv_number` | text | No | เลขรอบส่ง |
| -- `dlv_date` | text | No | วันที่แจ้งส่ง |
| -- `dlv_items` | textarea | No | รายการ JSON |
| -- `dlv_note` | textarea | No | หมายเหตุ |
| -- `dlv_is_complete` | true_false | No | ส่งครบ? |
| `po_currency` | text | No | สกุลเงิน (THB/CNY/USD) -- immutable after submitted |
| `po_exchange_rate` | number | No | อัตราแลกเปลี่ยน -> THB (snapshot ตอนสร้าง) |
| `po_shipping_method` | select | No | land / sea (required for non-THB) |
| `po_total_amount` | number | No | ยอดรวม (in maker currency, readonly) |
| `po_total_amount_thb` | number | No | ยอดรวม (THB) |
| `po_shipping_total` | number | No | ค่าส่งรวม (THB) |
| `po_grand_total_thb` | number | No | ต้นทุนรวม (THB) = total_thb + shipping_total |
| `po_item_count` | number | No | จำนวนรายการ (readonly) |
| `po_requested_date` | date_picker | No | ต้องการรับภายใน |
| `po_expected_date` | date_picker | No | วันส่ง (Maker กำหนด) |
| `po_actual_date` | date_picker | No | วันส่งจริง |
| `po_admin_note` | textarea | No | หมายเหตุ Admin |
| `po_maker_note` | textarea | No | หมายเหตุ Maker |
| `po_amendment_count` | number | No | ครั้งที่แก้ไข |
| `po_version` | number | No | Version (default: 1) |
| `po_created_by` | text | No | สร้างโดย |
| `po_paid_amount` | number | No | จ่ายแล้ว (THB) |
| `po_payment_status` | select | No | unpaid / partial / paid |
| `po_cancelled_reason` | textarea | No | เหตุผลยกเลิก |
| `po_cancelled_by` | text | No | ยกเลิกโดย |
| `po_cancelled_date` | date_picker | No | วันที่ยกเลิก |
| `po_rejected_reason` | textarea | No | เหตุผลปฏิเสธ |
| `po_parent_po_id` | number | No | Parent PO (for replacements) |
| `po_is_replacement` | true_false | No | Is Replacement PO |

### 2.4 `b2f_receiving` Fields (Group: group_b2f_receiving)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `rcv_po_id` | post_object (b2f_order) | Yes | PO ที่รับของ |
| `rcv_number` | text | No | เลขใบรับ (readonly, auto-generated) |
| `rcv_date` | date_picker | Yes | วันที่รับ |
| `rcv_items` | **repeater** | Yes | รายการรับ (min: 1) |
| -- `rcvi_sku` | text | No | SKU |
| -- `rcvi_qty_received` | number | No | จำนวนรับ |
| -- `rcvi_qty_rejected` | number | No | จำนวน Reject |
| -- `rcvi_qc_status` | select | No | passed / failed / partial |
| -- `rcvi_reject_reason` | textarea | No | เหตุผล Reject |
| -- `rcvi_reject_photos` | gallery | No | รูป Reject (max: 5) |
| `rcv_total_value` | number | No | มูลค่ารับ (THB, readonly) -- used for credit calculation |
| `rcv_admin_note` | textarea | No | หมายเหตุ |
| `rcv_inspected_by` | text | No | ผู้ตรวจรับ |
| `rcv_inspected_by_id` | number | No | User ID ผู้ตรวจ |
| `rcv_has_reject` | true_false | No | Has Reject items |
| `rcv_reject_resolved` | true_false | No | Reject resolved |
| `rcv_reject_action` | text | No | Reject action taken |
| `rcv_reject_note` | textarea | No | Reject resolution note |
| `rcv_replacement_po_id` | number | No | Replacement PO created |

### 2.5 `b2f_payment` Fields (Group: group_b2f_payment)

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `pmt_po_id` | post_object (b2f_order) | Yes | PO ที่จ่ายเงิน |
| `pmt_maker_id` | post_object (b2f_maker) | Yes | Maker ที่รับเงิน |
| `pmt_amount` | number | Yes | จำนวนเงิน (THB) |
| `pmt_date` | date_picker | Yes | วันที่จ่าย |
| `pmt_method` | select | No | transfer / cheque / cash |
| `pmt_reference` | text | No | เลขอ้างอิง |
| `pmt_slip_image` | image | No | หลักฐานการจ่าย |
| `pmt_note` | textarea | No | หมายเหตุ |
| `pmt_slip_status` | select | No | pending / verified / rejected / error |
| `pmt_slip_verify_result` | textarea | No | ผล Verify JSON |
| `pmt_slip_trans_ref` | text | No | Transaction reference |

### 2.6 `distributor` Fields (Registered via ACF Admin)

| Field Name | Type | Description |
|------------|------|-------------|
| `shop_name` | text | ชื่อร้าน |
| `owner_name` | text | ชื่อเจ้าของ |
| `owner_phone` | text | เบอร์โทร |
| `owner_line_uid` | text | LINE User ID ของเจ้าของ (used by LIFF AI auth) |
| `group_id` | text | LINE Group ID |
| `dist_address` | text | ที่อยู่ |
| `dist_district` | text | อำเภอ |
| `dist_province` | text | จังหวัด |
| `dist_postcode` | text | รหัสไปรษณีย์ |
| `current_debt` | number | หนี้ปัจจุบัน (managed by Snippet 13) |
| `credit_limit` | number | วงเงินเครดิต |
| `credit_term_days` | number | เครดิต (วัน) |
| `credit_hold` | true_false | ระงับเครดิต |
| `rank` | select | Standard / Silver / Gold / Platinum / Diamond |
| `is_walkin` | true_false | Walk-in distributor toggle |
| `recommended_skus` | text | SKUs แนะนำ (comma-separated) |

### 2.7 `b2b_product` Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `product_sku` | text | SKU |
| `product_category` | text | Category |
| `stock_status` | select | in_stock / out_of_stock |
| `oos_eta_date` | date_picker | ETA for out-of-stock |
| `oos_duration_hours` | number | OOS duration |
| `oos_timestamp` | number | Timestamp when OOS |
| `b2b_discount_percent` | number | Default discount % |
| `price_standard` | number | Standard tier price |
| `price_silver` | number | Silver tier price |
| `price_gold` | number | Gold tier price |
| `price_platinum` | number | Platinum tier price |
| `price_diamond` | number | Diamond tier price |
| `unit_of_measure` | text | Unit (ชิ้น, กล่อง, etc.) |
| `min_order_qty` | number | Minimum order quantity |
| `boxes_per_unit` | number | Boxes per unit |

### 2.8 `b2b_order` Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `order_status` | select | 14 statuses (see FSM section) |
| `source_group_id` | text | LINE Group ID of ordering distributor |
| `order_items` | repeater | Ordered items (sku, qty, price, etc.) |
| `customer_note` | textarea | Customer notes |
| `_order_source` | meta | manual_invoice / line_bot / liff_catalog |
| `_b2b_is_walkin` | meta | Walk-in order stamp (1) |
| `is_billed` | true_false | Has been billed (invoice issued) |
| `tracking_number` | text | Shipping tracking number |
| `delivery_confirmed` | true_false | Delivery confirmed |

### 2.9 `claim_ticket` Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `ticket_status` | select | 11 statuses (see Claim System) |
| `claim_type` | select | repair / parts |
| `product_info` | group | Product details |
| `claim_photos` | gallery | Evidence photos |
| `warranty_serial` | text | Warranty serial number |

### 2.10 `brand_voice` Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `bv_platform` | select | facebook / instagram / tiktok / etc. |
| `bv_post_url` | url | Original post URL |
| `bv_post_content` | textarea | Post content |
| `bv_comment_text` | textarea | Comment text |
| `bv_sentiment` | select | positive / negative / neutral / mixed |
| `bv_brand_mentioned` | text | Brand name |
| `bv_ai_analysis` | textarea | AI analysis result |

---

## 3. Custom MySQL Tables

### 3.1 `dinoco_products` (B2B Snippet 15)

Product catalog stored in custom table (separate from b2b_product CPT).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | Primary key |
| `sku` | VARCHAR | Product SKU |
| `name` | VARCHAR | Product name |
| `category` | VARCHAR | Category |
| `price` | DECIMAL | Base price |
| `image_url` | TEXT | Product image |

### 3.2 `dinoco_moto_brands` (B2B Snippet 15, DINOCO_MotoDB class)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | Primary key |
| `brand_name` | VARCHAR(100) | Brand name |
| `brand_aliases` | TEXT | Comma-separated aliases |
| `logo_url` | TEXT | Brand logo URL |
| `is_active` | TINYINT(1) | Active status |

### 3.3 `dinoco_moto_models` (B2B Snippet 15, DINOCO_MotoDB class)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | Primary key |
| `brand_id` | INT | FK to dinoco_moto_brands |
| `model_name` | VARCHAR(200) | Model name |
| `model_aliases` | TEXT | Comma-separated aliases |
| `image_url` | TEXT | Model image URL |
| `cc` | INT | Engine displacement |
| `year_start` | INT | Production start year |
| `year_end` | INT | Production end year |
| `is_active` | TINYINT(1) | Active status |

---

## 4. wp_options (Shared State)

### 4.1 B2B Settings
| Option Key | Type | Description |
|------------|------|-------------|
| `b2b_warehouse_address` | array | Warehouse name, address, phone |
| `b2b_manual_shipments_{YYYY_MM}` | array | Manual Flash shipment records (monthly) |
| `b2b_sku_relations` | array | Parent-child SKU relationships |
| `dinoco_sku_relations` | array | SKU relations for legacy migration |

### 4.2 B2F Settings
| Option Key | Type | Description |
|------------|------|-------------|
| `b2f_shipping_dest_land` | string | ที่อยู่ปลายทางทางรถ |
| `b2f_shipping_dest_sea` | string | ที่อยู่ปลายทางทางเรือ |

### 4.3 System
| Option Key | Type | Description |
|------------|------|-------------|
| `dinoco_sync_log` | array | Last sync status/timestamps |
| `dinoco_moto_brands_version` | string | Custom table schema version |

### 4.4 Transients (Cache)
| Transient Key Pattern | TTL | Description |
|-----------------------|-----|-------------|
| `b2f_maker_group_{group_id}` | 1 hour | Cached maker lookup by group_id |
| `b2f_maker_group_{group_id}_neg` | 5 min | Negative cache (group not found) |
| `dinoco_limit_{user_id}_{action}` | 2 sec | Rate limiting |
| `b2b_flash_courier_retry_{tid}` | varies | Flash retry state |

---

## 5. User Meta

| Meta Key | Description |
|----------|-------------|
| `line_user_id` | LINE User ID (from OAuth) |
| `line_picture_url` | LINE profile picture URL |
| `line_display_name` | LINE display name |
| `linked_distributor_id` | Distributor CPT post ID (for LIFF AI dealer auth) |
| `dinoco_phone` | Phone number |
| `dinoco_province` | Province |
| `pdpa_accepted` | PDPA consent timestamp |

---

## 6. Inventory-Related Fields

### ที่มีอยู่แล้วในระบบ

| Location | Field | Type | Description |
|----------|-------|------|-------------|
| `b2b_product` CPT | `stock_status` | select (in_stock / out_of_stock) | สถานะสต็อก (manual toggle) |
| `b2b_product` CPT | `oos_eta_date` | date | ETA เมื่อสินค้าหมด |
| `b2b_product` CPT | `oos_duration_hours` | number | ระยะเวลา OOS |
| `b2b_product` CPT | `oos_timestamp` | number | Timestamp เมื่อตั้ง OOS |
| MCP Bridge | `inventory-changed` | REST endpoint | Phase 3 webhook for inventory changes |
| Admin Inventory DB | `[dinoco_admin_inventory]` | shortcode | Inventory Command Center (manual) |
| B2F receiving | `rcv_items.rcvi_qty_received` | repeater | จำนวนรับเข้าคลัง (ไม่ auto-update stock) |

### สิ่งที่ยังไม่มี
- **stock_qty** (จำนวนสต็อกจริง) -- ไม่มี field นี้ในระบบ
- **Auto stock deduction** เมื่อ B2B order shipped -- ไม่มี
- **Auto stock addition** เมื่อ B2F receive-goods -- ไม่มี
- **inventory_count** -- ไม่มี field นับจำนวน

> **สรุป:** ระบบ inventory เป็น manual toggle (in_stock/out_of_stock) ไม่มี quantity tracking อัตโนมัติ

---

## 7. Relationships Diagram (Text)

```
warranty_registration (B2C)
    └── claim_ticket (1:N) -- ลูกค้าแจ้งเคลม

distributor (B2B)
    ├── b2b_order (1:N) -- via source_group_id
    │   └── b2b_order.order_items (repeater) -- สินค้าในออเดอร์
    └── current_debt -- managed by Snippet 13

b2b_product -- สินค้า B2B
    └── stock_status (in_stock / out_of_stock)

b2f_maker (B2F)
    ├── b2f_maker_product (1:N) -- via mp_maker_id
    ├── b2f_order (1:N) -- via po_maker_id
    │   ├── b2f_order.po_items (repeater) -- สินค้าใน PO
    │   ├── b2f_order.po_deliveries (repeater) -- ประวัติจัดส่ง
    │   ├── b2f_receiving (1:N) -- via rcv_po_id
    │   │   └── rcv_items (repeater) -- รายการรับ + QC
    │   └── b2f_payment (1:N) -- via pmt_po_id
    └── maker_current_debt -- managed by Snippet 7

brand_voice -- Social listening entries
knowledge_base -- AI KB articles

dinoco_moto_brands → dinoco_moto_models (1:N) -- Motorcycle catalog
```

---

## 8. B2B Order Statuses (FSM V.1.4)

| Status | Label (TH) | Next Possible |
|--------|-----------|---------------|
| draft | แบบร่าง | checking_stock, awaiting_confirm (walk-in), cancelled |
| checking_stock | ตรวจสต็อก | awaiting_confirm, backorder, cancel_requested |
| backorder | ของหมด | checking_stock, awaiting_confirm, cancelled |
| awaiting_confirm | รอยืนยันบิล | awaiting_payment, cancel_requested, change_requested |
| awaiting_payment | รอชำระ | paid, cancel_requested |
| paid | จ่ายแล้ว | packed, shipped, completed, claim_opened |
| packed | แพ็คแล้ว | shipped, cancel_requested |
| shipped | จัดส่งแล้ว | completed, claim_opened |
| cancel_requested | ขอยกเลิก | cancelled, awaiting_payment, awaiting_confirm, checking_stock |
| change_requested | ขอแก้ไข | draft, awaiting_confirm |
| claim_opened | เปิดเคลม | claim_resolved, completed, shipped |
| claim_resolved | เคลมเสร็จ | completed |
| completed | เสร็จสิ้น | cancelled (walk-in only, admin) |
| cancelled | ยกเลิก | (terminal) |

## 9. B2F Order Statuses (FSM V.1.5)

| Status | Label (TH) | Next Possible |
|--------|-----------|---------------|
| draft | แบบร่าง | submitted, cancelled |
| submitted | ส่งแล้ว | confirmed, rejected, amended, cancelled |
| confirmed | ยืนยันแล้ว | delivering, amended, cancelled |
| amended | แก้ไขแล้ว | submitted (auto-resubmit) |
| rejected | ปฏิเสธ | amended, submitted, cancelled |
| delivering | กำลังส่ง | delivering, received, partial_received, confirmed, cancelled |
| partial_received | รับบางส่วน | delivering, received, confirmed, cancelled |
| received | รับครบแล้ว | confirmed, paid, partial_paid, completed, cancelled |
| partial_paid | จ่ายบางส่วน | paid, completed, cancelled |
| paid | จ่ายแล้ว | completed, cancelled |
| completed | เสร็จสิ้น | (terminal) |
| cancelled | ยกเลิก | (terminal) |
