# DINOCO System -- Complete User Journey Documentation

> Updated: 2026-04-02 | Based on codebase analysis of 38 files (~50,000 lines)
> Source files referenced are relative to the project root.

---

## Table of Contents

1. [New Member Registration](#1-new-member-registration)
2. [Product Warranty Registration](#2-product-warranty-registration)
3. [File Warranty Claim](#3-file-warranty-claim)
4. [Transfer Warranty](#4-transfer-warranty)
5. [B2B: Place Order](#5-b2b-place-order)
6. [B2B: Check Order Status](#6-b2b-check-order-status)
7. [B2B: Pay with Slip](#7-b2b-pay-with-slip)
8. [B2B: Receive Delivery](#8-b2b-receive-delivery)
9. [Admin: Process New Order](#9-admin-process-new-order)
10. [Admin: Create Manual Invoice](#10-admin-create-manual-invoice)
11. [Admin: Handle Claim](#11-admin-handle-claim)
12. [Admin: Finance Dashboard + AI วิเคราะห์](#12-admin-finance-dashboard--ai-วิเคราะห์)
13. [Admin: Brand Voice Pool](#13-admin-brand-voice-pool)
14. [B2F: Admin Create PO to Maker](#14-b2f-admin-create-po-to-maker)
15. [B2F: Maker Confirm/Reject PO](#15-b2f-maker-confirmreject-po)
16. [B2F: Maker Deliver Goods](#16-b2f-maker-deliver-goods)
17. [B2F: Admin Receive & Pay](#17-b2f-admin-receive--pay)
18. [B2B: Walk-in Order (ร้านหน้าโกดัง)](#18-b2b-walk-in-order-ร้านหน้าโกดัง)

---

## 1. New Member Registration

**Who:** New customer (guest)
**Trigger:** User opens the DINOCO website or scans a product QR code
**Source files:** `[System] DINOCO Gateway`, `[System] LINE Callback`, `[System] Dashboard - Header & Forms`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 1.1 | Opens `/warranty/` or root login page | Full-screen Gateway card (`[dinoco_login_button]` shortcode) | Displays DINOCO branding, motorcycle hero image, headline "Welcome to our family", green LINE Login button at bottom |
| 1.2 | Taps "Login / Register" button | Green CTA button (`.dinoco-btn-app.green`) | Browser redirects to `https://access.line.me/oauth2/v2.1/authorize` with `scope=profile openid`, `bot_prompt=aggressive` |
| 1.3 | Authorizes on LINE consent screen | LINE native OAuth UI | LINE redirects back to `/callback-login?code=...&state=GENERAL_LOGIN` |
| 1.4 | Waits on loading screen | Instant loading page with pulsing DINOCO logo and "Verifying identity..." text | Frontend fires `fetch()` to the same URL with `dinoco_process=1` parameter (AJAX-based callback to avoid blank page) |
| 1.5 | (Automatic) System processes OAuth | N/A - backend only | Exchanges `code` for access token via LINE Token API, fetches LINE profile (`userId`, `displayName`, `pictureUrl`). Checks if `line_user_id` exists in user meta. If not found, creates new WordPress user with username `line_XXXXXXXX_timestamp` and random password |
| 1.6 | (Automatic) Session created | N/A | `wp_set_auth_cookie()` called, user logged in. JSON response returns `{redirect: "/member-dashboard/?welcome=new"}` |
| 1.7 | Redirected to Member Dashboard | Auto-redirect via `window.location.replace()` | Dashboard loads with welcome popup overlay showing "Registration Complete! Welcome to our family" with "Start using" button |
| 1.8 | Dismisses welcome popup | "Start using" button | Popup hidden. User sees the PDPA consent overlay (if `dinoco_pdpa_consent` user meta is empty) |
| 1.9 | Reviews PDPA consent | Full-screen PDPA overlay (`.pdpa-overlay`) with privacy policy sections, radio buttons for each consent group | Must accept required consents to proceed |
| 1.10 | Accepts PDPA | Green "Confirm" button (`.pdpa-btn-confirm`) | System saves `dinoco_pdpa_consent=accepted`, `dinoco_pdpa_timestamp`, `dinoco_pdpa_version` to user meta. PDPA overlay dismissed |
| 1.11 | Sees Gateway screen | Full-screen Gateway (`.gateway-wrapper`) with two cards: "Scan QR" and "Legacy Migration" | User must choose how to register their first product. This overlay appears because `addr_house_no` is empty (no address yet) |
| 1.12 | Fills in personal information | Address form fields, motorcycle brand/model dropdowns | Address saved to user meta (`addr_house_no`, `addr_soi`, `addr_subdistrict`, `addr_district`, `addr_province`, `addr_zip`), motorcycle info saved |
| 1.13 | Completes onboarding | Dashboard fully loads | Member Dashboard displays profile card with LINE avatar, motorcycle image, journey duration, and product inventory (empty for new users) |

### Decision points

- **Step 1.5 -- Existing user?** If `line_user_id` already exists, the system links to that user and redirects with `welcome=back` instead of `welcome=new`. No welcome popup is shown for returning users.
- **Step 1.2 -- Already logged in?** If the user is already authenticated, the Gateway shows "Welcome back! [Name]" with profile photo and a dark "Go to Member Page" button instead of the LINE Login button.
- **Step 1.3 -- User denies LINE authorization?** LINE redirects with `error` parameter. System logs error and redirects to `/warranty/?login_error=denied`. **Fixed:** Gateway now shows a red error banner "ไม่สามารถเข้าสู่ระบบได้ — กรุณาอนุญาตการเข้าถึง LINE แล้วลองอีกครั้ง".
- **Step 1.4 -- Network failure?** If fetch fails, loading text changes to "Connection failed, retrying..." and auto-redirects to `/warranty/` after 3 seconds.

### Where can the user get stuck

- **LINE app not installed:** The LINE OAuth URL opens in the browser. If the user does not have LINE, they cannot register at all. There is no alternative login method.
- **PDPA rejection:** If the user does not accept required PDPA consents, they cannot proceed. There is a logout link at the bottom of the PDPA screen.
- **Address form abandonment:** The gateway/address form has no save-draft mechanism. If the user closes mid-form, they must re-enter everything.

---

## 2. Product Warranty Registration

**Who:** Logged-in member
**Trigger:** Scans QR code on DINOCO product packaging (or manually enters serial number)
**Source files:** `[System] LINE Callback` (warranty gateway), `[System] Dashboard - Header & Forms`, `[System] Member Dashboard Main`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 2.1 | Scans QR code on product | Phone camera (outside the app) | QR encodes URL: `https://dinoco.in.th/warranty-register/?serial=DNC-XXXXX` |
| 2.2 | Opens QR URL | Warranty Gateway page (`[dinoco_gateway]` shortcode) | If not logged in: shows LINE Login with serial badge "Registering: DNC-XXXXX". The `state` parameter carries the serial code through OAuth. If logged in: shows "Welcome back" with serial badge and "Go to Member Page" button linking to `/member-dashboard/?register_serial=DNC-XXXXX` |
| 2.3 | Logs in (if needed) | LINE Login flow (see Journey 1) | After callback, redirected to `/member-dashboard/?register_serial=DNC-XXXXX` |
| 2.4 | Dashboard detects serial parameter | Auto-triggered on page load | System queries `serial_number` CPT for matching `serial_code`. Validates: (a) serial exists, (b) `w_status` is `warranty_available`, (c) not already registered to another user |
| 2.5 | Registration form pre-fills | Modal or inline form | Serial number pre-filled, user confirms personal details (name, phone, address from profile) |
| 2.6 | Confirms registration | "Register" / "Confirm" button | System updates `serial_number` post: sets `owner_product` to user's LINE ID/username, sets `w_status` to `warranty_on`, sets `warranty_register_date` to today, calculates `warranty_expiry` based on `warranty_duration_years` |
| 2.7 | Sees success confirmation | Success message with product card | Product appears in the member dashboard asset list with green "Warranty Active" status badge |

### Alternative path -- QR Scanner from Dashboard

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 2.A1 | Taps "Scan" button in bottom nav bar | QR scanner icon (center button) in Global App Menu | QR Scanner modal opens using `html5-qrcode` library |
| 2.A2 | Grants camera permission | Browser camera permission dialog | Camera feed displayed in scanner modal |
| 2.A3 | Scans QR code | Camera viewfinder | `html5-qrcode` decodes URL, extracts serial number, triggers registration flow |

### Alternative path -- Legacy Migration

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 2.B1 | Taps "Legacy Migration" card on Gateway | Gold-bordered card (`.gateway-card.legacy`) | Navigates to legacy migration flow for products registered under old system |
| 2.B2 | Enters old DINOCO code | Legacy form | System looks up `legacy_request` CPT, creates migration request |

### Decision points

- **Serial already registered?** System returns error -- serial belongs to another user. User sees error message.
- **Serial not found?** System returns error. User is told to check the serial number.
- **Serial in `warranty_pending` status?** Cannot register -- must contact admin.
- **User has no address?** The gateway form forces address completion before product registration.

### Where can the user get stuck

- **QR code damaged/unreadable:** **Fixed.** QR scanner modal now includes a manual serial entry field at the bottom ("QR อ่านไม่ได้? พิมพ์รหัสเอง") with a text input and confirm button.
- **Bundle registration:** If the product is part of a SET (bundle), the system has a separate `create_bundle` action that requires selecting matching SKU children. This flow is complex and may confuse users.

---

## 3. File Warranty Claim

**Who:** Logged-in member who owns a registered product
**Trigger:** Taps "Claim" in bottom navigation bar or navigates to `/claim-system/`
**Source files:** `[System] DINOCO Claim System`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 3.1 | Opens claim page | `/claim-system/` via bottom nav (`.dinoco-nav-item` "Claim") | Page loads `[dinoco_claim_page]` shortcode. Premium green header "DINOCO CARE+" with tagline. Progress track shows 4 steps. Queries all user's products where `w_status != claim_process` |
| 3.2 | **Step 1: Select Product** | Product grid (`.d-grid-layout`) with product cards showing image, name, serial number | User taps a product card. Card gets green border and checkmark (`.d-item-card.active`). "Next" button becomes enabled |
| 3.3 | Taps "Next" | Green primary button (`.d-btn-primary`) | Step 2 animates in with slide-up animation. Progress dot 2 becomes active |
| 3.4 | **Step 2: Describe Problem** | 2-column grid (`.d-prob-grid`) with problem type cards -- each has icon and label. 7 types including structural damage (problems 1-4), paint/cosmetic (5-7 trigger parts request path) | User taps a problem type card. Card highlights with green border |
| 3.5 | Selects sender type | Radio card group (`.d-radio-group`): "Send myself" or "Send via dealer" | If "dealer" selected, dealer selection section appears with region-grouped dealer cards (3-column grid with dealer logos and names) |
| 3.6 | (If dealer selected) Picks dealer | Dealer cards organized by region (Central, North, East, South, Isan) | Dealer card highlights. Return destination option appears: "Return to customer" or "Return to dealer shop" |
| 3.7 | Enters notes | Textarea (`.d-input-area`) for customer notes | Free-text description of the problem. For parts requests: different textarea for parts details |
| 3.8 | Confirms address | Pre-filled address textarea from user profile | User can edit the pre-filled address text |
| 3.9 | Taps "Next" | Primary button | Step 3 animates in |
| 3.10 | **Step 3: Upload Evidence Photos** | 2-column upload grid (`.d-upload-grid`) with 5 upload boxes: Front, Back, Left, Right, Defect spot | Each box shows dashed border with camera icon. User taps to open file picker. After selecting, preview thumbnail shows and box gets green border (`.has-file`) |
| 3.11 | (Validation) File size check | Client-side check | Each image must be under 300KB. Server also validates MIME type (jpg, png, webp only) and performs content sniffing |
| 3.12 | Taps "Submit" | Primary button | Loading overlay appears (`.d-spinner-box`) with spinner and "Processing..." text |
| 3.13 | (System) Creates claim ticket | N/A - POST request | Server: (a) honeypot check, (b) nonce verification, (c) anti-spam transient lock (5 sec), (d) ownership verification (IDOR protection), (e) file validation. Creates `claim_ticket` CPT post. Sets `ticket_status` based on problem type: repair = "Awaiting Customer Shipment", parts = "Pending Issue Verification". Sets product `w_status` to `claim_process`. Uploads images to WordPress media. Generates ticket code `CLM-YYYYMMDD-HHmm-XXXX` or `PCLM-...` for parts |
| 3.14 | **Step 4: Success Screen** | Success view (`#success-view`) with large green checkmark, ticket code in bold green text | Shows "Data saved successfully!" with ticket code prominently displayed |
| 3.15 | Prints PDF claim form | "Print / Download PDF" button | `window.print()` triggered. Print stylesheet activates showing 4-page A4 document: Page 1 = claim details + photos, Page 2 = additional photos + condition notes, Page 3 = QC checklist + billing table, Page 4 = shipping label (landscape, large address text, barcode) |
| 3.16 | Returns to dashboard | "Back to home" link | Navigates to `/member-dashboard/` |

### Decision points

- **Problem types 1-4 (structural):** Creates repair ticket with prefix `CLM-`. Status starts at "Awaiting Customer Shipment". User must physically send the product.
- **Problem types 5-7 (parts/cosmetic):** Creates parts request with prefix `PCLM-`. Status starts at "Pending Issue Verification". Admin reviews before any shipment.
- **Sender type "self" vs "dealer":** Affects the shipping label (Page 4 of PDF). Dealer name and return destination recorded in ticket.

### Where can the user get stuck

- **No eligible products:** If all products are already in `claim_process`, the grid will be empty. **Fixed:** Empty state now shows possible causes (no products registered / all in claim process) with a link to register products.
- **Image too large:** 300KB server limit. **Mitigated:** client-side compression via canvas.toBlob (quality 0.6, maxWidth 1000px) runs before upload. Server also handles resizing. Most phone photos will pass after compression.
- **PDF printing on mobile:** `window.print()` may not work well on all mobile browsers. The warning text says "You will not be able to download again" which creates urgency but the `reprint_id` parameter does allow reprinting from the claim page URL.
- **After submission:** The product status changes to `claim_process` system-wide. User cannot file another claim on the same product until the current claim is resolved. **Fixed:** Dashboard now shows orange badge "กำลังดำเนินการเคลม" and status bar "🔧 อยู่ระหว่างเคลม" for products in claim_process.

---

## 4. Transfer Warranty

**Who:** Logged-in member who owns a registered product
**Trigger:** Taps "Transfer" in bottom navigation bar or navigates to `/transfer-warranty/`
**Source files:** `[System] Transfer Warranty Page`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 4.1 | Opens transfer page | `/transfer-warranty/` via bottom nav | Page loads `[dinoco_transfer_v3]` shortcode. Dark header with user profile (avatar, name, phone, LINE ID). Below: grid of all owned assets (bundles + singles) |
| 4.2 | Browses owned assets | Card grid with product images, names, serial numbers, warranty status badges (color-coded), and status icons | Each card shows: product image, model name, serial number, warranty status strip with color + icon. Bundles show "Bundle Set" badge with child count. Locked items (claim_process, warranty_pending, stolen) show amber/red warning strip |
| 4.3 | Taps a product card | Product card (`.item-card`) | Passport detail modal opens with: hero section (product image on dark gradient), detailed info (SKU, serial, hand sequence, registration date, expiry date), repair/transfer logs timeline (`.tl-container`). For bundles: expandable child cards showing individual items |
| 4.4 | Taps "Transfer" button on detail view | Transfer button within passport modal | Transfer flow modal opens |
| 4.5 | Enters recipient phone number | Phone input field (`.input-check`) + "Search" button (`.btn-check`) | AJAX call to `dinoco_v3_find` action. Searches users by `phone_number` meta |
| 4.6 | System finds recipient | N/A | Returns recipient's LINE profile picture, display name, full name, phone. Displayed as a recipient preview card |
| 4.7 | Reviews recipient info | Recipient card with avatar, name, phone | User verifies this is the correct person |
| 4.8 | Reviews legal disclaimer | Scrollable disclaimer box (`.disclaimer-box`) with transfer terms and conditions | Must scroll through disclaimer text |
| 4.9 | Checks consent checkboxes | Two checkbox groups (`.chk-group`): (1) "I confirm irreversible transfer", (2) "I understand warranty status transfers as-is" | Both checkboxes must be checked. Custom styled round checkboxes |
| 4.10 | Taps "Confirm Transfer" button | Primary button | AJAX call to `dinoco_v3_exec`. System: (a) nonce verification, (b) session check, (c) ownership verification (IDOR protection), (d) checks product is not locked (claim_process/warranty_pending/stolen), (e) logs consent with timestamp, IP, and all details to user meta |
| 4.11 | (System) Executes transfer | N/A | Updates `owner_product` field to recipient's LINE ID. Increments `owner_sequence`. Appends to `transfer_logs`. For bundles: updates `bundle_owner` + transfers ALL children |
| 4.12 | Sees success message | Success toast/modal | "Transfer successful!" message. Page refreshes to show updated asset list (transferred item gone) |

### Decision points

- **Recipient not found:** Error message "Phone number not found in DINOCO member system". Transfer cannot proceed -- recipient must register first.
- **Transfer to self:** Error message "Cannot transfer to yourself".
- **Product locked (claim_process/warranty_pending):** Error message "Cannot transfer -- product is in repair/review status". Red lock icon on card.
- **Product stolen:** Error message "Product is reported stolen/suspended". Transfer completely blocked.
- **Bundle transfer with locked child:** If any child in the bundle is locked, entire bundle transfer is blocked with specific error identifying which child and why.

### Where can the user get stuck

- **Recipient has no phone number:** **Partially fixed.** System now falls back to searching by `owner_line_id` if phone number is not found. Users without both phone and LINE ID still cannot be found.
- **After transfer:** The product disappears from the sender's inventory immediately. There is no "pending transfer" state or ability to reverse. The consent log is the only record.
- **Certificate generation:** The detail view includes a "Generate Certificate" button that creates a warranty certificate image using `html2canvas`. This is a separate feature embedded in the transfer page but not part of the transfer flow.

---

## 5. B2B: Place Order

**Who:** Distributor (staff in LINE group)
**Trigger:** Types "order" in LINE group chat, or opens LIFF catalog link
**Source files:** `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `[B2B] Snippet 4: LIFF E-Catalog Frontend`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 5.1 | Types "order" (or "สั่งของ") in LINE group | LINE chat text input | Webhook receives text, matches command. Checks: (a) not admin group, (b) group is registered distributor, (c) bot is enabled, (d) distributor not on credit hold |
| 5.2 | Receives LIFF catalog link | Flex card with "Order Products" button linking to LIFF URL with signed parameters (`_sig`, `_ts`, `gid`) | The Flex card contains a LIFF URL: `/b2b-catalog/?gid=GROUP_ID&_sig=HMAC&_ts=TIMESTAMP` |
| 5.3 | Opens LIFF link | LINE in-app browser opens LIFF E-Catalog | Loading screen with DINOCO logo + spinner + "Checking permissions..." text |
| 5.4 | (System) Authenticates | N/A | LIFF SDK initializes, gets user profile. Sends `auth-group` request with `group_id`, `line_user_id`, `id_token`, HMAC signature. Server verifies: (a) HMAC signature valid, (b) timestamp not expired, (c) distributor exists and bot enabled, (d) not on credit hold. Returns session token, distributor info (name, rank, logo), product catalog |
| 5.5 | Sees catalog | Header with shop name, rank badge, two tabs: "Order" and "Order History" | Product grid (2-column) loads with: product images, names, standard price (strikethrough), dealer price (bold), discount badge, +/- quantity buttons. Recommended products chips shown if configured |
| 5.6 | Searches/filters products | Search box with magnifying glass, horizontal category filter chips | Products filter in real-time. Empty state "No products found" if no matches |
| 5.7 | Adds items to cart | Taps "+" button on product cards (`.qty-btn`) | Quantity display increments. Cart bar slides up from bottom (`.cart-bar.visible`) showing item count and total price. Cart persisted to `localStorage` |
| 5.8 | Reviews cart | Taps "Order" button on cart bar | Cart summary modal slides up (`.cart-modal`) with: itemized list (name, qty, unit price, line total), customer note textarea, grand total |
| 5.9 | Adds optional note | Textarea in cart modal (`.cart-note-input`) | Free-text note saved with order |
| 5.10 | Confirms order | "Confirm Order" button (`.cart-confirm-btn`) | Submit overlay appears with spinner + "Sending order... Please don't close this page". AJAX POST to `/b2b/v1/place-order` with cart data, group ID, session token |
| 5.11 | (System) Creates draft order | N/A | Server creates `b2b_order` CPT post with status `draft`. Saves order items text, total amount, source group ID, orderer info. Returns ticket ID |
| 5.12 | Sees success | Submit overlay changes to green checkmark + "Order sent! Ticket #XXXX" | Auto-closes LIFF after brief delay |
| 5.13 | Receives confirmation in LINE | Flex card in LINE group | Draft order Flex card with: order summary, total, two buttons: "Confirm" (postback `action=confirm_order`) and "Cancel" (postback `action=cancel_draft`) |
| 5.14 | Confirms order | Taps "Confirm" button on Flex card | Postback triggers `b2b_action_confirm_order`. Checks for OOS items. If all in stock: status changes to `checking_stock`. Reply: "Order sent! Team is checking stock, please wait". Admin group receives stock check alert Flex with confirm/OOS/partial buttons. SLA 10-min timer starts |

### Alternative path -- Edit mode

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 5.E1 | During `checking_stock`, admin requests changes | LIFF link with `?edit=TICKET_ID` parameter | Catalog opens in edit mode with yellow banner "Editing order -- modify items and resubmit" |
| 5.E2 | Modifies cart | Same catalog UI but pre-loaded with existing order items | Cart pre-populated from order |
| 5.E3 | Resubmits | Same confirm flow | Old order cancelled, new order created |

### Decision points

- **OOS items detected on confirm:** Order goes to `backorder`. Customer receives OOS Flex with options: wait for restock, accept partial, or cancel.
- **Credit hold:** Auth fails with "Account suspended -- please pay outstanding balance". LIFF shows auth error screen.
- **Link expired:** If HMAC timestamp is too old, shows "Link expired" page with instructions to re-invoke the bot.
- **Bot disabled:** Text command is silently ignored. No response in chat.

### Where can the user get stuck

- **LIFF initialization failure:** Shows "Cannot open LIFF" error with instruction to close and reopen.
- **Network error during submit:** Retry logic with "Retrying..." toast. After 2 retries, shows error.
- **No cancel after confirm:** Once the user taps "Confirm" on the Flex card and stock check begins, there is no cancel button until the admin processes it. The user must type "cancel #TICKET_ID" in chat.

---

## 6. B2B: Check Order Status

**Who:** Distributor (staff in LINE group)
**Trigger:** Types status command in LINE group or opens LIFF history tab
**Source files:** `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `[B2B] Snippet 4: LIFF E-Catalog Frontend`

### Method A -- LINE Chat Command

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 6.A1 | Types "status" (or "สถานะออเดอร์" / "ประวัติ") | LINE chat | Bot sends Flex card with recent order summary: last 5 orders with status badges, totals, and "View details" LIFF buttons |
| 6.A2 | Types "status #1234" (specific ticket) | LINE chat | Bot sends detailed Flex card for that ticket: status, items, total, tracking info if available, due date, action buttons relevant to current status |

### Method B -- LIFF History Tab

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 6.B1 | Opens LIFF catalog and taps "Order History" tab | Tab button (`.tab-btn`) | History panel slides in. Toolbar with filter chips and refresh button |
| 6.B2 | Browses orders | History cards (`.history-card`) with: ticket ID, date, status badge (color-coded), itemized list, total, tracking info | Paginated list (configurable page size). Each card has action buttons based on status |
| 6.B3 | Filters by status | Filter chips (`.filter-chip`): "All", "Pending payment", "Shipped", "Completed", etc. | List filters. Page info updates ("Showing 1-10 of 25") |
| 6.B4 | Taps "View details" | Detail button (`.history-btn.detail`) | Opens LIFF ticket detail page (`/b2b-ticket/`) with signed URL for full order view |
| 6.B5 | Refreshes | "Refresh" button | Re-fetches from API with loading indicator |

### Method C -- Debt Check

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 6.C1 | Types "debt" (or "เช็คหนี้" / "ยอดค้าง") | LINE chat | Bot sends Flex card with: current outstanding debt, credit limit, available credit, list of unpaid invoices with due dates |

### Where can the user get stuck

- **No orders yet:** Empty state with package icon and "No order history yet" message.
- **LIFF link expired for detail view:** Shows expired link page with instructions.

---

## 7. B2B: Pay with Slip

**Who:** Distributor (staff in LINE group)
**Trigger:** Sends bank transfer slip image in LINE group chat
**Source files:** `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `SYSTEM-ARCHITECTURE.md` (slip payment flow)

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 7.1 | Makes bank transfer to DINOCO account | Banking app (external) | User transfers money to the configured bank account |
| 7.2 | Takes screenshot of transfer slip | Phone screenshot | N/A |
| 7.3 | Sends slip image in LINE group chat | LINE chat image message | Webhook receives image message. Downloads image content via LINE Content API |
| 7.4 | (System) Verifies slip | N/A | Sends image to Slip2Go API with `x-authorization` header. Slip2Go performs OCR on QR code embedded in Thai bank slips |
| 7.5a | **Slip valid -- amount matches a single invoice** | N/A | System checks: (a) slip not duplicate (transaction ref + md5 dedup), (b) destination account matches DINOCO bank, (c) amount matches an `awaiting_payment` order within +/-2% tolerance. If auto-match: marks order as `paid`, deducts from `current_debt` |
| 7.5b | **Slip valid -- amount does not match single invoice** | N/A | System sends Flex card "Select invoice to pay" with list of unpaid invoices and their amounts. Buttons are postback with `action=slip_pay&ticket_id=X` |
| 7.5c | **Slip duplicate** | N/A | Reply: "This slip has already been used" |
| 7.5d | **Wrong bank account** | N/A | Reply: "Transferred to wrong account" with correct account info |
| 7.5e | **Not a slip / unreadable** | N/A | Silent -- no response (may be a regular photo, not a slip) |
| 7.6 | (If 7.5b) Selects invoice from Flex | Taps invoice button on Flex card | Postback `action=slip_pay` with ticket ID. System matches slip amount to selected invoice. If sufficient: marks as `paid`. If partial: records partial payment |
| 7.7 | Receives payment confirmation | Flex card in LINE group | Flex card with: green checkmark, "Payment received!", slip amount, matched invoice ticket ID, remaining debt |
| 7.8 | Admin receives notification | Flex card in admin LINE group | Admin alert with payment details, slip verification status, and action buttons |

### Special case -- Bot disabled (Manual Invoice mode)

When `bot_enabled = '0'` for a distributor:
- Slip verification still works (always active)
- Simple Flex response (no LIFF buttons)
- Text commands are blocked (except "groupid")
- Postbacks blocked except `slip_pay` and `confirm_received`

### Decision points

- **Amount tolerance:** +/-2% auto-matches. Outside tolerance: manual selection required.
- **Multiple unpaid invoices:** Flex card shows all. 30-minute timeout on selection -- after that, must resend slip.
- **Split payment:** System supports partial payments. Records each payment in `_inv_partial_payments` JSON. Order stays in `awaiting_payment` until fully paid.

### Where can the user get stuck

- **Slip QR unreadable:** If the bank slip's QR code is damaged or the photo is blurry, Slip2Go returns 200404. System stays silent intentionally — because any image in the group could be a product photo, receipt, or other non-slip image. Replying would confuse users who sent non-slip images.
- **30-minute timeout:** If user does not select an invoice within 30 minutes, the slip association expires. Must re-send slip.
- **Non-Thai bank:** Slip2Go is designed for Thai bank slips only. Foreign transfers cannot be auto-verified.

---

## 8. B2B: Receive Delivery

**Who:** Distributor (staff in LINE group)
**Trigger:** Receives delivery notification after shipment
**Source files:** `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `SYSTEM-ARCHITECTURE.md`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 8.1 | (System) Order shipped | N/A | When admin ships order, status changes to `shipped`. System sends Flex card to distributor group with tracking info |
| 8.2 | Receives shipping notification | Flex card in LINE group | Flex card with: tracking number(s), courier name, shipped date. For Flash Express: tracking link. Buttons: "Confirm received" / "Report problem" |
| 8.3 | Waits for physical delivery | External -- courier delivers package | Flash Express tracking synced every 2 hours via `b2b_flash_tracking_cron` |
| 8.4 | (System) Delivery check trigger | N/A | After 1-3 days (configurable), cron `b2b_auto_complete_check` sends delivery confirmation Flex card asking customer to confirm receipt |
| 8.5 | Taps "Confirm received" | Postback button on Flex card (`action=confirm_received`) | Status changes to `completed`. Distributor sees "Order completed!" confirmation Flex. Admin notified |
| 8.6 | (Alternative) Taps "Report problem" | Postback button (`action=delivery_no`) | Status stays in `shipped`. Admin alerted. Customer may be asked for details |

### Auto-completion

If the distributor does not confirm within 7 days after shipping, the `b2b_auto_complete_check` cron automatically sets the order to `completed`.

### Decision points

- **Flash Express tracking shows "Delivered" (state=5):** System may auto-trigger delivery confirmation Flex.
- **Flash Express tracking shows "Problem" (state=6) or "Returned" (state=7):** Admin alerted via separate cron.

### Where can the user get stuck

- **Missed Flex card:** If the confirmation Flex is sent during a busy chat, the distributor may not see it. Auto-completion at 7 days is the safety net.
- **No tracking for manual shipment:** If admin shipped manually without a tracking number, there is no tracking link. Customer has no visibility into delivery status.

---

## 9. Admin: Process New Order

**Who:** Admin (staff in admin LINE group or web dashboard)
**Trigger:** Receives stock check alert in admin LINE group
**Source files:** `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `[B2B] Snippet 5: Admin Dashboard`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 9.1 | Receives stock check alert | Flex card in admin LINE group | Flex card with: ticket ID, distributor name, order items list with quantities, three action buttons: "Stock OK" (`stock_confirm`), "Out of Stock" (`stock_oos`), "Partial" (`stock_partial`) |
| 9.2a | **All in stock:** Taps "Stock OK" | Postback button | `b2b_action_stock_confirm`: changes status to `awaiting_confirm`. Records admin name as `stock_checked_by`. Sends Flex to customer group with order summary and "Confirm Bill" / "Cancel" buttons. SLA timer restarts. Admin reply: "Stock confirmed (by [name]). Customer notified to confirm bill" |
| 9.2b | **All out of stock:** Taps "Out of Stock" | Postback button | `b2b_action_stock_oos`: sends ETA selection Flex with buttons for estimated days (3, 7, 14, 30, or "no ETA"). Admin selects ETA |
| 9.2c | **Partially in stock:** Taps "Partial" | Postback button | `b2b_action_stock_partial`: sends Flex to customer with available/unavailable items breakdown and options |
| 9.3 | (After 9.2b) Selects ETA | ETA button (e.g., "7 days") | `b2b_action_bo_set_eta`: sets `backorder` status, saves ETA date, marks relevant SKUs as OOS. Customer receives Backorder Flex with options: wait, accept partial, or cancel |
| 9.4 | (After customer confirms bill) Receives shipping choice Flex | Flex card in admin group | Flex with 4 shipping method buttons: "Flash Express" (`ship_flash`), "Manual shipping" (`ship_manual`), "Rider/Lalamove" (`ship_rider`), "Customer picks up" (`ship_self_pickup`). **Auto-fallback:** if no choice made within 1 hour, system auto-selects Flash + print |
| 9.5a | **Flash Express:** Taps "Flash Express" | Postback button | `b2b_action_pack_flash`: calls Flash Express API to create shipment, generates tracking numbers (one per box based on `boxes_per_unit`), queues print jobs (invoice + label + picking list) to RPi print server. Status changes to `packed` |
| 9.5b | **Manual:** Taps "Manual shipping" | Postback button | `b2b_action_pack_done`: status changes to `shipped`. Admin instructed to type tracking number: "เลขพัสดุ [ticket_id] [tracking] [courier]" |
| 9.5c | **Rider:** Taps "Rider" | Postback button | Status changes to `shipped`. Notification sent to customer |
| 9.5d | **Customer pickup:** Taps "Customer picks up" | Postback button | Status changes to `completed` immediately |
| 9.6 | (For Flash) Enters tracking after courier picks up | N/A -- automatic | Flash tracking synced via cron. Status auto-updates. Labels already printed |
| 9.7 | (For manual) Types tracking number | Text command: "เลขพัสดุ 1234 FL987654321 Flash" | System parses: ticket ID, tracking number, courier name. Saves to `tracking_number` and `shipping_provider`. Status changes to `shipped`. Customer notified with tracking Flex |

### SLA monitoring

- 10-minute SLA timer starts at each status change requiring admin action
- If timer expires, SLA alert Flex sent to admin group with "snooze" button (30 min increments)
- `_sla_nag_count` increments with each reminder

### ChatOps commands (admin group)

Admin can also process orders via text commands:
- `รับงาน #1234` -- Claim/accept a ticket
- `เลขพัสดุ 1234 FL123 Flash` -- Add tracking number
- `@admincancel #1234` -- Force cancel
- `@reprint #1234` -- Requeue print job
- `สรุปออเดอร์` -- Order summary
- `รอยืนยัน` -- List pending confirmation orders
- `หนี้ค้าง` -- Outstanding debts

### Where can the user get stuck

- **Missed SLA alert in busy chat:** Admin may miss the stock check Flex. SLA reminders help but can become noisy.
- **Flash API failure:** If Flash Express API returns error, `_flash_create_error` is saved. Admin sees error message. `b2b_flash_courier_retry` cron retries on-demand.
- **RPi print server offline:** `b2b_rpi_heartbeat_check` cron monitors every 5 minutes. If RPi is down, print jobs queue up and are processed when it comes back online.

---

## 10. Admin: Create Manual Invoice

**Who:** Admin (web dashboard)
**Trigger:** Opens manual invoice dashboard
**Source files:** `[Admin System] DINOCO Manual Invoice System`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 10.1 | Opens invoice dashboard | `/admin-invoice/` or `[dinoco_manual_invoice]` shortcode page | Dashboard shows: active invoices list, distributor dropdown, create new button. 17 REST API endpoints available under `/invoice/` namespace |
| 10.2 | Selects distributor | Distributor dropdown/search | Loads distributor info: shop name, address, rank, current debt, credit limit |
| 10.3 | Adds line items | Product selection + quantity inputs | Each item shows: SKU, product name, rank-based price, quantity, line total. Running total calculated |
| 10.4 | Sets payment terms | Credit term days field (defaults from distributor's `credit_term_days`) | Due date auto-calculated |
| 10.5 | Issues invoice | "Create Invoice" button | Creates `b2b_order` CPT with `_order_source = manual_invoice`. Generates invoice number `INV-DNC-XXXXX`. Sets status to `awaiting_payment`. Adds to distributor's `current_debt`. Sends invoice Flex to distributor's LINE group (if bot enabled) + invoice image (GD-generated PNG) |
| 10.6 | Monitors payment | Invoice list with status badges | Slip payments auto-detected when distributor sends slip in LINE group (even with bot disabled). Manual payment entry also available from dashboard |
| 10.7 | (Optional) Uploads slip manually | Upload slip button on invoice detail | Admin can upload slip image + enter payment amount. Creates payment record in `_inv_partial_payments` |
| 10.8 | (Optional) Records manual payment | Manual entry tab in payment modal | Admin enters: amount, date, reference notes. No slip verification |

### Dunning (automated reminders)

- `b2b_dunning_cron_event` runs daily at 09:00
- Checks all overdue invoices
- Sends payment reminder Flex cards to distributor groups
- If debt exceeds credit limit: sets `credit_hold = true`, blocking new orders

### Where can the user get stuck

- **Distributor without LINE group:** Invoice created but no LINE notification sent. Admin must communicate through other channels.
- **Bot disabled group:** Slip verification still works, but invoice Flex sent as simple format (no LIFF buttons).

---

## 11. Admin: Handle Claim

**Who:** Admin (web dashboard)
**Trigger:** New claim ticket appears in Service Center dashboard
**Source files:** `[Admin System] DINOCO Service Center & Claims`, `[System] DINOCO Claim System`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 11.1 | Opens Service Center | `/admin-claims/` or `[dinoco_admin_claims]` shortcode | Dashboard shows: all claim tickets with filters by status, search, sorting. Pipeline view of ticket statuses |
| 11.2 | Reviews new ticket | Clicks on ticket row | Ticket detail view: ticket code, customer info (name, phone, address snapshot), product info (model, SKU, serial, warranty status at time of claim), problem type, customer notes, evidence images (5 photos: front, back, left, right, defect) |
| 11.3a | **For repair tickets (CLM-):** Updates status to "Received at Company" | Status dropdown/button | `ticket_status` ACF hook fires: auto-logs status change with timestamp in `admin_internal_note`, updates `status_last_updated` |
| 11.3b | **For parts tickets (PCLM-):** Reviews issue | Evidence photos + customer description | Admin decides: approve replacement parts or reject |
| 11.4 | Adds internal notes | Admin notes textarea (`admin_internal_note`) | Notes prepended with timestamp. Visible only to admin |
| 11.5 | Selects replacement parts (if approved) | Parts selection UI (`admin_parts_selected`) | JSON record of approved parts |
| 11.6 | Updates status through repair pipeline | Status progression buttons/dropdown | **Repair path:** Registered in System --> Awaiting Customer Shipment --> In Transit to Company --> Received at Company --> Under Maintenance --> Maintenance Completed --> Repaired Item Dispatched |
| 11.7 | (For parts) Approves or rejects | Approve/Reject buttons | **Parts path:** Pending Issue Verification --> Replacement Approved --> Replacement Shipped. Or: --> Replacement Rejected by Company |
| 11.8 | Enters outbound tracking | Tracking number field (`tracking_outbound`) + courier dropdown | Saves tracking info for return shipment |
| 11.9 | Ships repaired item or replacement | Status update to "Repaired Item Dispatched" or "Replacement Shipped" | Product `w_status` reverts from `claim_process` to appropriate status (repaired, refurbished, etc.) |
| 11.10 | (Auto-close) After 30 days | N/A -- cron | `dinoco_daily_auto_close_tickets` cron: tickets in "Replacement Shipped" status for 30+ days auto-close to "Maintenance Completed". For parts tickets: restores original `w_status` from snapshot |

### Claim ticket status flow

```
Repair path:
  Registered in System
    --> Awaiting Customer Shipment (customer sends product)
    --> In Transit to Company
    --> Received at Company
    --> Under Maintenance
    --> Maintenance Completed
    --> Repaired Item Dispatched (shipped back)

Parts request path:
  Registered in System
    --> Pending Issue Verification (admin reviews)
    --> Replacement Approved --> Replacement Shipped
    OR
    --> Replacement Rejected by Company
```

### Decision points

- **Approve vs reject parts:** Admin has full discretion. Rejection sets ticket to "Replacement Rejected by Company" -- no further action.
- **Product w_status after claim:** When claim is filed, product goes to `claim_process`. When claim resolves: admin can set to `repaired`, `refurbished`, `modified`, etc. via the claim ticket.
- **Auto-close timing:** 30 days after "Replacement Shipped" status, ticket auto-closes. This handles cases where customers do not confirm receipt.

### Where can the user get stuck

- **Customer has no visibility:** After filing a claim, the member can only see the ticket code. There is no real-time status tracking page for the customer. They must contact admin for updates.
- **No notification to B2C member:** Claim status changes (B2C) do not trigger LINE push notifications because LINE Login userId ≠ Bot userId (different channels). Members must check dashboard manually. **Note:** B2B claim resolution (exchange/refund/reject) now sends Flex cards to distributor groups.
- **Evidence photo quality:** Admin reviews photos taken by the customer. If photos are insufficient, there is no in-system way to request additional photos -- must communicate outside the system.

---

## 12. Admin: Finance Dashboard + AI วิเคราะห์

**Who:** Admin (ผู้บริหาร / แอดมินบัญชี)
**Trigger:** เปิด tab "การเงิน" ใน Admin Dashboard
**Source files:** `[Admin System] DINOCO Admin Finance Dashboard` (DB_ID: 1158), `[Admin System] AI Provider Abstraction` (DB_ID: 1040)

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 12.1 | เปิด Admin Dashboard → กด tab "การเงิน" | Sidebar menu section B2B System → "การเงิน" | Shortcode `[dinoco_admin_finance]` render หน้า Finance Dashboard |
| 12.2 | (Auto) หน้าโหลด KPI + charts | 10 KPI Cards (หนี้ 5 + รายได้ 5) | AJAX `dinoco_finance_data` ดึงข้อมูลจาก distributor + b2b_order CPT — แสดง Debt Aging, Revenue Trend, Churn Warning, Pipeline, Rank Revenue, ตารางตัวแทน |
| 12.3 | เลื่อนดู KPI Cards | Row 1: หนี้ค้าง, Overdue, รอชำระ, Credit Hold, อัตราเก็บหนี้% | Row 2: รายได้วันนี้, เดือนนี้ (MoM%), ปีนี้, เก็บเงินได้, AOV |
| 12.4 | ดู Debt Aging + ตัวแทนหนี้สูงสุด | Bar chart 4 buckets (1-7, 8-30, 31-60, 60+) + ตาราง Top 15 | ตารางแสดง: ชื่อร้าน, Rank, ยอดหนี้, วงเงิน (%), สถานะ |
| 12.5 | ดู Revenue Trend + การชำระ | Area chart 6 เดือน + ตาราง 10 รายการล่าสุด | แสดงแนวโน้มรายได้ + slip payment ล่าสุด |
| 12.6 | ดูตัวแทนเงียบ (Churn Warning) | ตาราง distributors ไม่สั่ง > 30 วัน | แสดง: ร้าน, วันที่สั่งล่าสุด, จำนวนวันห่าง |
| 12.7 | ดูตารางรายได้ตัวแทน (Full Width) | ตาราง + search | แสดง: ร้าน, จังหวัด, Rank, ยอดเดือน, ยอดสะสมปี, หนี้ค้าง, สถานะ |
| 12.8 | ดูแผนที่เครือข่าย SVG Map | SVG map 77 จังหวัด + Region Tabs | Hover tooltip: จังหวัด, ตัวแทน, BigWing, ศักยภาพ BigBike. Markers: เขียว=DINOCO, น้ำเงิน=BigWing |
| 12.9 | กดเลือกภาค | Region tab buttons (7 ภาค + ทั้งประเทศ) | Map zoom เข้าภาคที่เลือก + Stats panel แสดงสรุปภาค |
| 12.10 | กด Fullscreen | ปุ่มขยายเต็มจอ | แผนที่ขยายเต็มหน้าจอ |
| 12.11 | ดู Province Coverage + คำแนะนำ | Province grid 77 จังหวัด (สีเขียว/แดง) | แสดง 7 ระดับ: critical, underperform, warning, expand, opportunity, star, future — ใช้ข้อมูลจริง (MTD, จำนวนตัวแทน, เกณฑ์ 20K) |
| 12.12 | กดปุ่ม "วิเคราะห์ AI" | ปุ่ม AI (ไม่โหลดอัตโนมัติ) | เช็ค cache `dinoco_ai_fin_v316` (1 ชม.) — ถ้า hit แสดงจาก cache, ถ้า miss เรียก Claude |
| 12.13 | (System) AI processing | Loading spinner "กำลังวิเคราะห์..." | AJAX `dinoco_finance_ai` → DINOCO_AI → Claude Sonnet 4 (max_tokens 8192, timeout 90s) → JSON 6 sections |
| 12.14 | ดูผล AI 6 sections | 6 cards แสดงผล | Overview (Score 0-100), Expansion (จังหวัดควรขยาย + BigWing note), Risks (ตัวแทนเสี่ยง + severity + action), Strategy (short/long-term + ROI), Competitors (SRC, F2MOTO, BMMOTO, MOTOSkill, H2C), Brand Sentiment (อันดับ 6 แบรนด์) |

### Decision points

- **Cache hit:** แสดงผลทันทีจาก transient — ไม่เสีย AI token
- **Cache miss + AI timeout:** แสดง error "วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่" — timeout 90s
- **ไม่มี API key:** แสดง warning "ไม่พบ API Key" + debug info

### Where can the user get stuck

- **AI timeout:** Prompt ใหญ่เกินอาจ timeout — V.3.16 ลด prompt 70% แก้ปัญหานี้
- **ข้อมูล AI = ประมาณการ:** Brand Sentiment section ใช้ AI knowledge ไม่ใช่ข้อมูลจริงจาก Brand Voice (Backlog: เชื่อมข้อมูลจริง)
- **SVG map ไม่โหลด:** ต้องอัพโหลด `thailand-provinces.svg` ไปที่ server ก่อน

---

## 13. Admin: Brand Voice Pool

**Who:** Admin (ฝ่าย Marketing / ผู้บริหาร)
**Trigger:** เปิด tab "Brand Voice" ใน Admin Dashboard
**Source files:** `[Admin System] DINOCO Brand Voice Pool` (DB_ID: 1159), `[Admin System] AI Provider Abstraction` (DB_ID: 1040)

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 13.1 | เปิด Admin Dashboard → กด tab "Brand Voice" | Sidebar menu section Marketing → "Brand Voice" | Shortcode `[dinoco_brand_voice]` render หน้า Brand Voice Pool |
| 13.2 | (Auto) Dashboard tab โหลด | Tab 1: Dashboard (default) | แสดง KPI 4 กล่อง: เสียงทั้งหมด, เชิงบวก%, เชิงลบ%, แบรนด์ที่ติดตาม |
| 13.3 | ดูเปรียบเทียบแบรนด์ | ตาราง 6 แบรนด์ + sentiment bar | DINOCO highlight สีเขียว — แสดงจำนวนเสียง + % positive/negative ต่อแบรนด์ |
| 13.4 | ดู charts | Donut: แหล่งที่มา + Bar: top 8 หมวด | Donut = Facebook/YouTube/TikTok split, Bar = quality/price/design/fitment/etc. |
| 13.5 | ระบุแหล่งที่ติดตาม | แก้ไขรายชื่อ Facebook/YouTube/TikTok groups | บันทึกลง `bv_tracked_sources` wp_option |
| 13.6 | กดปุ่ม "AI รวบรวมเสียงลูกค้า" | ปุ่ม AI | เช็ค cache `bv_last_ai_collect` (6 ชม.) — ถ้า hit แสดงจาก cache |
| 13.7 | (ถ้า cache miss) AI สร้าง entries | Loading "กำลังรวบรวม..." | Claude สร้าง 10 entries จาก knowledge ของ tracked sources + 6 แบรนด์ + 9 categories |
| 13.8 | entries ถูกบันทึก | ตาราง refresh | บันทึก `brand_voice` CPT 10 โพสต์ — `bv_entry_method = 'ai_generated'` |
| 13.9 | กด "รวบรวมใหม่" | ปุ่ม bypass cache | ลบ cache เดิม → เรียก AI ใหม่ |
| 13.10 | เปลี่ยนไป Tab 2: เสียงลูกค้า | Tab button | ตาราง entries: วันที่, แบรนด์, สรุป, ความรู้สึก, แหล่งที่มา |
| 13.11 | Filter entries | Dropdown: แบรนด์ / sentiment / platform + search box | ตาราง filter real-time |
| 13.12 | กด expand entry | คลิกแถว | แสดงข้อความเต็ม + tags + source URL + platform |
| 13.13 | สังเกต row เชิงลบ | Row highlight สีแดง + คำเตือน | entries ที่ `bv_sentiment = 'negative'` แสดงชัดเจน |
| 13.14 | เปลี่ยนไป Tab 3: เพิ่ม Manual | Tab button | Form สำหรับกรอกเสียงลูกค้าจริง |
| 13.15 | กรอกข้อมูลเสียงลูกค้าจริง | Form: แบรนด์, รุ่นรถ, platform, URL, sentiment, categories, ข้อความ | Auto-detect platform จาก URL (facebook.com → facebook_group, youtube.com → youtube) |
| 13.16 | กด submit | ปุ่ม "บันทึก" | สร้าง `brand_voice` CPT — `bv_entry_method = 'manual'` |
| 13.17 | (Optional) Batch mode | Toggle "เพิ่มหลายรายการ" | ค้าง brand/model/platform ไว้ — กรอกแค่ข้อความ + sentiment ต่อ entry |

### Decision points

- **AI entries vs Manual entries:** AI = ประมาณการจาก knowledge (ไม่มี URL), Manual = ข้อมูลจริง 100% (มี URL)
- **Cache bypass:** กด "รวบรวมใหม่" จะ bypass cache 6 ชม. — ใช้ token ใหม่
- **Categories บังคับ:** V.1.5 บังคับเลือกจาก 9 หมวดที่กำหนด (ไม่พิมพ์เอง)

### Where can the user get stuck

- **AI entries ไม่ใช่ข้อมูลจริง:** ต้องเข้าใจว่า AI สร้างจาก knowledge — ยังไม่มี web scraping จริง
- **ไม่มี Bookmarklet:** ยังไม่สามารถกดปุ่มบน Facebook แล้วเก็บข้อมูลเข้าอัตโนมัติ (Backlog Phase 2)
- **ข้อมูลน้อย:** ถ้ายังไม่มี manual entries เยอะ สถิติจะ bias จาก AI-generated data

---

## Cross-Journey Reference: Status Flows

### B2B Order Status Lifecycle

```
draft --> checking_stock --> awaiting_confirm --> awaiting_payment --> paid --> packed --> shipped --> completed
   |           |                    |                   |                                    |
   v           v                    v                   v                                    v
cancelled   backorder         cancel_requested     (slip payment)                    claim_opened
                |                    |                                                    |
                v                    v                                                    v
         (customer decides)    cancelled / restored                              claim_resolved
```

### Warranty Status Lifecycle

```
warranty_available --> warranty_on --> (normal use)
        |                |
        v                v
warranty_pending    claim_process --> repaired / refurbished / modified / void / stolen
        |
        v
   old_warranty
```

### Navigation Map (Member-Facing)

Bottom navigation bar (Global App Menu) with 5 items:
1. **Home** (`/member-dashboard/`) -- Dashboard with profile card + product inventory
2. **Claim** (`/claim-system/`) -- File warranty claims
3. **Scan** (QR scanner modal) -- Camera-based QR code scanner
4. **Transfer** (`/transfer-warranty/`) -- Transfer product ownership
5. **Profile** (`/edit-profile/`) -- Facebook-style profile (V.34.x): cover photo (moto image from MotoDB), avatar, **Mileage Rank System** (6-tier: Starter→Diamond, scored by loyalty days + product ownership + SKU set completion, rank info popup with breakdown/tips), stats grid (สินค้า + วัน), "เส้นทางของเรา" journey timeline, cascading moto dropdown from MotoDB, view/edit toggle, PDPA at bottom.

Pages protected by login check: if not logged in, redirected to `/warranty/`.

---

---

## 14. B2F: Admin Create PO to Maker

**Who:** DINOCO Admin
**Trigger:** Admin ต้องการสั่งซื้อสินค้าจากโรงงานผู้ผลิต (Maker)
**Source files:** `[B2F] Snippet 2: REST API`, `[B2F] Snippet 8: Admin LIFF E-Catalog`, `[B2F] Snippet 1: Core Utilities & Flex Builders`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 14.1 | Admin พิมพ์ "สั่งโรงงาน" ใน LINE Admin group | Text message | Bot ตอบ Flex card พร้อมปุ่ม "เปิดหน้าสั่งสินค้า" |
| 14.2 | กดปุ่ม "เปิดหน้าสั่งสินค้า" | Flex button → LIFF | เปิด LIFF `/b2f-catalog/` พร้อม HMAC sig |
| 14.3 | LIFF auth อัตโนมัติ | Loading screen | `POST /b2f/v1/auth-admin` — verify HMAC sig + LINE ID Token + WP admin check → issue JWT session |
| 14.4 | เลือก Maker จาก dropdown | Maker selector | `GET /b2f/v1/makers` → แสดงรายชื่อโรงงานทั้งหมด |
| 14.5 | ดู catalog สินค้าของ Maker | Product grid | `GET /b2f/v1/maker-products/{maker_id}` → แสดง SKU, ชื่อ, ราคาทุน, MOQ |
| 14.6 | เลือก SKU + กรอกจำนวน | Qty input per SKU | คำนวณ line total (qty × unit_cost) real-time |
| 14.7 | กด "สั่งซื้อ" | Green submit button | `POST /b2f/v1/create-po` → สร้าง PO draft → transition submitted |
| 14.8 | (อัตโนมัติ) ส่ง Flex ไป Maker group | N/A | Flex `new_po_for_maker` — แสดง item rows (B2B style) + ปุ่ม ยืนยัน/ปฏิเสธ |
| 14.9 | (อัตโนมัติ) ส่ง Flex ไป Admin group | N/A | Flex `po_created` — สรุปรายการสินค้า + มูลค่ารวม + ปุ่ม "ดูรายละเอียด PO" |
| 14.10 | เห็นหน้า success | LIFF success page | แสดง PO number + ยอดรวม + สถานะ "ส่งไป Maker แล้ว" |

### Decision points
- **Credit check:** ถ้า Maker ถูก credit hold → PO สร้างได้แต่มี warning ใน response
- **Duplicate prevention:** Transient 5 นาที ป้องกันสร้าง PO ซ้ำ (same maker + same items)
- **ทางเลือก:** สร้าง PO จาก Admin Dashboard Tab Orders ก็ได้ (ไม่ต้องผ่าน LINE)

---

## 15. B2F: Maker Confirm/Reject PO

**Who:** Maker (โรงงานผู้ผลิต)
**Trigger:** ได้รับ Flex PO ใหม่ใน LINE group
**Source files:** `[B2F] Snippet 3: Webhook Handler`, `[B2F] Snippet 2: REST API`, `[B2F] Snippet 4: Maker LIFF Pages`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 15.1 | เห็น Flex PO ใหม่ใน LINE group | Flex card `new_po_for_maker` | แสดงรายการสินค้า ยอดรวม + 3 ปุ่ม |
| 15.2a | กด "✅ ยืนยัน + เลือกวันส่ง" | Datetimepicker action | LINE เปิด date picker (min: พรุ่งนี้, max: +90 วัน) |
| 15.3a | เลือกวัน ETA | Date picker | Postback `b2f_maker_confirm` → `POST /b2f/v1/maker-confirm` → status: confirmed |
| 15.4a | (อัตโนมัติ) แจ้ง Admin | N/A | Flex `maker_confirmed` ส่ง Admin group — แสดง ETA + ชื่อ Maker |
| 15.2b | กด "❌ ปฏิเสธ" | Postback button | Bot ถาม "กรุณาพิมพ์เหตุผลที่ปฏิเสธ" (set transient pending_reject) |
| 15.3b | Maker พิมพ์เหตุผล | Text message | บันทึกเหตุผล → status: rejected → Flex `maker_rejected` ส่ง Admin group |
| 15.2c | กด "📋 ดูรายละเอียด" | Postback button | Bot ตอบ text สรุปรายการ items ทั้งหมด |

### Where can the user get stuck
- **Datetimepicker ไม่ขึ้น:** LINE version เก่าไม่รองรับ — มีทางเลือก LIFF page=confirm
- **Pending reject transient:** ถ้า Maker กดปฏิเสธแล้วไม่พิมพ์เหตุผลภายใน 5 นาที transient หมดอายุ ต้องกดปฏิเสธใหม่

---

## 16. B2F: Maker Deliver Goods

**Who:** Maker (โรงงานผู้ผลิต)
**Trigger:** Maker ส่งของมาที่ DINOCO แล้วต้องการแจ้งในระบบ
**Source files:** `[B2F] Snippet 3: Webhook Handler`, `[B2F] Snippet 2: REST API`, `[B2F] Snippet 4: Maker LIFF Pages`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 16.1 | Maker พิมพ์ "ส่งของ" หรือ @DINOCO → กดเมนู "📦 แจ้งส่งของ" | Text / Flex menu | Bot แสดง Flex carousel ของ PO ที่ส่งได้ (confirmed + partial_received) |
| 16.2 | กดปุ่ม "แจ้งส่งของ" ที่ PO ที่ต้องการ | Postback `b2f_maker_deliver` | `POST /b2f/v1/maker-deliver` → transition confirmed→delivering (หรือ partial_received→delivering) |
| 16.3 | (อัตโนมัติ) แจ้ง Admin | N/A | Flex `delivered` ส่ง Admin group (ครั้งแรก) หรือ `additional_delivery` (ส่งเพิ่ม) |
| 16.4 | Maker เห็น reply "แจ้งส่งของเรียบร้อย" | Text reply | บันทึก `po_actual_date` = วันนี้ |

### Decision points
- **ส่งครั้งแรก vs ส่งเพิ่ม:** ถ้า PO เป็น `partial_received` = ส่งเพิ่ม → Admin ได้ Flex `additional_delivery` แทน `delivered`

---

## 17. B2F: Admin Receive & Pay

**Who:** DINOCO Admin
**Trigger:** ของมาถึงแล้ว Admin ต้องตรวจรับ + จ่ายเงิน
**Source files:** `[B2F] Snippet 2: REST API`, `[B2F] Snippet 5: Admin Dashboard Tabs`, `[B2F] Snippet 7: Credit Transaction Manager`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 17.1 | เปิด Admin Dashboard → B2F → Orders tab | Dashboard sidebar | แสดง PO list filter ตาม status |
| 17.2 | กด PO ที่ status "delivering" → กด "ตรวจรับสินค้า" | Detail modal / button | เปิด form ตรวจรับ — กรอก qty_received, qty_rejected, QC status ต่อ SKU |
| 17.3 | กด "บันทึกการรับ" | Submit button | `POST /b2f/v1/receive-goods` → สร้าง `b2f_receiving` + `b2f_payable_add(received_value)` + transition received/partial_received |
| 17.4 | (อัตโนมัติ) แจ้งทุกฝ่าย | N/A | Flex `receiving` ส่ง Maker + Flex `receiving_summary` ส่ง Admin group |
| 17.5 | กด "บันทึกจ่ายเงิน" ที่ PO status "received" | Payment button | เปิด form จ่ายเงิน — กรอกจำนวน, วิธีจ่าย, ref, แนบสลิป |
| 17.6 | กด "บันทึก" | Submit button | `POST /b2f/v1/record-payment` → สร้าง `b2f_payment` + `b2f_payable_subtract(amount)` |
| 17.7 | (อัตโนมัติ) แจ้ง Maker | N/A | Flex `payment` ส่ง Maker |
| 17.8 | (ถ้าจ่ายครบ) PO auto-complete | N/A | transition paid→completed → Flex `po_completed` ส่ง Admin + Maker |

### Decision points
- **Partial receive:** ถ้า qty_received < qty_ordered → status: partial_received → Maker ส่งเพิ่มได้
- **Reject lot:** ถ้าสินค้าทั้ง lot ไม่ผ่าน QC → `POST /b2f/v1/reject-lot` → status กลับ confirmed → Flex `lot_rejected` ส่ง Maker
- **ของฟรี/sample:** `POST /b2f/v1/po-complete` → ปิด PO โดยไม่จ่ายเงิน
- **Credit hold:** ถ้า debt >= credit_limit → auto credit hold → Flex `credit_hold` ส่ง Maker

---

## 18. B2B: Walk-in Order (ร้านหน้าโกดัง)

**Who:** ร้านตัวแทนหน้าโกดัง (distributor ที่เปิด `is_walkin = true`) -- ปัจจุบันมี 2 ร้าน
**Trigger:** เหมือนปกติ -- พิมพ์ "สั่งของ" ใน LINE group หรือเปิด LIFF catalog
**Source files:** `[B2B] Snippet 1: Core Utilities`, `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `[B2B] Snippet 9: Admin Control`, `[B2B] Snippet 14: Order State Machine`

### Step-by-step flow

| Step | User Action | UI Element | System Response |
|------|-------------|------------|-----------------|
| 18.1 | พิมพ์ "สั่งของ" ใน LINE group | LINE chat text input | เหมือน Journey 5 -- ส่ง LIFF catalog link Flex card |
| 18.2 | เปิด LIFF catalog + เลือกสินค้า | LIFF E-Catalog UI | เหมือน Journey 5 (Step 5.3-5.10) |
| 18.3 | ยืนยันส่งออเดอร์ | "Confirm Order" button | สร้าง `b2b_order` status `draft` + stamp `_b2b_is_walkin=1` |
| 18.4 | กดยืนยันบน Flex card (confirm_order) | LINE postback | **ต่างจากปกติ:** ระบบตรวจ `b2b_is_walkin_order()` → ข้ามเช็คสต็อก → status `draft` → `awaiting_confirm` โดยตรง (ไม่ผ่าน `checking_stock`) |
| 18.5 | ลูกค้ายืนยันบิล (confirm_bill) | LINE postback | เหมือนปกติ -- เพิ่มหนี้ + สร้าง Invoice + ส่ง Flex แจ้งยอด |
| 18.6 | ส่งสลิปชำระเงิน | ส่งรูปสลิปใน LINE group | เหมือน Journey 7 -- Slip2Go verify + ตัดหนี้ + mark `paid` |
| 18.7 | (อัตโนมัติ) Auto-complete | N/A | Hook `b2b_order_status_changed` → `b2b_walkin_auto_complete()` ตรวจ `_b2b_is_walkin=1` → status `paid` → `completed` ทันที (ข้ามเลือกวิธีส่ง) |
| 18.8 | ลูกค้ารับแจ้ง order completed | Flex card ใน LINE group | Flex แจ้ง "ออเดอร์เสร็จสิ้น" |

### ความแตกต่างจาก Journey 5 (B2B: Place Order ปกติ)

| จุดที่ต่าง | ปกติ (Journey 5) | Walk-in (Journey 18) |
|-----------|------------------|----------------------|
| ยืนยัน order | `draft` → `checking_stock` → Admin เช็ค → `awaiting_confirm` | `draft` → `awaiting_confirm` (skip stock check) |
| หลังจ่ายเงิน | `paid` → Admin เลือกวิธีส่ง → `packed`/`shipped` → `completed` | `paid` → **auto** `completed` (skip shipping) |
| Shipping Choice Flex | Admin ได้รับ Flex เลือก Flash/ส่งเอง/Rider/มารับเอง | ไม่ส่ง Shipping Choice Flex |
| ระยะเวลา | 1-3 วัน (รอจัดส่ง+ขนส่ง) | ทันที (ลูกค้ามารับของเอง) |

### Decision points

- **Walk-in flag มาจากไหน:** ระบบตรวจ `is_walkin` field บน distributor CPT ตอน confirm order + stamp `_b2b_is_walkin=1` บน order เพื่อ lock ค่าไว้ (ป้องกันเปลี่ยน flag หลังสั่ง)
- **ชำระเงินหลายรอบ (partial):** ทำงานได้เหมือนปกติ -- auto-complete trigger เมื่อ status เปลี่ยนเป็น `paid`
- **Cancel request:** ทำงานได้เหมือนปกติ -- walk-in ไม่ได้ block cancel flow
- **Admin ปิด Walk-in ทีหลัง:** order ที่ stamp `_b2b_is_walkin=1` ไปแล้วจะยังคง auto-complete ตาม flag

### Where can the user get stuck

- **ไม่ต่างจาก Journey 5 มากนัก:** เพราะ flow เหมือนกัน แค่ข้ามขั้นตอน -- UX เดิมทำงานได้
- **ไม่เห็น Shipping Choice:** ไม่ใช่ bug -- Walk-in order ข้ามขั้นตอนนี้โดยออกแบบ
- **Auto-complete เร็วมาก:** ถ้าจ่ายสลิปแล้ว order จะ completed ทันที ลูกค้าอาจสงสัยว่าทำไมเร็ว

---

## Key Files Referenced

| Journey | Primary Source Files |
|---------|-------------------|
| 1. New Member Registration | `[System] DINOCO Gateway`, `[System] LINE Callback`, `[System] Dashboard - Header & Forms` |
| 2. Warranty Registration | `[System] LINE Callback`, `[System] Dashboard - Header & Forms`, `[System] Member Dashboard Main` |
| 3. File Warranty Claim | `[System] DINOCO Claim System` |
| 4. Transfer Warranty | `[System] Transfer Warranty Page` |
| 5. B2B: Place Order | `[B2B] Snippet 2: LINE Webhook Gateway & Order Creator`, `[B2B] Snippet 4: LIFF E-Catalog Frontend` |
| 6. B2B: Check Order Status | `[B2B] Snippet 2`, `[B2B] Snippet 4` |
| 7. B2B: Pay with Slip | `[B2B] Snippet 2` |
| 8. B2B: Receive Delivery | `[B2B] Snippet 2`, `[B2B] Snippet 7: Cron Jobs` |
| 9. Admin: Process New Order | `[B2B] Snippet 2`, `[B2B] Snippet 5: Admin Dashboard` |
| 10. Admin: Create Manual Invoice | `[Admin System] DINOCO Manual Invoice System` |
| 11. Admin: Handle Claim | `[Admin System] DINOCO Service Center & Claims` |
| 12. Admin: Finance Dashboard | `[Admin System] DINOCO Admin Finance Dashboard`, `[Admin System] AI Provider Abstraction` |
| 13. Admin: Brand Voice Pool | `[Admin System] DINOCO Brand Voice Pool`, `[Admin System] AI Provider Abstraction` |
| 14. B2F: Create PO | `[B2F] Snippet 2: REST API`, `[B2F] Snippet 8: Admin LIFF E-Catalog`, `[B2F] Snippet 1: Core Utilities & Flex Builders` |
| 15. B2F: Maker Confirm/Reject | `[B2F] Snippet 3: Webhook Handler`, `[B2F] Snippet 2: REST API`, `[B2F] Snippet 4: Maker LIFF Pages` |
| 16. B2F: Maker Deliver | `[B2F] Snippet 3: Webhook Handler`, `[B2F] Snippet 2: REST API` |
| 17. B2F: Admin Receive & Pay | `[B2F] Snippet 2: REST API`, `[B2F] Snippet 5: Admin Dashboard Tabs`, `[B2F] Snippet 7: Credit Transaction Manager` |
| 18. B2B: Walk-in Order | `[B2B] Snippet 1: Core Utilities`, `[B2B] Snippet 2: LINE Webhook Gateway`, `[B2B] Snippet 9: Admin Control`, `[B2B] Snippet 14: Order State Machine` |
| Navigation | `[System] DINOCO Global App Menu` |
