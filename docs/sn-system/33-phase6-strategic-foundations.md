# 33 — Phase 6 Strategic Foundations (Week 19+, ongoing)

**Status**: Boss directive 2026-05-10 = "Week 19+ ทำต่อไปเรื่อยๆ" — start scaffold for the 4 long-term initiatives + 4 deferred quick-wins.

**Why scaffold now**: Phase 1-5 deliver a complete S/N + warranty + marketplace stack. Phase 6 turns it into a **platform** — Public APIs / multi-tenant / IoT / insurance partnerships. Each LT item has 60-120h dev + significant business gates (legal + partnership + compliance). Document the architecture NOW so when business gates clear, dev can start in 1 day.

---

## LT-1 — Public Dealer Portal API (40h dev + partnership)

### Business goal
ดีลเลอร์ดูข้อมูลลูกค้าตัวเองผ่าน external API → integrate กับ POS/CRM ของดีลเลอร์เอง. คล้าย F#15 แต่ scope wider + token tier paid.

### Architecture

```
┌────────────────────┐   HTTPS HMAC      ┌─────────────────────┐
│ Dealer POS / CRM   │ ────────────────> │ /dealer-portal/v1/  │
│                    │   X-Dealer-Token  │  (NEW namespace)    │
└────────────────────┘                   └──────┬──────────────┘
                                                │
                                  ┌─────────────┼──────────────┐
                                  ▼             ▼              ▼
                            wp_dinoco_      wp_dinoco_     wp_dinoco_
                              sn_pool        warranty_     dealer_
                                              registration  contracts
```

### Endpoints (~12 read-only + 3 write)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dealer-portal/v1/me` | Dealer info from token |
| GET | `/dealer-portal/v1/customers?page=` | My customers list (registered_dealer_id = me) |
| GET | `/dealer-portal/v1/customers/{user_id}` | Customer detail (no PII outside dealer scope) |
| GET | `/dealer-portal/v1/plates?status=` | All plates I sold (sn_pool.purchase_dealer_id = me) |
| GET | `/dealer-portal/v1/plates/{sn}` | Plate detail incl. claim/transfer history |
| GET | `/dealer-portal/v1/claims?status=` | Claims initiated by my customers |
| GET | `/dealer-portal/v1/claims/{id}` | Claim detail (read-only) |
| GET | `/dealer-portal/v1/extensions?status=` | Warranty extensions purchased by my customers |
| GET | `/dealer-portal/v1/sales-summary?from=&to=` | Aggregate stats (count/revenue/avg) |
| GET | `/dealer-portal/v1/leads?status=` | Lead pipeline assigned to me |
| POST | `/dealer-portal/v1/leads/{id}/note` | Add note (push to OpenClaw) |
| POST | `/dealer-portal/v1/leads/{id}/status` | Change status (FSM) |
| POST | `/dealer-portal/v1/customers/{user_id}/contact-preference` | Update opt-in (gated by customer consent) |

### Token system
Reuse `wp_dinoco_sn_api_tokens` schema (already exists from F#15). Add scope `dealer_portal`. Permission gate `partner_type = dealer`.

### Pricing tiers (boss decision needed)
- Free tier: 100 req/day (read-only, 5 customer max)
- Standard: ฿500/mo — 10K req/day, unlimited customers, write endpoints
- Premium: ฿2,000/mo — 100K req/day + webhooks for state changes

### Development phases
- **Phase 6.1.1**: Token issuance UI (extend Tab 11 admin) — 8h
- **Phase 6.1.2**: Read-only endpoints (12) — 16h
- **Phase 6.1.3**: Write endpoints (3) — 8h
- **Phase 6.1.4**: Webhook system for state changes — 8h
- **Phase 6.1.5**: Documentation + Postman collection + sample SDKs (Python/PHP/Node) — 8h

### Business gates
- Partnership agreement template (legal)
- Pricing approval (บอส)
- 1-2 ดีลเลอร์ pilot (top 5 silver+gold)

---

## LT-2 — IoT Integration / BLE Chip (80h dev + supplier)

### Business goal
สินค้า DINOCO รุ่น premium มี BLE chip → ลูกค้าเอามือถือใกล้สินค้า → auto-pair + auto-register warranty + ภาษาคล้าย Apple AirTag UX.

### Architecture sketch

```
┌─────────────┐      BLE 5.0          ┌───────────────┐
│ Phone (LIFF)│ ─────────────────────>│ DINOCO chip   │
│             │   broadcast UUID      │ (passive,     │
│             │                       │  battery-less │
│             │                       │  UHF tag)     │
└─────┬───────┘                       └───────────────┘
      │ Read UUID + RSSI
      ▼
┌─────────────────────────────────┐
│ POST /chip/v1/register-passive  │
│ { uuid, sn, line_uid }          │
│ (auto-link sn ↔ chip_uuid 1:1)  │
└─────────────────────────────────┘
```

### Schema additions
- NEW table `wp_dinoco_chip_registry` (chip_uuid PK + sn FK + first_paired + last_seen)
- ALTER `wp_dinoco_products` add `has_ble_chip TINYINT(1) DEFAULT 0`

### Hardware partnership (gate)
- Supplier: 2 candidates ในจีน (cost ~฿15-25/chip @ 10K MOQ)
- DINOCO needs ROI: chip cost / product retail < 0.5%
- Premium SKUs only (retail > ฿5,000) → cost feasible

### Dev phases
- 6.2.1 — Schema + REST `/chip/v1/*` (16h)
- 6.2.2 — LIFF `<dnc-ble-scanner>` Web Bluetooth API wrapper (24h)
- 6.2.3 — Auto-pair flow + warranty activate hook (16h)
- 6.2.4 — Anti-fraud: chip ↔ sn binding immutable (8h)
- 6.2.5 — Lost-phone recovery flow (8h)
- 6.2.6 — Test + production rollout (8h)

### Defer signal
Until Q4 2026 minimum — Web Bluetooth iOS support still partial (Safari only via PWA). Re-evaluate after iOS 18 release.

---

## LT-3 — Multi-Tenant Architecture (120h major refactor)

### Business goal
DINOCO subsidiaries / brand partners (เช่น sub-brand ใหม่ของบริษัท) ใช้ระบบ S/N เดียวกันแต่แยก data + branding.

### Approach
**Shared schema + tenant_id column** approach (not separate DBs):

```sql
ALTER TABLE wp_dinoco_sn_pool ADD COLUMN tenant_id SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER sn;
ALTER TABLE wp_dinoco_sn_pool ADD INDEX idx_tenant_status (tenant_id, status);
-- ... repeat for ALL 15 SN tables
```

### Architecture changes
- All REST routes prefix with tenant: `/dinoco-sn/v1/{tenant_slug}/...`
- New helper `dinoco_sn_current_tenant_id()` reads from JWT claim or admin override
- Module Registry `'tenant_id' => $current` filter on every list query
- Branding tokens (logo + color) per tenant in `wp_dinoco_tenants` table

### Migration path
- Existing data → tenant_id = 1 ('dinoco' default)
- New tenants register via admin form (slug + logo + bank info + LINE token)
- Customer LIFF detects tenant from URL host or query param

### Defer signal
ไม่จำเป็นจนกว่าจะมี subsidiary จริง. Estimated 2027+. Doc as scaffold only.

---

## LT-4 — Insurance Integration / Extended Warranty Tier (60h dev + partnership)

### Business goal
Partner กับ insurance company → ขาย warranty 5 ปี + ประกันอุบัติเหตุ (มูลค่าซ่อม + ความเสียหายทรัพย์ + life insurance ผูก).

### Architecture

```
Customer LIFF /warranty/extend
    ↓ choose "Premium 5y + Insurance"
    ↓
DINOCO REST /marketplace/checkout
    ↓ partner_type = insurance
    ↓
Forward to Insurance API (e.g., Tune Protect / SCB Insurance)
    ↓ create policy + return policy_no
    ↓
DINOCO sn_warranty_extensions row + insurance_policy_no column
```

### Schema additions
- ALTER `wp_dinoco_sn_warranty_extensions` add `insurance_policy_no VARCHAR(64)` + `insurance_partner_id BIGINT`
- NEW table `wp_dinoco_insurance_partners` (id, name, api_url, api_key, premium_calc_url)

### Business gates
- Insurance partner negotiation (revenue share 40-60% to partner typical)
- Tax invoice change for insurance product (different VAT treatment in some cases)
- Customer disclosure required by Insurance Regulatory Commission (คปภ.)

### Dev phases
- 6.4.1 — Insurance partner selector UI in marketplace flow (8h)
- 6.4.2 — Partner API integration (HMAC + JWT issuance) (16h)
- 6.4.3 — Policy lookup + claim pass-through to partner (16h)
- 6.4.4 — Refund cascading (DINOCO refund → Insurance refund partner-side) (12h)
- 6.4.5 — Compliance + audit trail (8h)

### Defer signal
Q1 2027 earliest — need Phase 5 marketplace stable for ≥3 months + KPIs proven.

---

## Quick Wins (deferred from earlier phases — pickup as time permits)

### QW-2 Digital Wallet Card (Apple/Google) — 12h
Generate `.pkpass` (Apple) + Google Wallet JWT after warranty activation.
- Customer adds card to phone → shows up in lock screen
- Auto-update when warranty close to expire (push notification)
- Partnership: Apple Developer + Google Wallet Issuer accounts (already have for some payment integrations)

### QW-5 Refer-a-Friend Code — 16h
- Generate unique code at activate (`REF-<USERID>-<RANDOM>`)
- Reward both referrer + new customer when used (e.g., ฿100 coupon each)
- Track conversion in `wp_dinoco_referral_log` table
- Anti-abuse: 1 reward per phone number max

### QW-7 Smart Service Reminder — 4h (when KB ready)
- Cron monthly check sn_pool registered ≥ 1 year + no claim
- LINE Flex "ลองตรวจสภาพ + เปลี่ยนน้ำมัน?" + KB tips link
- Optional cross-sell maintenance products

### RM-3 Stolen Plate Public Lookup — 12h (after partnership)
- Public LIFF page `/stolen-check?sn=...` (rate-limited)
- Police + insurance + dealer use ตรวจก่อนรับซื้อต่อ
- Boss Q23 = "Admin เท่านั้นก่อน — Public ไว้ทีหลัง" → defer until partnership signed

---

## Cross-system continuous maintenance items

These run perpetually (Phase 6 ongoing):

### Monthly
- LINE quota review (auto-verify cron does this — review alerts only)
- Cron heartbeat audit (Health Monitor reports)
- Performance tuning: slow query log + EXPLAIN top 10
- Sentry error budget review

### Quarterly
- KPI review vs baseline + adjust thresholds
- Customer feedback synthesis (Brand Voice Pool sentiment trend)
- Feature A/B testing analysis (Phase 4 onwards has flag-gated experiments)
- Test coverage gap fill (target ≥ 95% for P0 paths)

### Bi-yearly
- Schema optimization (add/remove indexes per actual query mix)
- Index rebuild + table OPTIMIZE during low-traffic window
- Archive plates voided > 5 years (move to cold storage)

### Yearly
- Major version (v2.14, v3.0) per business needs
- Security audit (3rd party pentest recommended)
- Dependency audit + npm/composer update
- Documentation refresh

---

## Phase 6 effort summary

| Item | Dev hours | Business gate | Realistic start |
|---|---|---|---|
| LT-1 Public Dealer Portal | 40 | Pricing approval + 2 pilots | Q3 2026 |
| LT-2 IoT/BLE | 80 | Supplier MOQ + iOS support | Q4 2026 |
| LT-3 Multi-tenant | 120 | Subsidiary launch | 2027+ |
| LT-4 Insurance | 60 | Partner agreement | Q1 2027 |
| QW-2 Wallet Card | 12 | None | anytime |
| QW-5 Refer-a-friend | 16 | Marketing budget | Q3 2026 |
| QW-7 Service Reminder | 4 | KB ready | when KB done |
| RM-3 Public Stolen | 12 | Police partnership | TBD |

**Total Phase 6 if ALL adopted: ~344h ≈ 8.6 wk dev**

But realistically, items pull in based on market signal. Doc serves as **architectural scaffold** so when business gate clears, dev can start day 1.

---

_Drafted 2026-05-10 per boss directive "Week 19+ ทำต่อไปเรื่อยๆ"._
_File: docs/sn-system/33-phase6-strategic-foundations.md_
