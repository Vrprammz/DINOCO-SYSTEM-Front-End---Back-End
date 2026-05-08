/**
 * tests/e2e/helpers/liff-mock.ts — R4 BLOCKER #4 LIFF SDK shim
 *
 * Mocks `window.liff` for E2E tests. Real LINE OAuth flow is impractical
 * in CI (requires LINE app + manual scan). This shim:
 *   - Stubs `liff.init/login/getProfile/getIDToken/getAccessToken`
 *   - Drives the customer-facing flows (warranty activate / claim
 *     autofill / extension checkout) without LINE servers
 *   - Mimics the response shape of LIFF SDK v2.21+
 *
 * Inject via `await page.addInitScript({ path: ... })` BEFORE navigation,
 * or via `await injectLiffMock(page, profile)` helper below.
 *
 * Production code MUST always check `typeof liff !== 'undefined'` before
 * calling — this shim ensures that check passes inside Playwright but
 * production never depends on the shim.
 */

import type { Page } from '@playwright/test';

export interface LiffMockProfile {
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
}

export interface LiffMockOptions {
    profile: LiffMockProfile;
    idToken?: string;
    accessToken?: string;
    isInClient?: boolean;
    isLoggedIn?: boolean;
    os?: 'ios' | 'android' | 'web';
    language?: string;
    liffId?: string;
    /**
     * If true, `liff.init` rejects — useful for testing fallback paths.
     */
    initFails?: boolean;
}

/**
 * Default test profile for LIFF flows. Matches `users.customer_with_line`
 * in `tests/e2e/fixtures/test-data.json`.
 */
export const DEFAULT_LIFF_PROFILE: LiffMockProfile = {
    userId: 'Ue2etest0001line0001',
    displayName: 'E2E Test Customer',
    pictureUrl: 'https://placehold.co/200x200/png?text=E2E',
    statusMessage: 'Playwright SN smoke',
};

/**
 * Inject `window.liff` shim into the page. Call BEFORE `page.goto(...)`.
 *
 * @example
 *   await injectLiffMock(page, { profile: DEFAULT_LIFF_PROFILE });
 *   await page.goto('/warranty/activate?sn=DNCSSTEST00000001');
 */
export async function injectLiffMock(
    page: Page,
    options: Partial<LiffMockOptions> = {}
): Promise<void> {
    const opts: LiffMockOptions = {
        profile: options.profile || DEFAULT_LIFF_PROFILE,
        idToken: options.idToken || 'mock_id_token_e2e_smoke',
        accessToken: options.accessToken || 'mock_access_token_e2e_smoke',
        isInClient: options.isInClient !== false,
        isLoggedIn: options.isLoggedIn !== false,
        os: options.os || 'ios',
        language: options.language || 'th',
        liffId: options.liffId || '0000000000-MockLiffId',
        initFails: options.initFails === true,
    };

    await page.addInitScript((mockOpts: LiffMockOptions) => {
        // Build a LIFF SDK shim that mimics v2.21 surface.
        const liff = {
            _state: {
                initialized: false,
                loggedIn: mockOpts.isLoggedIn,
                profile: mockOpts.profile,
                idToken: mockOpts.idToken,
                accessToken: mockOpts.accessToken,
            },
            init: function (config: { liffId: string }): Promise<void> {
                return new Promise((resolve, reject) => {
                    if (mockOpts.initFails) {
                        reject(new Error('LIFF init failed (mock)'));
                        return;
                    }
                    this._state.initialized = true;
                    setTimeout(resolve, 10);
                });
            },
            isLoggedIn: function (): boolean {
                return this._state.loggedIn;
            },
            isInClient: function (): boolean {
                return mockOpts.isInClient!;
            },
            getOS: function (): string {
                return mockOpts.os!;
            },
            getLanguage: function (): string {
                return mockOpts.language!;
            },
            getVersion: function (): string {
                return '2.21.0-mock';
            },
            getLineVersion: function (): string {
                return '13.5.0-mock';
            },
            getProfile: function (): Promise<LiffMockProfile> {
                if (!this._state.loggedIn) {
                    return Promise.reject(new Error('Not logged in'));
                }
                return Promise.resolve(this._state.profile);
            },
            getIDToken: function (): string | null {
                return this._state.loggedIn ? this._state.idToken : null;
            },
            getAccessToken: function (): string | null {
                return this._state.loggedIn ? this._state.accessToken : null;
            },
            getDecodedIDToken: function (): object | null {
                return this._state.loggedIn
                    ? {
                          iss: 'https://access.line.me',
                          sub: this._state.profile.userId,
                          name: this._state.profile.displayName,
                          aud: mockOpts.liffId,
                          exp: Math.floor(Date.now() / 1000) + 3600,
                          iat: Math.floor(Date.now() / 1000),
                      }
                    : null;
            },
            login: function (params?: { redirectUri?: string }): void {
                this._state.loggedIn = true;
                if (params?.redirectUri) {
                    window.location.href = params.redirectUri;
                }
            },
            logout: function (): void {
                this._state.loggedIn = false;
            },
            closeWindow: function (): void {
                /* no-op in E2E — would close LIFF window in real LINE app */
            },
            sendMessages: function (): Promise<void> {
                return Promise.resolve();
            },
            shareTargetPicker: function (): Promise<{ status: string }> {
                return Promise.resolve({ status: 'success' });
            },
            scanCodeV2: function (): Promise<{ value: string }> {
                return Promise.resolve({ value: 'mock-qr-payload' });
            },
            permanentLink: {
                createUrlBy: function (url: string): Promise<string> {
                    return Promise.resolve(url);
                },
            },
        };

        // Attach to window. Production code calls `liff.init({...})`.
        (window as any).liff = liff;

        // Marker for assertions: tests can check `window.__liffMockInjected`.
        (window as any).__liffMockInjected = true;
    }, opts);
}

/**
 * Convenience: inject mock + wait for any in-page `liff.init` to resolve.
 * Use when the page calls `liff.init` automatically on load.
 */
export async function injectLiffMockAndWait(
    page: Page,
    options: Partial<LiffMockOptions> = {}
): Promise<void> {
    await injectLiffMock(page, options);
    await page.waitForFunction(
        () => (window as any).__liffMockInjected === true,
        null,
        { timeout: 5000 }
    );
}

/**
 * Mock the WP REST API endpoints called by LIFF surfaces. Use sparingly —
 * prefer real staging API calls so the smoke gate exercises the full
 * stack. Only use mocking when staging is unavailable (offline CI).
 */
export async function mockSnRestApi(
    page: Page,
    fixtures: Record<string, unknown>
): Promise<void> {
    await page.route('**/wp-json/dinoco-sn/v1/lookup/**', async (route) => {
        const url = route.request().url();
        const sn = url.split('/').pop()?.split('?')[0] || '';
        const fixture = (fixtures as any)[sn];
        if (fixture) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(fixture),
            });
        } else {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'sn_not_found' }),
            });
        }
    });
}
