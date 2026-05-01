/**
 * Ambient type declarations for the LIFF runtime + DINOCO globals.
 *
 * These globals are injected at runtime by:
 *   - `window.liff` → LINE LIFF SDK (loaded via <script> from
 *     static.line-scdn.net at runtime)
 *   - `window.dinocoModal` → [Admin System] DINOCO Modal Helpers WP snippet
 *
 * No actual implementation lives here — these declarations only inform
 * TypeScript --checkJs so JSDoc-typed code in liff-src/ doesn't trip on
 * "Property X does not exist on Window".
 */

interface LiffContext {
    type?: string;
    groupId?: string | null;
    [key: string]: any;
}

interface LiffProfile {
    userId: string;
    displayName: string;
    pictureUrl?: string;
    [key: string]: any;
}

interface LiffSDK {
    init(config: { liffId: string }): Promise<void>;
    isLoggedIn(): boolean;
    login(options?: { redirectUri?: string }): void;
    logout(): void;
    getIDToken(): string | null;
    getContext(): LiffContext | null;
    getProfile(): Promise<LiffProfile>;
    isInClient(): boolean;
    getOS(): string;
    closeWindow(): void;
    [key: string]: any;
}

interface DinocoModalAPI {
    alert(opts?: { title?: string; message?: string }): void;
    confirm(opts?: {
        title?: string;
        message?: string;
        onConfirm?: () => void;
        onCancel?: () => void;
    }): void;
    prompt?(opts?: {
        title?: string;
        message?: string;
        defaultValue?: string;
        onConfirm?: (value: string) => void;
        onCancel?: () => void;
    }): void;
    toast?(opts?: { message?: string; type?: string }): void;
}

/**
 * Per-LIFF-page bootstrap config injected by WP shortcodes.
 * Each entry file (b2b/catalog, b2f/catalog, etc.) reads its config
 * from `window.DINOCO_<SURFACE>_CONFIG`.
 */
interface DinocoLiffConfig {
    liffId?: string;
    sessionToken?: string;
    adminToken?: string;
    makerToken?: string;
    makerId?: number | string;
    authEndpoint?: string;
    [key: string]: any;
}

interface Window {
    liff?: LiffSDK;
    dinocoModal?: DinocoModalAPI;
    DINOCO_B2B_CATALOG?: DinocoLiffConfig;
    DINOCO_B2B_CATALOG_BOOT?: boolean;
    DINOCO_B2B_CATALOG_CONFIG?: DinocoLiffConfig;
    DINOCO_B2F_CATALOG_CONFIG?: DinocoLiffConfig;
    DINOCO_B2F_MAKER_CONFIG?: DinocoLiffConfig;
    DINOCO_B2F_MAKER?: any; // inline-bridge surface for Round 2-4 cleanup
    DINOCO_LIFF_AI_CONFIG?: DinocoLiffConfig;
    /** B2F Maker LIFF id — injected by Snippet 4 PHP shortcode. */
    B2F_LIFF_ID?: string;
    /** Legacy inline router fallback — Round 2 will replace with module
     *  callback. Snippet 4 inline JS still defines window.goToPage. */
    goToPage?: (page: string) => void;
}

/**
 * `liffAuth` and `createApi` attach `status` + `body` to thrown Errors
 * for caller introspection. TypeScript's lib.dom.d.ts Error doesn't
 * include these; declare the augmentation here.
 */
interface Error {
    status?: number;
    body?: any;
}
