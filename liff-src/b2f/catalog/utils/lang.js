/**
 * B2F LIFF Admin E-Catalog — Language helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2F] Snippet 8: Admin LIFF E-Catalog` V.7.13
 *
 * The B2F catalog is multi-language driven by the **maker's** currency
 * (mirrors B2F Maker LIFF V.4.6):
 *   - THB → "th" (Thai, default — DINOCO admin browsing Thai factories)
 *   - USD → "en"
 *   - CNY → "zh"
 *
 * The B2F Maker `lang.js` already implements this exact pattern. To keep
 * these surfaces in lockstep (a translation drift between Maker LIFF and
 * Admin Catalog would confuse multilingual factories), we **re-export**
 * the Maker module verbatim. Round 2+ page renderers can import from
 * either path; behaviour is identical.
 *
 * If/when B2F catalog needs catalog-specific labels that Maker LIFF does
 * not, fork this file and add them — but leave the core
 * `setupLanguage / L / getLang / setLang` API symmetric.
 */

export {
    setupLanguage,
    getLang,
    setLang,
    L,
    STATUS_TH,
    STATUS_EN,
    STATUS_ZH,
    statusLabel,
} from "../../maker/utils/lang.js";
