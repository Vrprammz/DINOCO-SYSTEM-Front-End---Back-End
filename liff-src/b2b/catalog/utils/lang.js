/**
 * B2B LIFF E-Catalog — Language helper (V.0.2 Round 1 foundation)
 *
 * MIGRATION SOURCE: `[B2B] Snippet 4: LIFF E-Catalog Frontend` V.32.9
 *
 * Unlike B2F Maker LIFF (3 languages — TH/EN/ZH switched by maker_currency),
 * the B2B Catalog is **Thai-only**. All distributors are Thai shops on
 * Thai Bot. We expose a stub `L()` so downstream modules using the same
 * shape stay portable, but it always returns the Thai string.
 *
 * If/when B2B catalog goes multi-language (e.g. Cambodia/Laos expansion),
 * extend setupLanguage() to write a module-private `_lang` and switch
 * the L() return value.
 */

/**
 * Thai-only language gate. Returns the Thai string verbatim.
 *
 * Signature mirrors B2F maker `L(th, en, zh)` so modules can be moved
 * between surfaces without refactor. The `en` and `zh` args are ignored.
 *
 * @param {string} th - Thai string (always returned)
 * @param {string} [_en] - English fallback (ignored in B2B)
 * @param {string} [_zh] - Chinese fallback (ignored in B2B)
 * @returns {string}
 */
export function L(th, _en, _zh) {
    return th;
}

/**
 * Setup hook — no-op for B2B (Thai-only). Provided so the module API
 * stays parallel to B2F maker.
 *
 * @returns {"th"}
 */
export function setupLanguage() {
    return "th";
}

/**
 * Returns the active locale code. Always "th" for B2B catalog.
 *
 * @returns {"th"}
 */
export function getLang() {
    return "th";
}
