# DINOCO System Diagrams

> Updated: 2026-04-04 | Based on deep code review
> Mermaid format -- render with any Mermaid-compatible viewer

---

## 1. Overall System Architecture

```mermaid
graph TB
    subgraph "End Users"
        M[Member B2C]
        D[Distributor B2B]
        MK[Maker B2F]
        DL[Dealer LIFF AI]
    end

    subgraph "LINE Platform"
        LM[LINE Messaging API]
        LIFF[LIFF Apps]
        LO[LINE Login OAuth]
    end

    subgraph "WordPress dinoco.in.th"
        WH[Webhook Gateway<br>B2B Snippet 2]
        REST[REST API Layer<br>B2B/B2F/LIFF-AI/MCP]
        SC[Shortcode Pages<br>Dashboard/Admin/LIFF]
        CRON[WP Cron Jobs<br>B2B 11 + B2F 7 + System 5]
        DB[(MySQL<br>wp_posts + wp_postmeta<br>+ custom tables)]
    end

    subgraph "External Services"
        FLASH[Flash Express API]
        SLIP[Slip2Go API]
        GEM[Google Gemini API]
        CL[Claude API]
    end

    subgraph "OpenClaw Mini CRM"
        AGENT[Node.js Agent<br>proxy/index.js]
        MONGO[(MongoDB Atlas)]
        TOOLS[8 Function Tools<br>dinoco-tools.js]
    end

    subgraph "Infrastructure"
        GH[GitHub<br>Webhook Sync]
    end

    M -->|LINE Login| LO --> SC
    M -->|Web browser| SC
    D -->|LINE Group| LM --> WH
    D -->|LIFF| LIFF --> REST
    MK -->|LINE Group| LM --> WH
    MK -->|LIFF| LIFF --> REST
    DL -->|LIFF| LIFF --> REST

    WH --> DB
    REST --> DB
    SC --> DB
    CRON --> DB

    WH -->|Push Flex| LM
    REST -->|Push Flex| LM
    CRON -->|Push Flex| LM

    REST -->|Create shipment| FLASH
    REST -->|Verify slip| SLIP
    SC -->|AI response| GEM
    SC -->|AI response| CL

    AGENT -->|MCP Bridge| REST
    AGENT --> MONGO
    AGENT --> TOOLS
    TOOLS -->|REST calls| REST

    GH -->|Webhook| REST
```

---

## 2. B2B Order Flow

```mermaid
stateDiagram-v2
    [*] --> draft : ลูกค้าสั่งของ (LIFF/Bot)

    draft --> checking_stock : ลูกค้ายืนยัน
    draft --> awaiting_confirm : Walk-in (skip stock)
    draft --> cancelled : ลูกค้ายกเลิก

    checking_stock --> awaiting_confirm : Admin ยืนยันสต็อก
    checking_stock --> backorder : สินค้าหมด
    checking_stock --> cancel_requested : ลูกค้าขอยกเลิก

    backorder --> checking_stock : สินค้ากลับมา
    backorder --> awaiting_confirm : ลูกค้ารับ partial
    backorder --> cancelled : ลูกค้ายกเลิก BO

    awaiting_confirm --> awaiting_payment : ลูกค้ายืนยันบิล
    awaiting_confirm --> cancel_requested : ลูกค้าขอยกเลิก
    awaiting_confirm --> change_requested : ลูกค้าขอแก้ไข

    awaiting_payment --> paid : Slip verified / Manual
    awaiting_payment --> cancel_requested : ลูกค้าขอยกเลิก

    paid --> packed : Flash Express
    paid --> shipped : Manual ship
    paid --> completed : Walk-in auto-complete
    paid --> claim_opened : ลูกค้าเปิดเคลม

    packed --> shipped : Courier pickup

    shipped --> completed : ลูกค้ายืนยันรับ / Auto 7d
    shipped --> claim_opened : ลูกค้าเปิดเคลม

    cancel_requested --> cancelled : Admin approve
    cancel_requested --> awaiting_payment : Admin reject

    change_requested --> draft : Admin approve
    change_requested --> awaiting_confirm : Admin reject

    claim_opened --> claim_resolved : Admin resolve
    claim_opened --> completed : Admin reject claim

    claim_resolved --> completed : Auto-complete

    completed --> cancelled : Walk-in admin cancel

    cancelled --> [*]
    completed --> [*]
```

---

## 3. B2F PO Flow

```mermaid
stateDiagram-v2
    [*] --> draft : Admin สร้าง PO

    draft --> submitted : Admin ส่ง PO
    draft --> cancelled : Admin ยกเลิก

    submitted --> confirmed : Maker ยืนยัน + ETA
    submitted --> rejected : Maker ปฏิเสธ
    submitted --> amended : Admin แก้ไข
    submitted --> cancelled : Admin ยกเลิก

    confirmed --> delivering : Maker แจ้งส่งของ
    confirmed --> amended : Admin แก้ไข
    confirmed --> cancelled : Admin ยกเลิก

    amended --> submitted : Auto-resubmit

    rejected --> amended : Admin แก้ไขส่งใหม่
    rejected --> submitted : Admin ส่งใหม่
    rejected --> cancelled : Admin ยกเลิก

    delivering --> delivering : Maker ส่งเพิ่ม
    delivering --> received : Admin ตรวจรับครบ
    delivering --> partial_received : Admin รับบางส่วน
    delivering --> confirmed : Admin reject lot
    delivering --> cancelled : Admin ยกเลิก

    partial_received --> delivering : Maker ส่งเพิ่ม
    partial_received --> received : Admin รับครบ
    partial_received --> cancelled : Admin ยกเลิก

    received --> paid : Admin จ่ายครบ
    received --> partial_paid : Admin จ่ายบางส่วน
    received --> completed : Admin ปิด PO (ของฟรี)
    received --> confirmed : Admin QC reject reship
    received --> cancelled : Admin ยกเลิก

    partial_paid --> paid : Admin จ่ายครบ
    partial_paid --> completed : Admin ปิด PO

    paid --> completed : Auto-complete

    cancelled --> [*]
    completed --> [*]
```

---

## 4. Payment Flow (B2B + B2F)

```mermaid
graph TB
    subgraph "B2B Payment (Distributor -> DINOCO)"
        D1[ตัวแทนโอนเงิน]
        D2[ส่งรูปสลิปในกลุ่ม LINE]
        D3[Bot download รูป]
        D4{Slip2Go Verify}
        D5[Match ยอด ±2%]
        D6[b2b_debt_subtract]
        D7[Status: paid]
        D8[ส่ง Flex ใบเสร็จ]
        D9[แจ้ง Admin]
        DF[สลิปไม่ผ่าน → แจ้งลูกค้า]

        D1 --> D2 --> D3 --> D4
        D4 -->|ผ่าน| D5 --> D6 --> D7 --> D8 --> D9
        D4 -->|ไม่ผ่าน| DF
    end

    subgraph "B2F Payment (DINOCO -> Maker)"
        F1[Admin กดบันทึกจ่ายเงิน]
        F2[กรอกจำนวน + วิธี + สลิป]
        F3{สกุลเงิน?}
        F4[Slip2Go Verify]
        F5[Admin Approved ข้ามverify]
        F6[b2f_payable_subtract]
        F7[สร้าง b2f_payment record]
        F8[อัพเดท po_paid_amount]
        F9{จ่ายครบ?}
        F10[paid → completed]
        F11[partial_paid]

        F1 --> F2 --> F3
        F3 -->|THB| F4 --> F6
        F3 -->|CNY/USD| F5 --> F6
        F6 --> F7 --> F8 --> F9
        F9 -->|ครบ| F10
        F9 -->|ไม่ครบ| F11
    end
```

---

## 5. LINE Bot Routing

```mermaid
graph TB
    LINE[LINE Webhook POST<br>/b2b/v1/webhook]
    PARSE[Parse Event<br>B2B Snippet 2]

    PARSE -->|Check group_id| ROUTE{Group Routing}

    ROUTE -->|match distributor.group_id| B2B_HANDLER[B2B Handler<br>Snippet 2]
    ROUTE -->|match b2f_maker.maker_line_group_id| B2F_HANDLER[B2F Handler<br>Snippet 3]
    ROUTE -->|match B2B_ADMIN_GROUP_ID| ADMIN_HANDLER[Admin Handler<br>Snippet 2 + 3]
    ROUTE -->|DM 1:1| DM_HANDLER[DM Handler<br>Snippet 2]

    B2B_HANDLER --> B2B_CMD{Command?}
    B2B_CMD -->|@mention / text| B2B_FLEX[Customer Flex Menu]
    B2B_CMD -->|postback| B2B_ACTION[Order Actions]
    B2B_CMD -->|image| B2B_SLIP[Slip Verify]

    B2F_HANDLER --> B2F_CMD{Command?}
    B2F_CMD -->|@mention / text| B2F_FLEX[Maker Flex Menu<br>ENG if non-THB]
    B2F_CMD -->|ส่งของ/Deliver| B2F_DELIVER[LIFF Deliver]
    B2F_CMD -->|image| B2F_SLIP[Slip Match PO]

    ADMIN_HANDLER --> ADMIN_CMD{Command?}
    ADMIN_CMD -->|@mention| ADMIN_FLEX[Carousel 3 หน้า<br>B2B + B2F + Utilities]
    ADMIN_CMD -->|B2B keywords| B2B_ADMIN[B2B Admin Actions]
    ADMIN_CMD -->|B2F keywords| B2F_ADMIN[B2F Admin Actions]

    style ROUTE fill:#f9f,stroke:#333
    style B2F_FLEX fill:#bbf,stroke:#333
```

---

## 6. Authentication Flows

```mermaid
sequenceDiagram
    participant U as User
    participant LINE as LINE Platform
    participant WP as WordPress
    participant JWT as JWT System

    Note over U,JWT: === B2C LINE Login ===
    U->>LINE: Click "Login with LINE"
    LINE->>WP: Redirect with code
    WP->>LINE: Exchange code for token
    LINE-->>WP: Access token + profile
    WP->>WP: Create/link WP user
    WP-->>U: WordPress session cookie

    Note over U,JWT: === B2B LIFF Auth ===
    U->>WP: Open LIFF URL (?_sig=X&_ts=X)
    WP->>WP: Verify HMAC signature
    U->>WP: POST /b2b/v1/auth-group
    WP->>JWT: DINOCO_JWT::encode({group_id, role})
    JWT-->>U: JWT token
    U->>WP: API calls with X-B2B-Token header
    WP->>JWT: DINOCO_JWT::verify(token)

    Note over U,JWT: === B2F Admin LIFF Auth ===
    U->>LINE: liff.getIDToken()
    U->>WP: POST /b2f/v1/auth-admin<br>(HMAC sig + LINE ID Token)
    WP->>LINE: Verify ID Token
    WP->>WP: Check WP admin user
    WP->>JWT: Issue JWT session token
    JWT-->>U: JWT token
    U->>WP: API calls with X-B2F-Token header

    Note over U,JWT: === LIFF AI Auth ===
    U->>LINE: liff.getIDToken()
    U->>WP: POST /liff-ai/v1/auth<br>(LINE ID Token only)
    WP->>LINE: Verify ID Token
    WP->>WP: Find distributor by owner_line_uid
    WP->>JWT: Issue JWT
    JWT-->>U: JWT token
    U->>WP: API calls with X-LIFF-AI-Token header

    Note over U,JWT: === MCP Bridge Auth ===
    U->>WP: POST /dinoco-mcp/v1/*<br>(Authorization: Bearer SECRET)
    WP->>WP: Verify shared secret
```

---

## 7. Data Flow (Inventory-Related)

```mermaid
graph LR
    subgraph "B2F (สั่งซื้อจากโรงงาน)"
        PO[สร้าง PO] --> MAKER_DELIVER[Maker ส่งของ]
        MAKER_DELIVER --> RECEIVE[Admin ตรวจรับ<br>b2f_receiving]
        RECEIVE --> CREDIT[เพิ่มหนี้<br>b2f_payable_add]
    end

    subgraph "Inventory (Manual)"
        STOCK_TOGGLE[Admin toggle<br>stock_status<br>in_stock / out_of_stock]
        INV_DB[Inventory DB<br>dinoco_admin_inventory]
    end

    subgraph "B2B (ขายให้ตัวแทน)"
        ORDER[ตัวแทนสั่งของ] --> CHECK[Admin เช็คสต็อก]
        CHECK --> CONFIRM[ยืนยัน → จัดส่ง]
        CONFIRM --> SHIP[Flash/Manual ship]
    end

    RECEIVE -.->|ไม่ auto-update| STOCK_TOGGLE
    SHIP -.->|ไม่ auto-deduct| STOCK_TOGGLE

    style STOCK_TOGGLE fill:#ffa,stroke:#333
    style RECEIVE fill:#afa,stroke:#333
    style SHIP fill:#faa,stroke:#333
```

**Note:** เส้นประ (-.->)  หมายถึง connection ที่ยังไม่ได้ implement. ระบบ inventory ปัจจุบันเป็น manual toggle ไม่มี auto stock quantity tracking.

---

## 8. B2F Multi-Currency Flow

```mermaid
graph TB
    MAKER[Maker Profile<br>maker_currency: THB/CNY/USD]
    CREATE[สร้าง PO]
    SNAPSHOT[Snapshot:<br>po_currency + po_exchange_rate<br>immutable after submitted]

    CREATE --> SNAPSHOT

    SNAPSHOT --> THB{สกุลเงิน?}

    THB -->|THB| THB_FLOW[ปกติ<br>rate=1, ไม่ต้องเลือก shipping]
    THB -->|CNY/USD| FX_FLOW[Foreign Flow]

    FX_FLOW --> SHIP[เลือก shipping method<br>land/sea -- บังคับ]
    FX_FLOW --> RATE[กรอก exchange rate<br>CNY: 2-10, USD: 25-50]
    FX_FLOW --> ENG[ENG labels ทุกที่<br>Maker-facing Flex/LIFF]

    SHIP --> CALC[Calculate:<br>total_thb = total * rate<br>shipping = qty * ship_per_unit<br>grand_thb = total_thb + shipping]

    RATE --> CALC

    CALC --> RECEIVE_FLOW[Receive Goods:<br>rcv_total_value = qty * cost * rate<br>เป็น THB เสมอ]

    RECEIVE_FLOW --> PAY_FLOW[Payment:<br>THB เสมอ<br>non-THB: ข้าม slip verify]

    style FX_FLOW fill:#bbf,stroke:#333
    style ENG fill:#fbf,stroke:#333
```

---

## 9. Debt/Credit System

```mermaid
graph TB
    subgraph "B2B Debt (ตัวแทนเป็นหนี้ DINOCO)"
        B2B_ADD[b2b_debt_add<br>เมื่อ confirm_bill / issue invoice]
        B2B_SUB[b2b_debt_subtract<br>เมื่อ payment verified]
        B2B_RECALC[b2b_recalculate_debt<br>Single SQL source of truth]
        B2B_DIST[(distributor.current_debt)]

        B2B_ADD -->|+amount| B2B_DIST
        B2B_SUB -->|-amount| B2B_DIST
        B2B_RECALC -->|verify| B2B_DIST
    end

    subgraph "B2F Credit (DINOCO เป็นหนี้ Maker)"
        B2F_ADD[b2f_payable_add<br>เมื่อ receive-goods เท่านั้น]
        B2F_SUB[b2f_payable_subtract<br>เมื่อ record-payment]
        B2F_RECALC[b2f_recalculate_payable<br>Single SQL source of truth]
        B2F_MAKER[(maker.maker_current_debt)]
        B2F_HOLD{debt > credit_limit?}

        B2F_ADD -->|+rcv_total_value| B2F_MAKER
        B2F_SUB -->|-amount| B2F_MAKER
        B2F_RECALC -->|verify| B2F_MAKER
        B2F_MAKER --> B2F_HOLD
        B2F_HOLD -->|Yes| AUTO_HOLD[Auto hold<br>reason=auto]
        B2F_HOLD -->|No + was auto| AUTO_UNHOLD[Auto unhold]
    end

    subgraph "Atomic Operations"
        LOCK[MySQL FOR UPDATE lock<br>ป้องกัน race condition]
        TX[MySQL Transaction<br>BEGIN → UPDATE → COMMIT]

        B2B_ADD --> LOCK
        B2B_SUB --> LOCK
        B2F_ADD --> LOCK
        B2F_SUB --> LOCK
        LOCK --> TX
    end

    style LOCK fill:#faa,stroke:#333
    style TX fill:#faa,stroke:#333
```

---

## 10. GitHub Sync Flow

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant GH as GitHub
    participant WP as WordPress
    participant DB as wp_snippets table

    DEV->>GH: git push origin main
    GH->>WP: POST /dinoco/v1/github-sync<br>(HMAC signature)
    WP->>WP: Verify HMAC signature
    WP->>GH: GET changed files (GitHub API)

    loop For each changed file
        WP->>WP: Extract DB_ID from header
        alt DB_ID found
            WP->>DB: Match by wp_snippets.id = DB_ID
        else No DB_ID
            WP->>DB: Match by normalized filename
        end
        WP->>WP: Compare code hash
        alt Hash different
            WP->>DB: UPDATE wp_snippets SET code = new_code
        else Hash same
            WP->>WP: Skip (no change)
        end
    end

    WP-->>GH: 200 OK + sync results
    Note over DEV,DB: bump version ถ้า hash ตรงแต่โค้ดต่าง
```
