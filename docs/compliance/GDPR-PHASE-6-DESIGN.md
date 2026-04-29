[← back to compliance/](./)

# GDPR / PDPA Phase 6 — Implementation Design Draft

**Status**: Design phase — pending legal review + boss sign-off
**Owner**: TBD
**Snippet**: `[System] DINOCO GDPR Data Requests` (V.1.3 stubs already shipped)
**Date**: 2026-04-29

## Context

Phase 1 audit (2026-04-17) shipped V.1.0 stubs for Thai PDPA / GDPR data subject rights compliance:

- 3 REST endpoints under `/wp-json/dinoco-gdpr/v1/` (`my-data-export`, `my-data-delete`, `my-data-status`)
- Flag-gated `dinoco_gdpr_enabled` (default `0` → endpoints return 503)
- Schema `wp_dinoco_gdpr_requests` lazy-installs via `dbDelta` on first activation
- V.1.1 added: 90-day PII retention cron (`dinoco_gdpr_retention_cron`) + Cloudflare-aware IP resolver + SELECT+INSERT race transaction guard
- V.1.3 added: `dinoco_config()` migration for flag

Phase 6 = full implementation: queue worker + admin review UI + email notifications + legal review.

## Regulatory Context

| Regulation | Region | Key Articles | Deadline |
|---|---|---|---|
| **Thai PDPA** | Thailand (primary) | §30 access, §31 export, §32-33 deletion, §34 portability, §35 anonymization | 30 days from request |
| **GDPR** | EU (cross-border) | Art. 15 access, Art. 17 erasure, Art. 20 portability | 1 month + 2 month extension max |

DINOCO operates primarily in Thailand → PDPA compliance is mandatory; GDPR aligned for international LINE OA messaging.

## Scope — Data Subject Categories

| Subject | Data scope | Erasure complexity |
|---|---|---|
| **Member** (LINE-linked B2C user) | wp_users + wp_usermeta + warranties + claims + LINE messages | Medium — has warranty claims to preserve for legal/warranty obligations |
| **Distributor** (B2B account) | distributor CPT + B2B orders + debt records + LINE group history | High — debt records + tax records (Thai Revenue 5-year retention) |
| **Maker** (B2F factory) | maker CPT + PO history + payment records + slip images | High — financial records 5-year retention |
| **Anonymous LINE chat** | OpenClaw MongoDB conversation logs | Low — no business obligation |

## Erasure Strategy — Anonymization vs Hard Delete

**Decision matrix** (per subject + record type):

| Record type | Action on delete request | Rationale |
|---|---|---|
| `wp_users.user_email` | Hash to `deleted-{hash}@anon.local` | Preserve referential integrity in warranty/claim records |
| `wp_usermeta` (PII keys) | Delete row | Phone, address, LINE_UID — not legally required |
| `dinoco_warranty` CPT | Anonymize `customer_*` fields | 5-year warranty obligation per Consumer Protection Act |
| `claim_ticket` CPT | Anonymize claim photos + customer name | Preserve product defect records (legal hold) |
| `b2b_order` CPT | Anonymize `dist_name` + delete addresses | Tax records require order amount + date for 5 years |
| `dinoco_debt_log` | NEVER delete | Financial audit trail (Thai Revenue Code §86/14) |
| `b2f_payable_log` | NEVER delete | Same as B2B debt |
| LINE messages (MongoDB) | Hard delete by sourceId | No business obligation |
| Slip images (filesystem) | Hard delete | PII-rich (bank account visible) |

**PDPA §17 storage limitation** + V.1.1 cron handles 90-day request_ip/request_ua TTL for the request log itself.

## Architecture

```
Member portal / dashboard
    ↓ POST /dinoco-gdpr/v1/my-data-{export|delete}
WordPress REST handler (V.1.3+)
    ↓ INSERT wp_dinoco_gdpr_requests (status='queued')
    ↓ wp_schedule_single_event('dinoco_gdpr_process_request', $request_id)
WP-Cron worker (NEW)
    ↓ Re-query request → status='processing'
    ↓ Build export ZIP / execute deletion plan
    ↓ Update wp_dinoco_gdpr_requests (status='ready'|'failed')
    ↓ Send email to user with download link / completion confirmation
Admin Dashboard (NEW)
    [dinoco_gdpr_admin] shortcode
    ↓ Review pending/ready/failed requests
    ↓ Manual override + audit trail
```

## REST API Extension (Phase 6)

Existing endpoints continue (`my-data-export` / `my-data-delete` / `my-data-status`).

**NEW admin endpoints** (`manage_options` capability + nonce):

| Endpoint | Method | Purpose |
|---|---|---|
| `/dinoco-gdpr/v1/admin/requests` | GET | List all requests with filters (status, type, age) |
| `/dinoco-gdpr/v1/admin/request/{id}` | GET | Full request detail + scope preview |
| `/dinoco-gdpr/v1/admin/request/{id}/approve` | POST | Approve queued → trigger worker |
| `/dinoco-gdpr/v1/admin/request/{id}/reject` | POST | Reject with reason (legal hold, etc.) |
| `/dinoco-gdpr/v1/admin/request/{id}/manual-export` | POST | Admin manual export trigger |
| `/dinoco-gdpr/v1/admin/audit-log` | GET | Audit trail (decisions + processing events) |

## Queue Worker Implementation

```php
add_action( 'dinoco_gdpr_process_request', 'dinoco_gdpr_run_worker', 10, 1 );

function dinoco_gdpr_run_worker( $request_id ) {
    global $wpdb;
    // FOR UPDATE lock to serialize worker invocations
    $wpdb->query( 'START TRANSACTION' );
    $req = $wpdb->get_row( $wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}dinoco_gdpr_requests WHERE id=%d AND status='queued' FOR UPDATE",
        $request_id
    ) );
    if ( ! $req ) {
        $wpdb->query( 'COMMIT' );
        return; // already processing or completed
    }
    $wpdb->update( "{$wpdb->prefix}dinoco_gdpr_requests",
        array( 'status' => 'processing', 'processed_at' => current_time('mysql') ),
        array( 'id' => $request_id )
    );
    $wpdb->query( 'COMMIT' );

    try {
        if ( $req->type === 'export' ) {
            $zip_path = dinoco_gdpr_build_export( $req->user_id );
            // Move to private uploads (rate-limited, expiring URL)
            $url = dinoco_gdpr_publish_export( $zip_path, $request_id );
            dinoco_gdpr_email_user( $req->user_id, 'export_ready', $url );
        } elseif ( $req->type === 'delete' ) {
            $report = dinoco_gdpr_execute_deletion( $req->user_id );
            dinoco_gdpr_email_user( $req->user_id, 'deletion_complete', $report );
        }
        $wpdb->update( "{$wpdb->prefix}dinoco_gdpr_requests",
            array( 'status' => 'ready' ),
            array( 'id' => $request_id )
        );
    } catch ( \Throwable $e ) {
        $wpdb->update( "{$wpdb->prefix}dinoco_gdpr_requests",
            array( 'status' => 'failed', 'notes' => 'Worker error: ' . $e->getMessage() ),
            array( 'id' => $request_id )
        );
        // Notify admin via b2b_log + Telegram alert
        if ( function_exists( 'b2b_log' ) ) {
            b2b_log( '[GDPR] Worker failed request_id=' . $request_id . ' err=' . $e->getMessage() );
        }
    }
}
```

## Export Helper — `dinoco_gdpr_build_export($user_id)`

Per PDPA §31 portability requirement → **machine-readable format** (JSON + CSV in ZIP):

```
gdpr-export-{user_id}-{timestamp}.zip
├── README.txt           — explanation of contents + dates
├── account.json         — wp_users core profile
├── usermeta.json        — wp_usermeta filtered to PII keys (whitelist)
├── warranties.csv       — registered products
├── claims/
│   ├── claim-{id}.json  — per-claim metadata
│   └── photos/          — claim attachments (if user uploaded)
├── orders.csv           — B2B order history (for distributors)
└── line-messages.json   — chat history from MongoDB (optional, V.6.1+)
```

**Privacy hardening**:
- Export URL: `/wp-content/uploads/gdpr/{user_id}/{token}.zip` with `.htaccess` deny + signed URL via `dinoco_gdpr_signed_url($token, expires=86400)`
- Auto-delete files 7 days post-creation (cron `dinoco_gdpr_export_cleanup_cron`)
- ZIP password = email-delivered separately (defense-in-depth)

## Deletion Helper — `dinoco_gdpr_execute_deletion($user_id)`

```
1. SELECT FOR UPDATE on wp_users + linked records → identify scope
2. Apply decision matrix (anonymize vs hard delete) per record type
3. Per-table report:
   { wp_users: 'anonymized', wp_usermeta: 12 rows deleted,
     dinoco_warranty: 3 anonymized, claim_ticket: 5 anonymized,
     b2b_order: 47 anonymized, dinoco_debt_log: PRESERVED (legal hold),
     line_messages_mongodb: 234 deleted, slip_images_filesystem: 12 deleted }
4. Write audit row: dinoco_gdpr_deletion_audit (request_id, user_id, scope_json, executed_at)
5. Email user confirmation with deletion report (per Art. 12 transparency)
```

**Legal hold mechanism**: distributors with active debt > 0 → reject with reason `legal_hold_active_debt` until debt cleared. Admin can override via manual processing.

## Admin Dashboard Design

**New shortcode** `[dinoco_gdpr_admin]` embedded in Admin Dashboard sidebar (under "ระบบกลาง").

**Tabs**:
1. **Pending Review** — queued requests waiting for admin decision (priority by age)
2. **Processing** — worker running (read-only progress)
3. **Ready** — completed exports awaiting download / completed deletions
4. **Failed** — worker errors requiring admin attention
5. **Audit Log** — full decision + processing trail (PDPA §39 documentation requirement)

Each request card shows:
- User identity (name + email + LINE UID + distributor link)
- Request type + scope preview
- Age (days since submitted)
- Decision buttons: Approve / Reject / Manual Process
- Linked records summary (warranties + claims + orders)
- Reject modal with reason dropdown (legal hold / fraud suspected / cooling-off period / other)

## Email Notification Templates

| Trigger | Template (Thai + English fallback) | Send via |
|---|---|---|
| Request received | "เราได้รับคำขอ {type} ของคุณแล้ว ระยะเวลาดำเนินการ 30 วัน" | wp_mail (transactional) |
| Export ready | "ข้อมูลของคุณพร้อมดาวน์โหลด ลิงก์หมดอายุใน 7 วัน" + signed URL | wp_mail (with attachment hash for verify) |
| Deletion complete | Report + scope + retention notice for preserved records | wp_mail |
| Rejection | Reason + appeal contact | wp_mail |
| 25-day reminder | "คำขอใกล้ครบกำหนด 30 วัน" → admin Telegram alert if unprocessed | wp_mail + Telegram |

## Security & Privacy Considerations

| Risk | Mitigation |
|---|---|
| Account takeover → mass data exfiltration | 2FA required for `/my-data-export` if WP user has elevated capability; LINE Login re-confirm via OTP for member |
| Forged delete request | Email confirmation link click required (24h cooldown) before queue dispatch |
| Race condition admin processing | FOR UPDATE lock + status state machine (queued → processing → ready/failed) |
| Export ZIP indexed by Google | `.htaccess` deny + signed URL token + 7-day TTL + Robots noindex |
| Insider threat | Admin actions logged to `dinoco_gdpr_audit_log` (immutable append-only) |
| GDPR §15 broad scope creep | Whitelist approach — meta keys explicitly listed, not wildcard |
| Cross-tenant data leak | `WHERE user_id = $req->user_id` enforced in every export query (no JOIN that crosses tenants) |

## Effort Estimate

| Phase | Effort | Dependencies |
|---|---|---|
| 6.1 Worker + queue + decision matrix | 1.5 days | none |
| 6.2 Admin Dashboard UI (shortcode + 5 tabs) | 1 day | 6.1 |
| 6.3 Email templates + Thai translation | 0.5 day | none |
| 6.4 Export helper (ZIP builder) | 1 day | 6.1 |
| 6.5 Deletion helper (anonymization) | 1 day | 6.1 |
| 6.6 Legal review + boss sign-off | TBD external | external |
| 6.7 Phase 6 testing (unit + E2E) | 0.5 day | all above |
| **Total** | **5.5 days dev** + legal review external | — |

## Activation Checklist (when Phase 6 ships)

```bash
# 1. Verify schema migrated
mysql> SHOW COLUMNS FROM wp_dinoco_gdpr_requests;
# Expected: id, user_id, type, status, ticket_id, created_at, processed_at, notes,
#           request_ip, request_ua, expires_at, scope_json (NEW Phase 6)

# 2. Test worker with dummy request
wp eval 'dinoco_gdpr_run_worker(1);'

# 3. Activate flag
wp option update dinoco_gdpr_enabled '1'

# 4. Verify endpoint returns 200 instead of 503
curl -X GET https://dinoco.in.th/wp-json/dinoco-gdpr/v1/my-data-status \
     -H "Cookie: wordpress_logged_in_xxx=..."
# Expected: {success: true, requests: []}

# 5. Add /privacy page link to footer + member portal
# (CMS task — Wave UX team)

# 6. Update PDPA-BASICS.md activation status section
```

## Rollback Plan

```bash
wp option update dinoco_gdpr_enabled '0'
# Endpoints revert to 503 immediately. Existing queued requests continue
# being processed by worker (already-fired wp_schedule_single_event).
# To halt all worker activity: wp cron event delete dinoco_gdpr_process_request --all
```

## Decisions Required from Boss / Legal

1. **Tax record retention** — confirm 5-year debt log preservation (per Thai Revenue Code) before publishing deletion policy
2. **Warranty obligation** — anonymize claims but preserve photos? legal hold scope?
3. **LINE OA messaging** — exclude / include in export? privacy policy disclosure
4. **External processor list** — Slip2Go, Flash Express, Google Gemini → Article 28 DPA needed?
5. **Cross-border (GDPR)** — does DINOCO actively serve EU residents via LINE? affects DPA + breach notification scope
6. **Email template language** — Thai default with English fallback? bilingual?
7. **Appeal mechanism** — DPO contact? PDPC complaint route?

## References

- [Thai PDPA Sections 30-35](https://thainetizen.org/2019/05/pdpa-en/) — data subject rights
- [GDPR Articles 15-22](https://gdpr-info.eu/art-15-gdpr/) — equivalent provisions
- `docs/compliance/PDPA-BASICS.md` — current state + activation checklist
- `[System] DINOCO GDPR Data Requests` snippet — V.1.3 stubs implementation
- `wp_dinoco_gdpr_requests` table schema — V.1.0 dbDelta on flag activation
