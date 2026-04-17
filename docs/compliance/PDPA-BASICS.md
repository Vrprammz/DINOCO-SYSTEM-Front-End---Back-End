# PDPA Basics — DINOCO System

**Scope**: พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล 2562 (Thailand PDPA 2019 — in force May 2022)

**Status**: Skeleton scaffold — snippet stubs deployed, full implementation deferred to future sprint.

---

## สถานะ 🎯

### เสร็จแล้ว ✅
- **`[System] DINOCO GDPR Data Requests` V.1.0** — 3 REST endpoints stubs:
  - `POST /wp-json/dinoco-gdpr/v1/my-data-export`
  - `POST /wp-json/dinoco-gdpr/v1/my-data-delete`
  - `GET /wp-json/dinoco-gdpr/v1/my-data-status`
- Flag `dinoco_gdpr_enabled` default **OFF** → endpoints return 503 + "contact admin"
- Schema `wp_dinoco_gdpr_requests` lazy-install on flag activation

### ยังไม่ได้ทำ ⏳ (future sprint)
- Admin review UI (`[dinoco_admin_gdpr]` shortcode)
- ZIP export generator (wp-cron background job)
- Anonymize mode (replace PII → `[redacted]`)
- Email notification templates
- Consent banner on member registration
- Privacy Policy + Terms of Service updates

---

## PDPA Sections ที่เกี่ยวข้อง

| Section | Right | Status |
|---------|-------|--------|
| **มาตรา 30** | สิทธิขอรับข้อมูล (Access) | Stub พร้อม, impl pending |
| **มาตรา 31** | สิทธิขอแก้ไขข้อมูล (Rectification) | ทำผ่าน Member Profile edit เดิม ✅ |
| **มาตรา 32** | สิทธิขอระงับการใช้ (Restriction) | ไม่ implement แยก — ใช้ delete แทน |
| **มาตรา 33** | สิทธิคัดค้านการประมวลผล (Object) | ไม่มี marketing automation → N/A |
| **มาตรา 34** | สิทธิขอให้โอนข้อมูล (Portability) | Export ZIP (JSON+CSV) = covers this |
| **มาตรา 35** | สิทธิขอลบข้อมูล (Erasure) | Stub พร้อม, impl pending |
| **มาตรา 39** | เก็บรักษาข้อมูล (Retention) | accounting records **≥ 5 ปี** ตาม tax law — conflict กับ section 35 → ใช้ **anonymize แทน hard-delete** |

---

## Data Scope (PII ที่ระบบเก็บ)

| Subsystem | Table/CPT | PII Fields | Retention Policy |
|-----------|-----------|-----------|------------------|
| Member | `wp_users` + `wp_usermeta` | email, display_name, LINE UID | Anonymize on delete request |
| Member | `dinoco_warranty` CPT | owner_name, phone, address | Anonymize (keep product serial for warranty validity) |
| Member | `claim_ticket` CPT | reporter_name, phone, photos | Anonymize (keep issue description for product improvement) |
| B2B | `distributor` CPT | shop_name, contact phone, owner info | Anonymize (keep order history anonymized for accounting) |
| B2B | `b2b_order` CPT | distributor_id reference | Aggregate-only after anonymize |
| LINE msgs | MongoDB (openclaw) | user messages + LINE UID | Hard delete (no accounting requirement) |

**Rule**: ถ้าข้อมูลต้องเก็บตามกฎหมาย (accounting, tax) → anonymize. ถ้าไม่ต้อง → hard delete OK.

---

## Workflow (future impl)

```
User submits request (export/delete)
   ↓
Request queued → status='pending' in wp_dinoco_gdpr_requests
   ↓
Admin reviews (72h SLA) via [dinoco_admin_gdpr] shortcode
   ↓
Admin approves (export) OR approves+mode (anonymize/hard_delete)
   ↓
status='approved' → wp_cron picks up → processes
   ↓
Export: ZIP generated → email link (7-day expiry)
Delete: anonymize or hard_delete → email confirmation
   ↓
status='completed' + archive to wp_dinoco_gdpr_archive
```

---

## Activation Checklist (when ready — future sprint)

1. **Legal review** — hire lawyer to review:
   - Privacy Policy (ไทย/English)
   - Terms of Service
   - Consent wording บน member registration form
   - Retention policy alignment (5-year accounting law vs PDPA)

2. **Build admin UI** — `[dinoco_admin_gdpr]` shortcode:
   - Pending queue table
   - Preview export data modal
   - Approve/Reject buttons (with modal helper V.1.0)
   - Completed archive viewer

3. **Build backend workers**:
   - `dinoco_gdpr_generate_export_zip()` — ZIP + signed download
   - `dinoco_gdpr_process_anonymize()` — field-by-field PII redaction
   - `dinoco_gdpr_cron_process_queue()` — hourly wp_cron
   - `dinoco_gdpr_send_notification()` — email templates (Thai-first)

4. **Consent banner** — add ที่ member registration form:
   - Link to Privacy Policy
   - Checkbox "ยอมรับเงื่อนไขการเก็บข้อมูล"
   - Store consent timestamp in `wp_usermeta.dinoco_consent_at`

5. **Activate**:
   ```sql
   UPDATE wp_options SET option_value='1' WHERE option_name='dinoco_gdpr_enabled';
   ```

6. **Verify** — test with internal test user

---

## References

- Thailand PDPA full text: https://www.pdpc.or.th
- PDPC (Personal Data Protection Committee): กำกับดูแล
- Penalty: max 5 ล้านบาท + จำคุก 1 ปี (criminal violations)
- Current implementation: `[System] DINOCO GDPR Data Requests` V.1.0

---

**Action items**: When user ready to activate, spawn dedicated sprint (2-3 weeks) with legal counsel + build admin UI + test end-to-end. Current state = safe (endpoints return 503, flag OFF).
