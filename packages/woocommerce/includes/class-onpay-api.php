<?php
/**
 * OnPay API client.
 *
 * Self-contained HTTP client that communicates with the OnPay REST API using
 * the WordPress HTTP API (`wp_remote_post` / `wp_remote_get`). No external
 * dependencies required.
 *
 * @package OnPay_WooCommerce
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

/**
 * API client for the OnPay payment gateway.
 *
 * @since 0.1.0
 */
class OnPay_Api
{
    /** @var string API version header value. */
    private const API_VERSION = '2026-04-12';

    /** @var int Request timeout in seconds. */
    private const TIMEOUT_SECONDS = 30;

    /** @var string Base URL of the OnPay API (no trailing slash). */
    private string $base_url;

    /** @var string Bearer token (sk_live_ or sk_test_ key). */
    private string $api_key;

    /**
     * @param string $base_url OnPay API base URL (e.g. "https://onpay.id").
     * @param string $api_key  Merchant API key.
     */
    public function __construct(string $base_url, string $api_key)
    {
        $this->base_url = rtrim($base_url, '/');
        $this->api_key  = $api_key;
    }

    /**
     * Create a new invoice.
     *
     * @param  array{
     *     amountDecimal: string,
     *     currency: string,
     *     label?: string|null,
     *     memo?: string|null,
     * } $params Invoice creation parameters.
     * @return array<string, mixed> Parsed JSON response.
     *
     * @throws \RuntimeException On HTTP or API error.
     */
    public function create_invoice(array $params): array
    {
        return $this->post('/api/invoices', $params);
    }

    /**
     * Retrieve an invoice by ID.
     *
     * @param  string $id Invoice UUID.
     * @return array<string, mixed> Parsed JSON response.
     *
     * @throws \RuntimeException On HTTP or API error.
     */
    public function get_invoice(string $id): array
    {
        return $this->get('/api/invoices/' . urlencode($id));
    }

    // ------------------------------------------------------------------
    // Internal HTTP helpers
    // ------------------------------------------------------------------

    /**
     * Build the standard request headers.
     *
     * @return array<string, string>
     */
    private function headers(): array
    {
        return [
            'Authorization'  => 'Bearer ' . $this->api_key,
            'Content-Type'   => 'application/json',
            'OnPay-Version'  => self::API_VERSION,
            'Accept'         => 'application/json',
        ];
    }

    /**
     * Send a POST request to the OnPay API.
     *
     * @param  string               $path Relative API path (e.g. "/api/invoices").
     * @param  array<string, mixed> $body Request body (will be JSON-encoded).
     * @return array<string, mixed> Parsed JSON response.
     *
     * @throws \RuntimeException On HTTP transport error or non-2xx status.
     */
    private function post(string $path, array $body): array
    {
        $url = $this->base_url . $path;

        $response = wp_remote_post($url, [
            'headers' => $this->headers(),
            'body'    => wp_json_encode($body),
            'timeout' => self::TIMEOUT_SECONDS,
        ]);

        return $this->parse_response($response, $url);
    }

    /**
     * Send a GET request to the OnPay API.
     *
     * @param  string $path Relative API path.
     * @return array<string, mixed> Parsed JSON response.
     *
     * @throws \RuntimeException On HTTP transport error or non-2xx status.
     */
    private function get(string $path): array
    {
        $url = $this->base_url . $path;

        $response = wp_remote_get($url, [
            'headers' => $this->headers(),
            'timeout' => self::TIMEOUT_SECONDS,
        ]);

        return $this->parse_response($response, $url);
    }

    /**
     * Parse and validate a WordPress HTTP API response.
     *
     * @param  array<string, mixed>|\WP_Error $response Raw WP HTTP response.
     * @param  string                         $url      Request URL (for error context).
     * @return array<string, mixed> Decoded JSON body.
     *
     * @throws \RuntimeException On transport error, non-2xx status, or invalid JSON.
     */
    private function parse_response(array|\WP_Error $response, string $url): array
    {
        if (is_wp_error($response)) {
            throw new \RuntimeException(
                sprintf(
                    'OnPay API request to %s failed: %s',
                    $url,
                    $response->get_error_message()
                )
            );
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body   = wp_remote_retrieve_body($response);

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode($body, true);

        if (!is_array($decoded)) {
            throw new \RuntimeException(
                sprintf(
                    'OnPay API returned invalid JSON (HTTP %d) from %s',
                    $status,
                    $url
                )
            );
        }

        if ($status < 200 || $status >= 300) {
            $message = $decoded['message'] ?? $decoded['error'] ?? 'Unknown error';
            throw new \RuntimeException(
                sprintf(
                    'OnPay API error (HTTP %d) from %s: %s',
                    $status,
                    $url,
                    is_string($message) ? $message : wp_json_encode($message)
                )
            );
        }

        return $decoded;
    }
}
