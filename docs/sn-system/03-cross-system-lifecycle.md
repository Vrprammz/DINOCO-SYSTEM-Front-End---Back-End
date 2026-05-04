# DINOCO S/N System — Cross-System Plate Lifecycle (7-path swimlane)

**Version**: 1.0 (v2.6 Cross-System Plate Lifecycle visualization)
**Phase**: Phase 0 W1 Day 3-4 deliverable

## Purpose

Plan v2.6 §2.6 ระบุ 7 critical paths แต่เป็น text — diagram visualize ให้เห็นภาพรวม integration ทุก subsystem

## Path 1: B2C First-time Activation (Standard Path)

```mermaid
sequenceDiagram
    actor Customer
    participant LIFF as Warranty LIFF
    participant API as S/N REST API
    participant DB as sn_pool
    participant Gateway as DINOCO Gateway
    participant LINE as LINE OAuth
    participant Warranty as warranty_registration CPT

    Customer->>LIFF: scan QR /warranty/activate?sn=DNCSS001234
    LIFF->>API: GET /lookup/{sn}
    API->>DB: SELECT sn_pool[sn]
    API-->>LIFF: {status: in_pool, top_set, ...}

    alt User not logged in
        LIFF->>Gateway: redirect /dinoco_login?return=...
        Gateway->>LINE: OAuth flow
        LINE-->>Gateway: id_token
        Gateway->>Customer: WP session created
        Customer->>LIFF: return to activate page
    end

    Customer->>LIFF: fill form (moto + receipt)
    LIFF->>API: POST /activate {sn, moto, ...}
    API->>DB: BEGIN TX + SELECT FOR UPDATE
    API->>DB: UPDATE sn_pool SET status=registered
    API->>Warranty: INSERT warranty_registration CPT
    API->>DB: INSERT sn_audit row
    API->>DB: COMMIT
    API->>LINE: push Flex 🎉 success
    API-->>LIFF: {warranty_id, expiry}
    LIFF-->>Customer: success page
```

## Path 2: Legacy Migration (Admin-driven proxy)

```mermaid
sequenceDiagram
    actor Customer
    actor Admin
    participant LegacyForm as Legacy Migration Form
    participant LegacyAdmin as Legacy Admin UI
    participant SN as S/N System
    participant Flash as Flash Express

    Customer->>LegacyForm: submit ฟอร์มสินค้าเก่า
    LegacyForm->>LegacyAdmin: status=Submission Received

    Admin->>LegacyAdmin: review + dup-check
    Admin->>LegacyAdmin: status=Approved

    Admin->>LegacyAdmin: "🛡 Allocate Plates"
    LegacyAdmin->>SN: POST /legacy/allocate
    SN->>SN: in_pool → reserved_for_legacy<br/>+legacy_request_id

    Admin->>LegacyAdmin: enter tracking + status=Shipped
    LegacyAdmin->>SN: POST /legacy/ship
    SN->>SN: reserved_for_legacy → shipped_legacy
    LegacyAdmin->>Flash: ship plate to customer

    alt Path A — Customer doesn't use LINE
        Admin->>LegacyAdmin: enter sent_sns
        LegacyAdmin->>SN: POST /legacy/register
        SN->>SN: shipped_legacy → registered<br/>+ create warranty_registration
    else Path B — Customer uses LINE
        Customer->>SN: scan QR plate (LIFF)
        SN->>SN: detect legacy_request_id
        SN->>SN: shipped_legacy → registered
        SN->>LegacyAdmin: auto-update case=Completed
    end
```

## Path 3: Service Center Claim (11-status FSM)

```mermaid
sequenceDiagram
    actor Customer
    actor SC as Service Center Admin
    participant ClaimSys as Claim System
    participant SCAdmin as SC Admin UI
    participant SN as S/N System
    participant LINE

    Customer->>ClaimSys: scan QR + open claim
    ClaimSys->>SN: GET /lookup/{sn}
    SN-->>ClaimSys: prefilled data
    Customer->>ClaimSys: submit problem + photos
    ClaimSys->>SN: POST /claim-sync (claim_id linked)
    SN->>SN: registered → claimed<br/>+ save prev_status

    SC->>SCAdmin: review claim
    SC->>SCAdmin: status=approved
    SCAdmin->>SN: POST /claim-sync (status=approved)

    Note over SC: Decision branches

    alt Repair completed
        SC->>SCAdmin: status=Repaired Item Dispatched
        SCAdmin->>SN: POST /claim-sync
        SN->>SN: claimed → registered (revert)
        SN->>LINE: notify customer
    else Replacement
        SC->>SCAdmin: status=Replacement Shipped
        SCAdmin->>SN: POST /legacy/allocate (new plate)
        SCAdmin->>SN: POST /claim-sync
        SN->>SN: old plate: claimed → replaced<br/>new plate: shipped_legacy → registered
        SN->>LINE: notify customer (new S/N)
    else Rejected
        SC->>SCAdmin: status=Replacement Rejected
        SCAdmin->>SN: POST /claim-sync
        SN->>SN: claimed → registered (revert)
        SN->>LINE: notify customer
    end
```

## Path 4: Member Transfer V3 (peer-to-peer)

```mermaid
sequenceDiagram
    actor OldOwner
    actor NewOwner
    participant TransferPage as Transfer Warranty Page
    participant SN
    participant LINE

    NewOwner->>TransferPage: enter S/N + new owner phone
    TransferPage->>SN: GET /lookup/{sn}
    SN-->>TransferPage: status check
    SN->>SN: validate not in claimed/voided/recalled/stolen

    TransferPage->>OldOwner: LINE push "ขอโอนสิทธิ์ — confirm?"
    OldOwner->>TransferPage: ยืนยัน

    TransferPage->>SN: POST /transfer
    SN->>SN: BEGIN TX
    SN->>SN: status=registered → transferred (~5s)
    SN->>SN: registered_user_id = new_user
    SN->>SN: status=transferred → registered
    SN->>SN: COMMIT + audit row

    SN->>LINE: notify both parties
    SN->>TransferPage: success
```

## Path 5: Manual Invoice Walk-in

```mermaid
sequenceDiagram
    actor Admin
    actor Customer
    participant ManualInv as Manual Invoice System
    participant SN
    participant InvoiceGen as Invoice Image Generator

    Admin->>ManualInv: create invoice + customer info
    Admin->>ManualInv: pick products from picker

    alt Items have sn_required=1
        ManualInv->>ManualInv: show "🛡 Allocate plate" button
        Admin->>ManualInv: pick plate from in_pool
        ManualInv->>SN: POST /manual-invoice/allocate
        SN->>SN: in_pool → ... (no immediate flip — wait ship)
    end

    Admin->>ManualInv: issue invoice
    ManualInv->>InvoiceGen: render PDF + S/N column
    InvoiceGen-->>Customer: invoice with S/N

    Note over Admin,Customer: Customer receives + activates later

    Customer->>SN: scan QR (LIFF activate, normal flow)
    SN->>SN: in_pool → registered
```

## Path 6: Anti-Fraud Block + Investigation

```mermaid
sequenceDiagram
    actor Customer
    participant LIFF
    participant Fraud as Anti-Fraud Engine
    participant SN
    actor Admin
    participant Telegram

    Customer->>LIFF: scan QR + try activate
    LIFF->>Fraud: calculate risk score
    Fraud->>Fraud: 6 factors (velocity/geo/phone/time/seq/receipt)

    alt Score < 50 (safe)
        Fraud-->>LIFF: allow + log monitor
        LIFF->>SN: POST /activate (proceed)
    else Score 50-69 (monitor)
        Fraud-->>LIFF: allow + flag for review
        LIFF->>SN: POST /activate (proceed)
        Fraud->>Telegram: notify monitoring
    else Score >= 70 (block)
        Fraud-->>LIFF: 403 + investigation queue
        Fraud->>Admin: LINE Flex alert (urgent)
        LIFF-->>Customer: "ระบบตรวจสอบ — รอ 24 ชม."
        Admin->>Fraud: investigate + verdict
        alt Mark legit
            Admin->>Fraud: confirm legit
            Fraud->>SN: allow activate retry
            SN->>LIFF: send activation link to customer
        else Confirm fraud
            Admin->>Fraud: confirm fraud
            Fraud->>SN: void plate + IP ban
            Fraud->>Telegram: alert บอส
        end
    end
```

## Path 7: Stolen Plate Report + Recovery

```mermaid
sequenceDiagram
    actor Customer
    actor Admin
    participant Dashboard as Member Dashboard
    participant SN
    participant Telegram

    Customer->>Dashboard: "🚨 รายงานเพลทหาย"
    Dashboard->>Customer: form (police report + evidence)
    Customer->>Dashboard: submit
    Dashboard->>SN: POST /stolen/report
    SN->>SN: BEGIN TX
    SN->>SN: status=registered → stolen
    SN->>SN: INSERT stolen_log
    SN->>SN: COMMIT
    SN->>Telegram: alert บอส

    Note over Admin: Later — admin verify
    Admin->>SN: review report
    Admin->>SN: POST /stolen/{id}/decision (verified)

    alt Recovery later
        Customer->>Dashboard: "พบเจอแล้ว"
        Dashboard->>SN: POST /stolen/recover
        SN->>SN: status=stolen → registered
        SN->>Telegram: notify Admin
    end

    alt Someone tries to activate stolen plate
        Customer2->>SN: scan QR (different person)
        SN->>SN: detect status=stolen
        SN-->>Customer2: 403 "ติดต่อร้าน"
        SN->>Telegram: 🚨 alert มีการพยายาม activate stolen
    end
```

## Cross-Path Dependencies

```mermaid
graph LR
    P1[Path 1<br/>B2C First-time] --> Reg[registered]
    P2[Path 2<br/>Legacy Migration] --> Reg
    P3[Path 3<br/>Service Center Claim] --> Reg
    P4[Path 4<br/>Member Transfer] --> Reg
    P5[Path 5<br/>Manual Invoice] --> Reg
    P6[Path 6<br/>Anti-Fraud] -.blocks.-> Reg
    P7[Path 7<br/>Stolen Report] --> Reg

    Reg --> Claim[claimed via P3]
    Reg --> Trans[transferred via P4]
    Reg --> Stolen[stolen via P7]

    P3 --> Replace[replaced — chain end]
    P6 --> Void[voided — fraud confirmed]
    P7 --> Stolen

    style Reg fill:#10b981,color:#fff
    style Claim fill:#ec4899,color:#fff
    style Replace fill:#9ca3af,color:#fff
    style Void fill:#6b7280,color:#fff
    style Stolen fill:#b45309,color:#fff
```

## Critical Coordination Points

ทุก path ต้องประสานกับ:

1. **Idempotency Helper V.1.0** — POST endpoints ทุกตัว
2. **Modal Helpers V.1.0** — admin confirm dialogs
3. **Flag Audit Log V.1.0** — feature flag toggles
4. **Observability V.1.0** — error capture
5. **Action Scheduler** — cron jobs (DISABLE_WP_CRON workaround)
6. **GDPR V.4.1** — data export + anonymize on delete
7. **LINE Messaging API** — Flex push + OAuth

## Race Resolution Reference (v2.8 §2.8)

ทุก path มี race scenarios — resolution ตาม v2.8:
- Race 1: 2 customers same plate → first-come-first-serve + audit
- Race 2: Activate during shipping → 60s poll + 1hr fallback
- Race 3: Same plate scan twice → PRIMARY KEY 409
- Race 4: DD-3 shared leaf concurrent allocate → per-SKU GET_LOCK
- Race 5: Approval pending + cancel → auto-cancel approval

---

**Next**: 04-open-questions.md (Q1-Q29 boss decisions)
