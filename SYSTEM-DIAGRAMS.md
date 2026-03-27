# DINOCO System Diagrams -- Complete Reference

> Generated: 2026-03-27 | Based on: SYSTEM-ARCHITECTURE.md V.30.2 + actual code analysis

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [B2B Order State Machine](#2-b2b-order-state-machine)
3. [Slip Payment Flow](#3-slip-payment-flow)
4. [Shipping Flow](#4-shipping-flow)
5. [Warranty Lifecycle](#5-warranty-lifecycle)
6. [Claim Ticket Lifecycle](#6-claim-ticket-lifecycle)
7. [Invoice Lifecycle (Manual)](#7-invoice-lifecycle-manual)
8. [Bot Toggle Logic](#8-bot-toggle-logic)
9. [Authentication Flows](#9-authentication-flows)
10. [Data Flow Between Files](#10-data-flow-between-files)
11. [Cron Job Dependencies](#11-cron-job-dependencies)
12. [LINE Message Flow](#12-line-message-flow)

---

## 1. System Architecture Overview

```mermaid
flowchart TB
    subgraph Users["Users"]
        B2C["B2C Members<br/>(LINE App)"]
        B2B["B2B Distributors<br/>(LINE Group)"]
        ADMIN["Admin<br/>(WordPress)"]
    end

    subgraph LINE["LINE Platform"]
        LOGIN["LINE Login<br/>(OAuth2)"]
        BOT["LINE Messaging API<br/>(Bot / Webhook)"]
        LIFF["LINE LIFF<br/>(Web Apps)"]
    end

    subgraph WP["DINOCO WordPress"]
        subgraph B2C_SYS["B2C System"]
            GW["Gateway / Callback"]
            DASH["Member Dashboard"]
            CLAIM["Claim System"]
            XFER["Transfer Warranty"]
        end

        subgraph B2B_SYS["B2B System"]
            WH["Snippet 2: Webhook Gateway"]
            CORE["Snippet 1: Core Utilities"]
            REST["Snippet 3: LIFF REST API"]
            CRON["Snippet 7: Cron Jobs"]
            INV["Manual Invoice System"]
        end

        subgraph ADMIN_SYS["Admin System"]
            AD["Admin Dashboard"]
            AI["AI Control (Gemini)"]
            SC["Service & Claims"]
            KB["KB Trainer"]
        end

        subgraph DATA["Data Layer"]
            CPT["Custom Post Types<br/>serial_number, claim_ticket,<br/>b2b_order, distributor,<br/>b2b_product, ai_knowledge"]
            META["Post Meta + User Meta"]
            OPT["wp_options<br/>(settings, catalog)"]
        end
    end

    subgraph EXT["External Services"]
        FLASH["Flash Express API<br/>(Shipping)"]
        SLIP2GO["Slip2Go API<br/>(Slip Verification)"]
        GEMINI["Google Gemini<br/>(AI v22)"]
        RPI["Raspberry Pi<br/>(Print Server)"]
        GH["GitHub API<br/>(Code Sync)"]
    end

    B2C -->|LINE Login| LOGIN
    LOGIN -->|OAuth callback| GW
    GW --> DASH
    DASH --> CLAIM
    DASH --> XFER

    B2B -->|Text/Image/Postback| BOT
    BOT -->|Webhook POST| WH
    B2B -->|LIFF pages| LIFF
    LIFF -->|REST API| REST

    ADMIN --> AD
    ADMIN --> AI
    ADMIN --> INV

    WH --> CORE
    REST --> CORE
    CRON --> CORE
    INV --> CORE

    CORE --> FLASH
    CORE --> SLIP2GO
    AI --> GEMINI
    REST --> RPI
    AD --> GH

    B2C_SYS --> DATA
    B2B_SYS --> DATA
    ADMIN_SYS --> DATA

    style LINE fill:#06C755,color:#fff
    style EXT fill:#f97316,color:#fff
    style WP fill:#f0f9ff,color:#000
```

---

## 2. B2B Order State Machine

Every status transition with the actor/trigger that causes it.

```mermaid
stateDiagram-v2
    [*] --> draft : Customer places order<br/>(LIFF catalog / LINE text)

    draft --> checking_stock : Customer postback<br/>confirm_order
    draft --> backorder : confirm_order detects OOS<br/>(b2b_check_order_oos)
    draft --> cancelled : Customer postback<br/>cancel_draft

    checking_stock --> awaiting_confirm : Admin postback<br/>stock_confirm
    checking_stock --> backorder : Admin postback<br/>stock_oos / stock_partial
    checking_stock --> cancel_requested : Customer postback<br/>cancel_request

    backorder --> checking_stock : Admin postback<br/>bo_restock_admin
    backorder --> awaiting_confirm : Customer postback<br/>bo_accept_partial<br/>(creates sub-ticket)
    backorder --> cancelled : Customer postback<br/>bo_cancel_all

    awaiting_confirm --> awaiting_payment : Customer postback<br/>confirm_bill<br/>(adds debt + sends invoice)
    awaiting_confirm --> cancel_requested : Customer postback<br/>cancel_request
    awaiting_confirm --> change_requested : Customer postback<br/>change_request

    awaiting_payment --> paid : Slip auto-match<br/>(b2b_auto_mark_paid_after_slip)
    awaiting_payment --> paid : Slip manual match<br/>(slip_pay postback)
    awaiting_payment --> paid : Admin manual<br/>(record-payment REST)
    awaiting_payment --> cancel_requested : Customer postback<br/>cancel_request

    paid --> shipped : Admin postback<br/>pack_done (manual mode)<br/>ship_manual / ship_rider
    paid --> packed : Admin postback<br/>pack_flash<br/>(Flash Express)
    paid --> completed : Admin postback<br/>ship_self_pickup<br/>(immediate)
    paid --> claim_opened : Customer postback<br/>claim_open

    packed --> shipped : Flash courier pickup<br/>or Flash tracking update

    shipped --> completed : Customer postback<br/>delivery_ok / confirm_received
    shipped --> completed : Cron auto-complete<br/>(7 days, b2b_auto_complete_check)
    shipped --> claim_opened : Customer postback<br/>claim_open

    cancel_requested --> cancelled : Admin postback<br/>cancel_approve<br/>(reverses debt if billed)
    cancel_requested --> awaiting_payment : Admin postback<br/>cancel_reject<br/>(restores cancel_prev_status)

    change_requested --> awaiting_confirm : Admin postback<br/>change_approve
    change_requested --> awaiting_confirm : Admin postback<br/>change_reject

    claim_opened --> claim_resolved : Admin postback<br/>claim_exchange / claim_refund
    claim_opened --> completed : Admin postback<br/>claim_reject

    completed --> [*]
    cancelled --> [*]
    claim_resolved --> [*]

    note right of draft
        Advisory locks (transient)
        prevent concurrent transitions
        on every action handler
    end note

    note right of awaiting_payment
        confirm_bill triggers:
        1. Add debt to distributor
        2. Send Shipping Choice Flex to admin
        3. Schedule auto-Flash fallback (1hr)
        4. Send Invoice Flex + PNG to customer
    end note
```

---

## 3. Slip Payment Flow

```mermaid
flowchart TB
    START["Customer sends image<br/>in LINE group"] --> IMG_DL["Download image via<br/>LINE Content API"]
    IMG_DL --> SLIP2GO["Send to Slip2Go API<br/>(QR base64 + checkCondition)"]

    SLIP2GO --> CODE{Slip2Go<br/>Response Code}

    CODE -->|200501| DUP["Duplicate slip<br/>Reply: already used"]
    CODE -->|200401| WRONG_ACC["Wrong receiver account<br/>Reply: not DINOCO bank"]
    CODE -->|200402| WRONG_AMT["Amount mismatch<br/>Reply: check conditions"]
    CODE -->|200404| NOT_SLIP["Not a slip / fake<br/>Silent (no reply)"]
    CODE -->|200000 / 200200| SUCCESS["Valid slip"]

    SUCCESS --> DUP_CHECK{conditionResult<br/>isDuplicate?}
    DUP_CHECK -->|Yes| DUP
    DUP_CHECK -->|No| RECV_CHECK{isReceiverValid?}
    RECV_CHECK -->|No| WRONG_ACC
    RECV_CHECK -->|Yes / null| DEDUCT["Deduct from<br/>distributor current_debt"]

    DEDUCT --> OVERPAY{paid > old_debt?}
    OVERPAY -->|Yes| OVERPAY_ALERT["Alert admin:<br/>overpayment amount"]
    OVERPAY -->|No| CONTINUE
    OVERPAY_ALERT --> CONTINUE

    CONTINUE["Update monthly_sales_mtd<br/>Clear credit_hold if debt=0"]
    CONTINUE --> AUTO_MATCH["b2b_auto_mark_paid_after_slip()<br/>FIFO: oldest bills first<br/>Tolerance: 98% of bill amount"]

    AUTO_MATCH --> MATCHED{How many<br/>matched?}

    MATCHED -->|"1+ exact match"| PAID_FLEX["Build Slip Result Flex<br/>Show paid tickets list"]
    MATCHED -->|"Unmatched remain<br/>(amount mismatch)"| QUESTION["b2b_send_slip_match_question()<br/>Flex card with bill buttons"]

    QUESTION --> CUSTOMER_PICK{Customer picks<br/>within 30 min}
    CUSTOMER_PICK -->|"Picks bill"| SLIP_PAY["slip_pay postback<br/>Mark specific bill as paid"]
    CUSTOMER_PICK -->|"Timeout"| TIMEOUT["Must send slip again"]

    PAID_FLEX --> ZERO_CHECK{Remaining<br/>debt = 0?}
    ZERO_CHECK -->|Yes| CLEAR_ALL["Auto-mark ALL remaining<br/>awaiting_payment as paid"]
    ZERO_CHECK -->|No| ADMIN_ALERT

    CLEAR_ALL --> ADMIN_ALERT["Push payment alert<br/>to admin group"]
    SLIP_PAY --> ADMIN_ALERT

    subgraph BOT_MODES["Bot Toggle Impact"]
        BOT_ON["Bot ON: Full B2B Flex<br/>with LIFF buttons"]
        BOT_OFF["Bot OFF: Simple Flex<br/>no LIFF links"]
    end

    PAID_FLEX -.-> BOT_MODES

    style START fill:#06C755,color:#fff
    style DUP fill:#dc2626,color:#fff
    style WRONG_ACC fill:#d97706,color:#fff
    style NOT_SLIP fill:#94a3b8,color:#fff
    style SUCCESS fill:#16a34a,color:#fff
```

---

## 4. Shipping Flow

All 4 methods showing sub-steps and what status transitions occur.

```mermaid
flowchart TB
    PAID["Order status: paid"] --> SHIP_CHOICE["Admin receives<br/>Shipping Choice Flex Card"]

    SHIP_CHOICE --> FLASH["Flash Express<br/>(pack_flash postback)"]
    SHIP_CHOICE --> MANUAL["Manual Ship<br/>(ship_manual postback)"]
    SHIP_CHOICE --> RIDER["Rider/Lalamove<br/>(ship_rider postback)"]
    SHIP_CHOICE --> PICKUP["Self-Pickup<br/>(ship_self_pickup postback)"]
    SHIP_CHOICE -->|"1hr no response"| AUTO_FLASH["Auto-fallback<br/>b2b_auto_ship_flash_event"]
    AUTO_FLASH --> FLASH

    subgraph FLASH_FLOW["Flash Express Flow"]
        FLASH --> F1["b2b_flash_create_all_boxes()<br/>Calculate boxes from order items"]
        F1 --> F2["Flash API: POST /open/v3/orders<br/>Create shipment per box"]
        F2 --> F3["Status: flash_created<br/>Store _flash_tracking_numbers"]
        F3 --> F4["Queue print job<br/>Invoice + Labels + Picking List"]
        F4 --> F5["RPi polls /print-queue<br/>Prints documents"]
        F5 --> F6["Status: print_done<br/>then ready_to_ship"]
        F6 --> F7["Flash API: /open/v1/orders/notify<br/>Call courier"]
        F7 --> F8["Status: courier_called<br/>Order: packed"]
        F8 --> F9["Flash webhook updates<br/>b2b_flash_tracking_cron (2hr)"]
        F9 --> F10["Status: picked_up<br/>Order: shipped"]
        F10 --> F11["Delivery check<br/>3 days later"]
    end

    subgraph MANUAL_FLOW["Manual Ship Flow"]
        MANUAL --> M1["Status: shipped<br/>Admin enters tracking via text:<br/>เลขพัสดุ {id} {tracking} {carrier}"]
        M1 --> M2["Update tracking_number<br/>+ shipping_provider"]
        M2 --> M3["Flex card sent to customer<br/>with tracking info"]
        M3 --> M4["Delivery check<br/>3 days later"]
    end

    subgraph RIDER_FLOW["Rider Flow"]
        RIDER --> R1["Create shipment record<br/>method: rider"]
        R1 --> R2["Status: shipped<br/>tracking: Rider มารับ"]
        R2 --> R3["Flex card to customer<br/>with confirm_received button"]
        R3 --> R4["Delivery check<br/>1 day later"]
    end

    subgraph PICKUP_FLOW["Self-Pickup Flow"]
        PICKUP --> P1["Create shipment record<br/>method: self_pickup"]
        P1 --> P2["Status: completed<br/>(immediate, no delivery)"]
        P2 --> P3["Flex card to customer<br/>with shop address"]
    end

    F11 --> DELIVERY_CHECK
    M4 --> DELIVERY_CHECK
    R4 --> DELIVERY_CHECK

    DELIVERY_CHECK["b2b_delivery_check_event<br/>(WP scheduled event)"]
    DELIVERY_CHECK --> CUST_CONFIRM{Customer<br/>response}
    CUST_CONFIRM -->|delivery_ok<br/>confirm_received| COMPLETED["Status: completed"]
    CUST_CONFIRM -->|delivery_no| ISSUE["Alert admin:<br/>delivery problem"]
    CUST_CONFIRM -->|"No response 7d"| AUTO_COMPLETE["Cron: auto-complete<br/>b2b_auto_complete_check"]
    AUTO_COMPLETE --> COMPLETED

    style FLASH fill:#f59e0b,color:#000
    style MANUAL fill:#3b82f6,color:#fff
    style RIDER fill:#8b5cf6,color:#fff
    style PICKUP fill:#16a34a,color:#fff
    style COMPLETED fill:#15803d,color:#fff
```

---

## 5. Warranty Lifecycle

```mermaid
stateDiagram-v2
    [*] --> warranty_available : Product manufactured<br/>(serial_number CPT created)

    warranty_available --> warranty_on : Member registers via<br/>Dashboard + QR scan<br/>(sets owner, expiry date)

    warranty_available --> warranty_pending : Admin manual set<br/>(needs review)

    warranty_pending --> warranty_on : Admin approves
    warranty_pending --> old_warranty : Admin: legacy system

    warranty_on --> claim_process : Member submits claim<br/>(claim_ticket created)
    warranty_on --> warranty_expired : Expiry date passed<br/>(checked on display)

    claim_process --> repaired : Admin: maintenance done
    claim_process --> refurbished : Admin: refurbished
    claim_process --> modified : Admin: modified/modded
    claim_process --> void : Admin: void warranty
    claim_process --> warranty_on : Claim rejected<br/>(no issue found)

    warranty_on --> stolen : Admin: theft report
    warranty_on --> void : Admin: void

    note right of warranty_on
        Owner can transfer warranty
        via [dinoco_transfer_v3]
        Updates owner_product + transfer_logs
        owner_sequence increments
    end note

    note right of claim_process
        Creates claim_ticket CPT
        with snapshot of serial data
        Evidence images required
    end note
```

---

## 6. Claim Ticket Lifecycle

```mermaid
stateDiagram-v2
    [*] --> registered : Member submits claim<br/>(evidence + problem_type)
    state registered <<choice>>

    registered --> awaiting_shipment : Claim accepted<br/>Admin sets status

    awaiting_shipment --> in_transit : Member enters tracking<br/>(save_track AJAX action)

    in_transit --> received : Admin confirms receipt<br/>at company

    received --> under_maintenance : Technician starts repair

    under_maintenance --> maintenance_completed : Repair finished

    maintenance_completed --> dispatched : Ship repaired item back<br/>(tracking_outbound set)

    dispatched --> [*] : Member confirms receipt<br/>(confirm_receipt AJAX)

    state "Alternative Paths" as alt {
        received --> pending_verification : Issue unclear<br/>(needs more inspection)
        pending_verification --> replacement_approved : Approve replacement
        pending_verification --> rejected : Company rejects claim
        replacement_approved --> replacement_shipped : Ship replacement
        replacement_shipped --> [*]
        rejected --> [*]
    }

    note left of registered
        Status labels (English):
        Registered in System
        Awaiting Customer Shipment
        In Transit to Company
        Received at Company
        Under Maintenance
        Maintenance Completed
        Repaired Item Dispatched
        Pending Issue Verification
        Replacement Approved
        Replacement Shipped
        Replacement Rejected by Company
    end note
```

---

## 7. Invoice Lifecycle (Manual)

Manual Invoice System (`[Admin System] DINOCO Manual Invoice System`) operates independently from B2B orders but uses the same `b2b_order` CPT with `_order_source = manual_invoice`.

```mermaid
stateDiagram-v2
    [*] --> draft : Admin creates invoice<br/>/invoice/init + /invoice/create<br/>Generates INV-DNC-XXXXX

    draft --> draft : Admin edits<br/>/invoice/update<br/>(add items, change dist)

    draft --> awaiting_payment : Admin issues<br/>/invoice/issue<br/>Adds debt to distributor<br/>Sends LINE Flex + Invoice PNG

    draft --> cancelled : Admin cancels<br/>/invoice/cancel

    draft --> deleted : Admin deletes<br/>/invoice/delete<br/>(only draft/cancelled)

    awaiting_payment --> paid : Full payment recorded<br/>/invoice/record-payment<br/>(paid_amount >= total)

    awaiting_payment --> awaiting_payment : Partial payment<br/>/invoice/record-payment<br/>(paid_amount < total)

    awaiting_payment --> paid : Slip verified via dashboard<br/>/invoice/verify-slip<br/>(auto calls record-payment)

    awaiting_payment --> paid : Slip sent in LINE group<br/>b2b_handle_slip_image<br/>(auto-match or slip_pay)

    awaiting_payment --> cancelled : Admin cancels<br/>/invoice/cancel<br/>(reverses debt)

    awaiting_payment --> awaiting_payment : Dunning reminder<br/>Cron: 3 days before due

    awaiting_payment --> awaiting_payment : Overdue notice<br/>Cron: 1 day + 7 days past due

    paid --> [*]
    cancelled --> deleted : Admin deletes<br/>/invoice/delete

    cancelled --> [*]
    deleted --> [*]

    note right of awaiting_payment
        Dunning escalation tiers:
        - 3 days before due: reminder
        - 1 day overdue: warning
        - 7+ days overdue: escalated alert
        Each tier sends once (dedup via meta)
    end note

    note left of draft
        Invoice number format:
        INV-DNC-XXXXX (random 5-digit)
        Non-sequential to hide volume
    end note
```

---

## 8. Bot Toggle Logic

```mermaid
flowchart TB
    EVENT["LINE Event Received<br/>(Webhook)"] --> GROUP_CHECK{Is registered<br/>distributor group?}

    GROUP_CHECK -->|"No (unregistered)"| UNREG_BLOCK["Block ALL except<br/>ขอไอดีกลุ่ม / groupid"]
    GROUP_CHECK -->|"Admin group"| ADMIN_PASS["Pass all events<br/>(no bot check)"]
    GROUP_CHECK -->|"Registered group"| BOT_CHECK{bot_enabled<br/>field value?}

    BOT_CHECK -->|"'1' (ON)"| BOT_ON
    BOT_CHECK -->|"'0' (OFF)"| BOT_OFF

    subgraph BOT_ON["Bot ON -- Full B2B Mode"]
        ON_TEXT["Text commands: ALL work<br/>สั่งของ, เช็คสถานะ, เช็คหนี้,<br/>ยอดขาย, คำสั่ง, etc."]
        ON_IMAGE["Images: Full B2B Slip Flex<br/>with LIFF buttons"]
        ON_POSTBACK["Postbacks: ALL actions<br/>confirm, cancel, pack, ship, etc."]
        ON_CRON["Cron notifications: Sent<br/>dunning, summary, alerts"]
    end

    subgraph BOT_OFF["Bot OFF -- Manual Invoice Mode"]
        OFF_TEXT["Text: BLOCKED<br/>(except ขอไอดีกลุ่ม)"]
        OFF_IMAGE["Images: Simple Slip Flex<br/>(no LIFF links)"]
        OFF_POSTBACK["Postbacks: BLOCKED<br/>(except slip_pay)"]
        OFF_CRON["Cron notifications: NOT sent<br/>(checks bot_enabled first)"]
    end

    subgraph ALWAYS["Always Works (Both Modes)"]
        ALW_INV["Invoice Dashboard<br/>(web, not LINE)"]
        ALW_SLIP["Slip verification<br/>(always processes images)"]
        ALW_DEBT["Debt tracking<br/>(always updates)"]
    end

    style BOT_ON fill:#dcfce7,color:#000
    style BOT_OFF fill:#fef2f2,color:#000
    style ALWAYS fill:#f0f9ff,color:#000
```

---

## 9. Authentication Flows

### 9a. LINE Login (B2C Members)

```mermaid
sequenceDiagram
    participant U as Member (LINE App)
    participant L as LINE Platform
    participant WP as WordPress (Callback)
    participant DB as Database

    U->>L: Click LINE Login button<br/>(dinoco_login_button shortcode)
    L->>L: User authorizes<br/>(scope: profile + openid)
    L->>WP: Redirect to /callback-login<br/>?code=xxx&state=yyy

    Note over WP: Phase 1: Render loading UI<br/>(instant, no delay)

    WP->>WP: AJAX fetch with ?dinoco_process=1
    WP->>L: POST /oauth2/v2.1/token<br/>(exchange code for access_token)
    L-->>WP: access_token + id_token

    WP->>L: GET /v2/profile<br/>(Bearer token)
    L-->>WP: userId, displayName, pictureUrl

    WP->>DB: Search user by line_user_id meta
    alt New User
        WP->>DB: wp_create_user<br/>(line_{id}_{timestamp})
        WP->>DB: Set line_user_id meta
    end
    WP->>DB: Update line_picture_url
    WP->>WP: wp_set_auth_cookie()

    alt state = serial code
        WP-->>U: Redirect to /member-dashboard/<br/>?register_serial={serial}
    else state = GENERAL_LOGIN
        WP-->>U: Redirect to /member-dashboard/
    end
```

### 9b. LIFF Authentication (B2B)

```mermaid
sequenceDiagram
    participant D as Distributor
    participant LIFF as LIFF SDK
    participant WP as WordPress REST API
    participant DB as Database

    D->>LIFF: Open LIFF link<br/>(from Flex card button)
    LIFF->>LIFF: liff.init({liffId})
    LIFF->>LIFF: liff.getProfile()

    Note over LIFF: URL contains HMAC-signed params:<br/>group_id, timestamp, signature

    LIFF->>WP: POST /b2b/v1/auth-group<br/>{group_id, user_id, signature}
    WP->>WP: Verify HMAC signature<br/>Check timestamp expiry (1 hour)
    WP->>DB: Verify group_id matches distributor
    WP->>WP: Generate session token<br/>(random_bytes(32), 1hr TTL)
    WP-->>LIFF: {session_token, dist_info}

    LIFF->>WP: Subsequent requests<br/>Authorization: Bearer {session_token}
    WP->>WP: Validate session token from transient
```

### 9c. Admin & Print Auth

```mermaid
flowchart LR
    subgraph ADMIN_AUTH["Admin Authentication"]
        A1["WordPress Login<br/>(wp-login.php)"] --> A2["manage_options<br/>capability check"]
        A2 --> A3["X-WP-Nonce header<br/>wp_rest nonce"]
    end

    subgraph PRINT_AUTH["RPi Print Auth"]
        P1["API Key in header<br/>X-Print-API-Key"] --> P2["Compare with<br/>b2b_print_api_key option"]
        P2 --> P3["Endpoints: /print-queue<br/>/print-ack, /print-heartbeat"]
    end

    subgraph WEBHOOK_AUTH["Webhook Auth"]
        W1["LINE: x-line-signature<br/>HMAC-SHA256 body"] --> W2["Flash: signature<br/>verification"]
        W2 --> W3["GitHub: X-Hub-Signature-256<br/>HMAC-SHA256"]
    end

    style ADMIN_AUTH fill:#e0e7ff,color:#000
    style PRINT_AUTH fill:#fef3c7,color:#000
    style WEBHOOK_AUTH fill:#fce7f3,color:#000
```

---

## 10. Data Flow Between Files

How the 34 code files communicate through WordPress hooks, REST, and shared data.

```mermaid
flowchart TB
    subgraph ENTRY["Entry Points"]
        WEBHOOK["/wp-json/b2b/v1/webhook<br/>(Snippet 2)"]
        LIFF_REST["/wp-json/b2b/v1/*<br/>(Snippet 3: 36+ endpoints)"]
        INV_REST["/wp-json/dinoco/v1/invoice/*<br/>(Manual Invoice)"]
        SHORTCODES["Shortcodes<br/>(12+ member/admin pages)"]
    end

    subgraph CORE_LIB["Snippet 1: Core Utilities"]
        LINE_API["LINE Push/Reply API"]
        FLEX_BUILD["Flex Card Builders<br/>(50+ functions)"]
        FLASH_API["Flash Express API Client"]
        DEBT_CALC["b2b_recalculate_debt()"]
        DIST_LOOKUP["b2b_get_dist_by_group()"]
        SHIP_HELPERS["Shipment helpers<br/>b2b_create_shipment()"]
    end

    subgraph DATA_STORE["Shared Data (MySQL)"]
        B2B_ORDER["b2b_order CPT<br/>+ ACF fields + _meta"]
        DISTRIBUTOR["distributor CPT<br/>(debt, rank, credit)"]
        PRODUCTS["b2b_product CPT<br/>(stock, prices)"]
        SERIALS["serial_number CPT<br/>(warranty)"]
        CLAIMS["claim_ticket CPT"]
    end

    subgraph OUTPUT["Output Channels"]
        LINE_MSG["LINE Messages<br/>(Push/Reply)"]
        PRINT_Q["Print Queue<br/>(RPi polls)"]
        INVOICE_IMG["Invoice PNG<br/>(GD-generated)"]
    end

    WEBHOOK --> CORE_LIB
    LIFF_REST --> CORE_LIB
    INV_REST --> CORE_LIB
    SHORTCODES --> DATA_STORE

    CORE_LIB --> DATA_STORE
    CORE_LIB --> OUTPUT

    WEBHOOK -->|"Slip processing"| DEBT_CALC
    WEBHOOK -->|"Order actions"| B2B_ORDER
    LIFF_REST -->|"CRUD operations"| B2B_ORDER
    INV_REST -->|"Invoice lifecycle"| B2B_ORDER

    B2B_ORDER -.->|"source_group_id"| DISTRIBUTOR
    B2B_ORDER -.->|"order_items SKUs"| PRODUCTS
    SERIALS -.->|"owner_product"| CLAIMS

    LINE_API --> LINE_MSG
    FLEX_BUILD --> LINE_MSG
    FLASH_API -->|"Tracking"| B2B_ORDER

    style CORE_LIB fill:#dbeafe,color:#000
    style DATA_STORE fill:#f0fdf4,color:#000
    style OUTPUT fill:#fef3c7,color:#000
```

---

## 11. Cron Job Dependencies

```mermaid
flowchart TB
    subgraph DAILY["Daily Jobs"]
        D1["06:00 b2b_oos_expiry_check<br/>Clear expired OOS markers<br/>on b2b_product"]
        D2["09:00 b2b_dunning_cron_event<br/>Payment reminders (3-day)<br/>+ Overdue notices (1d/7d)<br/>+ Credit hold escalation"]
        D3["10:00 b2b_bo_overdue_check<br/>Backorder overdue alerts"]
        D4["11:00 b2b_auto_complete_check<br/>Auto-complete shipped orders<br/>older than 7 days"]
        D5["15:00 b2b_shipping_overdue_cron<br/>Shipping delay alerts<br/>for paid-but-not-shipped"]
        D6["17:30 b2b_daily_summary_cron<br/>Revenue summary to admin<br/>+ Slip queue cleanup"]
    end

    subgraph WEEKLY["Weekly Jobs"]
        W1["Sunday 17:30<br/>b2b_weekly_report_event<br/>Weekly summary report"]
    end

    subgraph MONTHLY["Monthly Jobs"]
        M1["1st of month<br/>b2b_rank_update_event<br/>Recalculate distributor ranks<br/>based on monthly_sales_mtd"]
    end

    subgraph FREQUENT["Frequent Jobs"]
        F1["Every 1 min<br/>b2b_flex_retry_cron<br/>Retry failed Flex pushes<br/>(from _pending_flex meta)"]
        F2["Every 5 min<br/>b2b_rpi_heartbeat_check<br/>RPi printer status check"]
        F3["Every 2 hrs<br/>b2b_flash_tracking_cron<br/>Sync Flash tracking status<br/>for all active shipments"]
    end

    subgraph ON_DEMAND["On-Demand (Scheduled per event)"]
        E1["b2b_auto_ship_flash_event<br/>1hr after bill confirm<br/>Auto-fallback to Flash"]
        E2["b2b_delivery_check_event<br/>1-3 days after ship<br/>Ask customer for confirmation"]
        E3["b2b_flash_courier_retry<br/>Retry failed Flash<br/>courier call (notify)"]
    end

    D1 -->|"Restocks products"| D3
    D2 -->|"Dunning affects"| DISTRIBUTOR_DEBT["distributor.current_debt<br/>distributor.credit_hold"]
    D4 -->|"Completes orders"| ORDER_STATUS["b2b_order.order_status"]
    M1 -->|"Updates rank"| RANK["distributor.rank_system<br/>Affects pricing"]

    F1 -->|"Retries"| LINE_PUSH["LINE Push API"]
    F3 -->|"Updates"| FLASH_STATUS["_flash_pno_statuses<br/>_flash_tracking_events"]

    E1 -->|"Creates Flash shipment"| FLASH_API["Flash Express API"]
    E2 -->|"Sends Flex"| LINE_PUSH

    %% Webhook as cron trigger
    WH_TRIGGER["LINE Webhook events<br/>trigger spawn_cron()"] -.->|"Ensures WP cron fires"| DAILY
    WH_TRIGGER -.-> FREQUENT

    style DAILY fill:#dbeafe,color:#000
    style FREQUENT fill:#fef3c7,color:#000
    style ON_DEMAND fill:#fce7f3,color:#000
```

---

## 12. LINE Message Flow

From webhook event to customer-facing Flex card.

```mermaid
sequenceDiagram
    participant C as Customer<br/>(LINE Group)
    participant LP as LINE Platform
    participant WH as Snippet 2:<br/>Webhook Gateway
    participant CORE as Snippet 1:<br/>Core Utilities
    participant DB as WordPress DB
    participant ADMIN as Admin<br/>(LINE Group)

    Note over LP,WH: HMAC-SHA256 signature verification

    C->>LP: Send text/image/postback
    LP->>WH: POST /wp-json/b2b/v1/webhook<br/>{events: [...]}

    WH->>WH: Dedup check (transient)<br/>message_id or postback hash
    WH->>DB: Check group registration<br/>(distributor.line_group_id)
    WH->>DB: Check bot_enabled<br/>(direct postmeta query)

    alt Text Message
        WH->>WH: b2b_route_bot_command()<br/>Strip @mention, normalize
        WH->>DB: Process command<br/>(query orders, debt, etc.)
        WH->>CORE: Build Flex card<br/>(b2b_build_flex_*)
        CORE-->>LP: Reply via reply_token<br/>(b2b_line_reply_raw)
        LP-->>C: Flex card displayed
    end

    alt Image (Slip)
        WH->>LP: Download image binary<br/>(LINE Content API)
        WH->>WH: Slip2Go verification<br/>(base64 + checkCondition)
        WH->>DB: Update distributor debt
        WH->>DB: Auto-match orders (FIFO)
        WH->>CORE: Build Slip Result Flex
        CORE-->>LP: Reply to customer group
        LP-->>C: Payment confirmation Flex
        WH->>CORE: Build Admin Alert Flex
        CORE-->>LP: Push to admin group
        LP-->>ADMIN: Payment admin alert
    end

    alt Postback Action
        WH->>WH: b2b_handle_postback()<br/>Parse action + ticket_id
        WH->>WH: Security check:<br/>admin-only vs customer-only
        WH->>WH: Advisory lock (transient)
        WH->>DB: Status transition<br/>(b2b_set_order_status)

        alt Customer action (e.g. confirm_bill)
            WH->>CORE: Build customer Flex
            CORE-->>LP: Push to customer group<br/>(b2b_push_guaranteed)
            WH->>CORE: Build admin Flex
            CORE-->>LP: Push to admin group
        end

        alt Admin action (e.g. stock_confirm)
            WH-->>LP: Reply to admin<br/>(confirmation)
            WH->>CORE: Build customer Flex
            CORE-->>LP: Push to customer group<br/>(b2b_push_guaranteed)
        end
    end

    Note over CORE,LP: b2b_push_guaranteed:<br/>If push fails, stores in _pending_flex<br/>Cron retries every 1 minute
```

---

## Appendix: Status Color Legend

| System | Status | Color | Hex |
|--------|--------|-------|-----|
| B2B Order | draft | Gray | `#475569` |
| B2B Order | checking_stock | Gray | `#475569` |
| B2B Order | awaiting_confirm | Blue | `#2563eb` |
| B2B Order | awaiting_payment | Orange | `#ea580c` |
| B2B Order | paid | Green | `#16a34a` |
| B2B Order | packed | Purple | `#7b1fa2` |
| B2B Order | shipped | Blue | `#2563eb` |
| B2B Order | completed | Green | `#15803d` |
| B2B Order | backorder | Amber | `#d97706` |
| B2B Order | cancel_requested | Red | `#dc2626` |
| B2B Order | cancelled | Red | `#dc2626` |
| B2B Order | change_requested | Blue | `#2563eb` |
| B2B Order | claim_opened | Orange | `#ea580c` |
| B2B Order | claim_resolved | Green | `#16a34a` |
| Flash | flash_created | -- | `#475569` |
| Flash | print_queued | -- | `#475569` |
| Flash | ready_to_ship | -- | `#16a34a` |
| Flash | courier_called | -- | `#f59e0b` |
| Flash | picked_up | -- | `#f59e0b` |
