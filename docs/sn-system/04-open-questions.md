# DINOCO S/N System — Open Questions for Boss Decision

**Version**: 1.0
**Phase**: Phase 0 W1 deliverable — รวม Q ทั้งหมดจาก v2.0-v2.13 ที่รอบอสตอบ

## 🚨 BLOCKER Questions (ต้องตอบก่อน start dev)

ขอบอสตอบ 12 ข้อนี้ก่อน — ไม่ตอบ = ทีม dev ติด

### Architecture Decisions

#### Q1: S/N Format ที่ใช้ส่งโรงงาน = A
- (A) `DNCSS0000001` (PREFIX + 7-digit) — ตามที่บอสยกตัวอย่าง — **recommended**
- (B) `DNCSS-2505-00001` (PREFIX-YYMM-5digit) — มี date traceability
- (C) Custom format อื่น

#### Q2: ใครติดเพลทกับสินค้า (B2F plate origin) = B
- (A) **โรงงานจีนติดให้ก่อนส่ง** — ส่งเพลทไปจีน + โรงงานติด + ส่งกลับ
- (B) **DINOCO warehouse ติดเอง** — โรงงานส่งสินค้าเปล่า + คลังติดเองตอนแพ็ค — **recommended (consistent กับ v2.2)**

#### Q3: First-time registration flow (Gateway) = B
- (A) Deprecate `[dinoco_gateway]` form — บังคับ scan QR เท่านั้น
- (B) **Unified Gateway** — primary scan QR + secondary type S/N + tertiary no-plate — **recommended**
- (C) Auto-detect ตาม SKU (มี plate → required scan)

#### Q4: Schema split table (sn_pool 23 cols) = A
- (A) **Split 2 tables** (hot path 12 + cold meta 7) — **recommended** (50% query speedup)
- (B) Stay wide (1 table 23 cols)

### Business Decisions

#### Q5: Phase 1 scope
- (A) **3 wk minimal** (schema + batch + receive + LIFF activate + auto-fill claim) — **recommended**
- (B) 5 wk full (รวม Gateway + Manual Invoice + MCP)

#### Q6: F#8 Extension Marketplace placement
- (A) **Phase 5 (4 wk separate, post-launch)** — payment gateway legal review parallel — **recommended**
- (B) Phase 4 (squeeze เข้าไป — risk over-pack)

#### Q7: Payment gateway (Phase 5)
- (A) PromptPay only (existing infrastructure)
- (B) **PromptPay + LINE Pay + SCB Card + Manual transfer** — **recommended (4 methods)**
- (C) Add manual review only (no automation)

#### Q8: Extension pricing model (F#8)
- (A) **% ของ retail** (1y=10%, 2y=18%, 3y=25%) — **recommended**
- (B) Flat fee (e.g., 1y=฿1,500, 2y=฿2,500)
- (C) Tiered by SKU category

#### Q9: VAT handling
- (A) **VAT included** in displayed price — **recommended**
- (B) VAT excluded + add at checkout
- (C) VAT-exempt (need legal review)

### Operational Decisions

#### Q10: Receipt OCR vendor
- (A) **Slip2Go reuse** (existing for B2B + B2F slip verify) — **recommended**
- (B) Google Vision API (new integration)
- (C) Manual review only (no OCR)

#### Q11: LINE quota tier
- (A) Stay free tier (500 push/month — limit features)
- (B) **Premium tier ฿1,500/mo** — unlimited push (need for F#1+F#4+F#10) — **recommended**
- (C) Decide later based on actual volume

#### Q12: Fraud audit baseline
ขอ baseline จาก Service Center 12 เดือนย้อนหลัง:
- กี่ % ของ claims rejected เพราะ "ไม่ใช่ของแท้" / "ลงทะเบียนซ้ำ"?
- มูลค่า fraud loss / เดือน?
→ ตอบมาเพื่อคำนวณ ROI ของ F#12 (Anti-Fraud) + F#15 (Public API)

---

## 🟡 IMPORTANT Questions (ขออันนึงก่อน Phase 1 W2)

### Q13: HMAC URL signing — promote ไป Phase 1?
ปกติ deferred ไป Phase 2 (security #3) แต่ถ้า fraud baseline ROI > ฿100K/ปี ควร promote
- (A) Promote Phase 1 (+20h) — **recommended ถ้า fraud > ฿100K/ปี**
- (B) Keep Phase 2

### Q14: 4-eyes approval scope
- (A) ทุก swap/void ต้อง 4-eyes (overkill, slow)
- (B) **3-tier (auto/single-admin/4-eyes ตาม risk)** — **recommended (v2.7 §2.7)**
- (C) Boss only (centralized)

### Q15: Approver delegation list
ขอชื่อ 3+ admin ที่จะเป็น approver (กรณีบอสไม่อยู่):
- Primary: บอส (default)
- Secondary 1: ___?___
- Secondary 2: ___?___
- Backup: super_admin role (auto-fallback)

### Q16: Customer transfer flow (Q4 v2.0)
- (A) ใช้เพลทเดิม (ไม่ออกใหม่ — fast)
- (B) ออกเพลทใหม่ (premium UX แต่ +cost)
- (C) Customer choose (option ใน LIFF)

### Q17: Multi-batch reorder (Q7 v2.0)
- (A) 1 batch ID เดียวสำหรับ 1M plate
- (B) **แบ่งหลาย batch ID per SKU mix** — **recommended (better tracking)**
- (C) แบ่งตามวันที่สั่ง

### Q18: Invoice S/N column toggle
- (A) Default ON ใน invoice render
- (B) Default OFF + per-distributor toggle
- (C) **Phase 3 deferred** — **recommended**

### Q19: Allow extension หลัง warranty หมดเกิน 30 วัน?
- (A) **Yes (30-day grace)** — **recommended**
- (B) No (must extend before expiry)
- (C) Yes + admin review fee

### Q20: Refund policy for extension
- (A) **7-day refund window (full refund)** — **recommended**
- (B) No refund after payment
- (C) Pro-rated refund

### Q21: Fraud score threshold
- (A) Block >= 70 (default v2.4) — **recommended**
- (B) Block >= 80 (more lenient)
- (C) Block >= 60 (more aggressive)

### Q22: Public API pricing
- (A) **Free tier (rate limited)** — **recommended for Phase 4**
- (B) Paid tier from launch
- (C) Free for partners + paid for general

### Q23: Stolen plate public lookup
- (A) Open public (no auth, rate limited) — best for police/insurance
- (B) **Authenticated only (partner API)** — **recommended (PDPA-safe)**
- (C) Boss decision later (Phase 4)

### Q24: Audit retention
- (A) 5 ปี ทุก audit (high storage)
- (B) **3 ปี operational + 5 ปี sensitive_op** (split by event_type) — **recommended (v2.4 PDPA-aligned)**
- (C) 2 ปี (minimum legal)

---

## 🟢 UX Questions (ขอตอบก่อน Phase 2 W7)

### Q25: Banner display limit (Member Dashboard)
- (A) **3 banners on home + scrollable list ใน /notifications page** — **recommended**
- (B) 5 banners on home
- (C) Single ribbon รวม

### Q26: Notification opt-out granularity
- (A) **Per-type opt-in (expiry/anniversary/review/cross-sell/service)** — **recommended**
- (B) All-or-nothing toggle
- (C) Boss-defined campaigns only

### Q27: Tier badge display
- (A) **Prominent in header (next to name)** — **recommended**
- (B) Subtle (icon only)
- (C) Hidden (admin-only view)

### Q28: Asset card history timeline
- (A) Always expanded
- (B) **Collapsible (default collapsed)** — **recommended (less clutter)**
- (C) Hidden (link to dedicated page)

### Q29: Scan-first vs Type-first registration
- (A) **Default scan-first** — **recommended**
- (B) Type-first (legacy users prefer)
- (C) A/B test (need analytics)

---

## 📋 Decision Recording Format

ขอบอสตอบ:

```
Q1: B (DNCSS-2505-00001 format)
Q2: B (DINOCO warehouse ติดเอง)
Q3: B (Unified Gateway)
...
```

หรือ "Recommended ทั้งหมด" ก็ได้

---

## 🚦 Decisions Affecting Phase Scope

### High-impact decisions (อาจเปลี่ยน timeline)
- Q5 Phase 1 scope (3 vs 5 wk)
- Q6 F#8 placement (Phase 5 vs squeeze in)
- Q11 LINE quota (affects F#1+F#4+F#10 volume)
- Q13 HMAC URL Phase 1 promote (+20h)

### Medium-impact decisions
- Q2 B2F plate origin (affects W6 Service Center hook)
- Q4 Schema split (affects W2 schema design)
- Q14 4-eyes scope (affects W5 approval workflow)
- Q15 approver list (need before W5)

### Low-impact decisions (can defer to Phase 3+)
- Q25-Q29 UX tweaks (defaults work fine)
- Q22-Q23 API pricing (Phase 4 decision)

---

## ✅ Sign-off

ก่อน start Phase 0 → Phase 1 W2 ต้องการ:

- [ ] Q1-Q12 (BLOCKERS) ทั้ง 12 ข้อตอบครบ
- [ ] Q15 approver list ระบุ 3+ ชื่อ
- [ ] Q12 fraud baseline data ส่งให้ทีม dev
- [ ] Q11 LINE Premium budget approved (ถ้าเลือก B)
- [ ] Q6+Q7 payment gateway — บอส OK ให้เริ่ม legal track parallel ทันที?

หลังตอบครบ → Phase 0 sign-off → Phase 1 W2 schema design start

---

## Recommended All-in-one Answer (Boss can copy-paste)

ถ้าบอสไม่อยากตัดสินใจทีละข้อ — ใช้ recommended preset:

```
Q1: A · Q2: B · Q3: B · Q4: A · Q5: A · Q6: A
Q7: B · Q8: A · Q9: A · Q10: A · Q11: B
Q12: ขอ baseline 1 wk
Q13: A (ถ้า Q12 ROI > ฿100K/ปี)
Q14: B · Q15: บอส + 2 super_admin + super_admin role fallback
Q16: A · Q17: B · Q18: C · Q19: A · Q20: A
Q21: A · Q22: A · Q23: B · Q24: B
Q25: A · Q26: A · Q27: A · Q28: B · Q29: A
```

หรือพิมพ์ "Recommended ทั้งหมด" → ทีม dev ใช้ค่า default
