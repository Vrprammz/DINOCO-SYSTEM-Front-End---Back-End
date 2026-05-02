/**
 * B2F LIFF Admin E-Catalog — Submit Review Gate (V.0.3 Round 2)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.14
 *   - line 1407 openReviewGate()           — 3-bucket accordion build
 *   - line 1513 bindReviewTablistA11y()    — kept as inline helper for
 *                                            event delegation (Round 3
 *                                            wires it).
 *
 * V.7.0 Order Intent — Submit Review Gate (Screen 5):
 *   Three buckets keyed off `cart[sku].order_mode`:
 *     🟣 full_set    (default open)
 *     🟠 sub_unit    (default open)
 *     ⚪ single_leaf (default closed)
 *   Empty buckets are omitted entirely (visible-buckets list).
 *
 * V.7.11 a11y: WAI-ARIA tabs pattern with arrow-key + Home/End nav.
 *   The keyboard handler stays in the inline event-delegation module
 *   (Round 3) — this builder emits the proper roles + IDs.
 *
 * Pure HTML builder. Does not mutate DOM.
 */

import { escHtml, formatNumber, currencySymbol } from "../utils/format.js";

const BUCKET_CONFIGS = [
    { key: "full_set", icon: "🟣", label: "ชุดเต็ม", unit: "ชุด", defaultOpen: true },
    { key: "sub_unit", icon: "🟠", label: "แยกชุด", unit: "ชุด", defaultOpen: true },
    {
        key: "single_leaf",
        icon: "⚪",
        label: "ชิ้นเดี่ยว",
        unit: "ชิ้น",
        defaultOpen: false,
    },
];

/**
 * Render the Review Gate body content.
 *
 * @param {Record<string, Object>} cart
 * @param {{
 *   currency?: string,
 *   maker?: { name?: string, id?: number|string },
 *   bucketConfigs?: typeof BUCKET_CONFIGS
 * }} [opts]
 * @returns {{ html: string, visibleBuckets: string[], grandTotal: number, empty: boolean }}
 */
export function renderReviewGate(cart, opts = {}) {
    const skus = Object.keys(cart || {});
    if (!skus.length) {
        return { html: "", visibleBuckets: [], grandTotal: 0, empty: true };
    }

    const currency = opts.currency || "THB";
    const csym = currencySymbol(currency);
    const configs = Array.isArray(opts.bucketConfigs) ? opts.bucketConfigs : BUCKET_CONFIGS;

    // Group by order_mode
    const buckets = { full_set: [], sub_unit: [], single_leaf: [] };
    skus.forEach((s) => {
        const c = cart[s];
        const mode = c.order_mode || "single_leaf";
        if (!buckets[mode]) buckets[mode] = [];
        buckets[mode].push(c);
    });

    let html = "";
    if (opts.maker && opts.maker.name) {
        html +=
            '<div style="font-size:14px;font-weight:700;color:var(--b2f-text);margin-bottom:12px;">📦 ' +
            escHtml(opts.maker.name) +
            "</div>";
    }

    let grandTotal = 0;
    const visibleBuckets = [];
    let bucketsHtml = "";

    configs.forEach((cfg) => {
        const items = buckets[cfg.key] || [];
        if (!items.length) return;
        visibleBuckets.push(cfg.key);
        let bucketTotal = 0;
        let bucketCount = 0;
        items.forEach((c) => {
            bucketTotal += c.unit_cost * c.qty;
            bucketCount += c.qty;
        });
        grandTotal += bucketTotal;

        const expanded = cfg.defaultOpen ? " expanded" : "";
        const bodyShow = cfg.defaultOpen ? " show" : "";
        const ariaExpanded = cfg.defaultOpen ? "true" : "false";
        const ariaSelected = cfg.defaultOpen ? "true" : "false";
        const tabIdx = cfg.defaultOpen ? "0" : "-1";
        const hidden = cfg.defaultOpen ? "" : " hidden";
        const tabId = "b2fReviewTab_" + cfg.key;
        const panelId = "b2fReviewPanel_" + cfg.key;

        bucketsHtml +=
            '<div class="b2f-cat-review-bucket" data-bucket-key="' +
            escHtml(cfg.key) +
            '">' +
            '<div class="b2f-cat-review-bucket-hdr' +
            expanded +
            '" role="tab" id="' +
            tabId +
            '" aria-controls="' +
            panelId +
            '" aria-selected="' +
            ariaSelected +
            '" aria-expanded="' +
            ariaExpanded +
            '" tabindex="' +
            tabIdx +
            '" data-bucket-tab="' +
            escHtml(cfg.key) +
            '">' +
            '<span class="b2f-cat-review-bucket-arrow" aria-hidden="true">▶</span> ' +
            cfg.icon +
            " " +
            escHtml(cfg.label) +
            ": " +
            bucketCount +
            " " +
            escHtml(cfg.unit) +
            '<span style="margin-left:auto;font-weight:800;">' +
            csym +
            formatNumber(bucketTotal) +
            "</span>" +
            "</div>" +
            '<div class="b2f-cat-review-bucket-body' +
            bodyShow +
            '" role="tabpanel" id="' +
            panelId +
            '" aria-labelledby="' +
            tabId +
            '" tabindex="0"' +
            hidden +
            ">";

        items.forEach((c) => {
            bucketsHtml +=
                '<div class="b2f-cat-review-bucket-item">' +
                "<span>" +
                escHtml(c.product_name || c.sku) +
                " x" +
                c.qty +
                "</span>" +
                "<span>" +
                csym +
                formatNumber(c.unit_cost * c.qty) +
                "</span>" +
                "</div>";
            if (c.intent_notes) {
                bucketsHtml +=
                    '<div class="b2f-cat-intent-note-display">' +
                    escHtml(c.intent_notes) +
                    "</div>";
            }
        });
        bucketsHtml += "</div></div>";
    });

    if (bucketsHtml) {
        html +=
            '<div role="tablist" aria-label="ตรวจสอบรายการตามโหมด" aria-orientation="vertical" data-review-tablist="1">' +
            bucketsHtml +
            "</div>";
    }
    html +=
        '<div class="b2f-cat-review-total" role="status" aria-live="polite">' +
        "<span>รวม</span>" +
        '<span style="color:var(--b2f-accent);">' +
        csym +
        formatNumber(grandTotal) +
        "</span></div>";

    return { html, visibleBuckets, grandTotal, empty: false };
}

export { BUCKET_CONFIGS };
