/**
 * LIFF AI Frontend — Language helpers (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[LIFF AI] Snippet 2: Frontend` V.3.8
 *   Source location: inline `<script>` block — Thai-only literals throughout.
 *
 * Pattern: LIFF AI is Thai-only (unlike B2B/B2F which switch on currency).
 *   The `L(th, en)` helper exists for parity with the other LIFF surfaces
 *   so renderer code can call `L("...", "...")` defensively, but it always
 *   returns the Thai variant. Future i18n (e.g., English admin) can flip
 *   `_lang` via `setLang("en")` without renderer rewrites.
 */

/** @type {"th"|"en"} */
let _lang = "th";

/**
 * Read current language code.
 *
 * @returns {"th"|"en"}
 */
export function getLang() {
    return _lang;
}

/**
 * Force language explicitly. Production stays "th"; tests use this to verify
 * the L() fallback path.
 *
 * @param {"th"|"en"} lang
 */
export function setLang(lang) {
    if (lang === "en") _lang = "en";
    else _lang = "th";
}

/**
 * Reset to Thai default — testing only.
 */
export function _resetLangForTests() {
    _lang = "th";
}

/**
 * 2-language picker. Returns Thai by default; falls back to Thai when English
 * label missing (still safer than returning undefined to renderer).
 *
 * Signature mirrors the 3-arg `L()` shape used in B2F maker / B2F catalog —
 * the third argument (zh) is accepted but ignored so renderer code can be
 * copy-pasted between LIFF surfaces.
 *
 * @param {string} th
 * @param {string} [en]
 * @param {string} [_zh] - ignored, accepted for cross-surface signature parity
 * @returns {string}
 */
export function L(th, en, _zh) {
    if (_lang === "en") return en || th;
    return th;
}
