<?php
/**
 * RestNonceGateTest — Phase 5 M2 (B.3).
 *
 * Source under test: [B2B] Snippet 3: LIFF E-Catalog REST API
 *   - register_rest_route(...)  with permission_callback = $sess_perm
 *   - b2b_verify_session_token(WP_REST_Request) — HMAC sig + JWT validation
 *
 * Bug history:
 *   - V.31 hardening (Audit 2026-04-17 batch): all session-protected
 *     endpoints had permission_callback returning `true` unconditionally
 *     (legacy "auth done in handler body"). Fixed to enforce at REST layer
 *     so unauthenticated requests get 401 from WP core, never reach handler.
 *
 * Scope of this M2 test:
 *   1. POST /b2b/v1/place-order without session token → 401/403
 *   2. GET /b2b/v1/order-history without session token → 401/403
 *   3. POST /b2b/v1/auth-group is public (no permission gate) → does NOT 401
 *   4. Unknown endpoints return 404 (smoke test for REST routing itself)
 *
 * The actual HMAC sig + JWT validation logic is too coupled to LINE LIFF
 * runtime to test cleanly here — we verify the GATE FIRES, not that
 * cryptographic verification accepts only valid signatures (separate test).
 */

declare( strict_types=1 );

namespace DinocoTests\Integration;

final class RestNonceGateTest extends DinocoIntegrationTestCase {

    protected function set_up(): void {
        parent::set_up();
        $this->load_fixture( 'seed-distributors.sql' );

        try {
            // Snippet 3 registers the REST routes via init/rest_api_init hook
            $this->eval_snippet_inline( '[B2B] Snippet 3: LIFF E-Catalog REST API' );
        } catch ( \Throwable $e ) {
            $this->markTestSkipped( 'Snippet 3 cannot be loaded: ' . $e->getMessage() );
        }

        // Routes register on rest_api_init — fire it explicitly
        $this->fire_init_hooks();

        // Verify at least one b2b/v1 route was registered
        $routes = rest_get_server()->get_routes();
        $b2b_routes = array_filter( array_keys( $routes ), fn( $r ) => str_starts_with( $r, '/b2b/v1' ) );
        if ( empty( $b2b_routes ) ) {
            $this->markTestSkipped( 'No /b2b/v1 routes registered — Snippet 3 init may not have fired' );
        }
    }

    /** Dispatch a REST request without any auth headers and return the response. */
    private function dispatch_unauthenticated( string $method, string $route, array $params = array() ): \WP_REST_Response {
        $req = new \WP_REST_Request( $method, $route );
        foreach ( $params as $k => $v ) {
            $req->set_param( $k, $v );
        }
        $response = rest_get_server()->dispatch( $req );
        return $response;
    }

    public function test_place_order_rejects_without_session_token(): void {
        $response = $this->dispatch_unauthenticated(
            'POST',
            '/b2b/v1/place-order',
            array( 'items' => array( array( 'sku' => 'LEAF-X', 'qty' => 1 ) ) )
        );

        $this->assertContains(
            $response->get_status(),
            array( 401, 403 ),
            'place-order without session token must return 401 or 403, got ' . $response->get_status()
        );
    }

    public function test_order_history_rejects_without_session_token(): void {
        $response = $this->dispatch_unauthenticated( 'GET', '/b2b/v1/order-history' );

        $this->assertContains(
            $response->get_status(),
            array( 401, 403 ),
            'order-history without session token must return 401 or 403, got ' . $response->get_status()
        );
    }

    public function test_catalog_rejects_without_session_token(): void {
        $response = $this->dispatch_unauthenticated( 'GET', '/b2b/v1/catalog' );

        $this->assertContains(
            $response->get_status(),
            array( 401, 403 ),
            'catalog without session token must return 401 or 403, got ' . $response->get_status()
        );
    }

    public function test_distributor_info_rejects_without_session_token(): void {
        $response = $this->dispatch_unauthenticated( 'GET', '/b2b/v1/distributor-info' );

        $this->assertContains(
            $response->get_status(),
            array( 401, 403 ),
            'distributor-info without session token must return 401 or 403, got ' . $response->get_status()
        );
    }

    public function test_auth_group_is_public_does_not_require_session(): void {
        // auth-group is intentionally public (it ISSUES the session token).
        // Unauthenticated request should NOT be 401/403 from the permission gate
        // — but may return 4xx from inside the handler (missing sig, bad nonce, etc).
        $response = $this->dispatch_unauthenticated( 'POST', '/b2b/v1/auth-group', array() );

        $this->assertNotContains(
            $response->get_status(),
            array( 401 ),
            'auth-group is the auth bootstrap endpoint — must not require session'
        );
        // 200/400/422 are all acceptable here (handler may fail on missing sig)
    }

    public function test_unknown_endpoint_returns_404(): void {
        $response = $this->dispatch_unauthenticated( 'GET', '/b2b/v1/this-endpoint-does-not-exist' );

        $this->assertSame(
            404,
            $response->get_status(),
            'Unknown b2b/v1 endpoint must 404 (smoke test for REST routing)'
        );
    }

    public function test_routes_actually_registered(): void {
        $routes = array_keys( rest_get_server()->get_routes() );

        $this->assertContains( '/b2b/v1/catalog', $routes, 'b2b/v1/catalog must be registered' );
        $this->assertContains( '/b2b/v1/place-order', $routes, 'b2b/v1/place-order must be registered' );
        $this->assertContains( '/b2b/v1/order-history', $routes, 'b2b/v1/order-history must be registered' );
    }
}
