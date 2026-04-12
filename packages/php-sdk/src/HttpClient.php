<?php

declare(strict_types=1);

namespace OnPay;

use OnPay\Exceptions\OnPayException;

/**
 * Minimal cURL-based HTTP client for the OnPay API.
 *
 * Handles authentication headers, JSON serialization, API versioning,
 * idempotency keys, and maps non-2xx responses to {@see OnPayException}.
 *
 * @internal Used by resource classes; not part of the public SDK surface.
 */
class HttpClient
{
    /** @var string API version sent with every request. */
    private const API_VERSION = '2026-04-12';

    /** @var int Connection + transfer timeout in seconds. */
    private const TIMEOUT_SECONDS = 30;

    /**
     * @param string $apiKey  Bearer token for Authorization header.
     * @param string $baseUrl Base URL of the OnPay API (no trailing slash).
     */
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl,
    ) {
    }

    /**
     * Send a GET request to the API.
     *
     * @param string               $path   URL path relative to baseUrl (e.g. "/api/invoices").
     * @param array<string, mixed> $query  Optional query string parameters.
     *
     * @return array<string, mixed> Decoded JSON response body.
     *
     * @throws OnPayException On non-2xx responses.
     */
    public function get(string $path, array $query = []): array
    {
        $url = $this->buildUrl($path, $query);

        return $this->request('GET', $url);
    }

    /**
     * Send a POST request to the API.
     *
     * @param string               $path           URL path relative to baseUrl.
     * @param array<string, mixed> $params         Request body parameters (JSON-encoded).
     * @param string|null          $idempotencyKey  Optional idempotency key header value.
     *
     * @return array<string, mixed> Decoded JSON response body.
     *
     * @throws OnPayException On non-2xx responses.
     */
    public function post(string $path, array $params, ?string $idempotencyKey = null): array
    {
        $url = $this->buildUrl($path);
        $headers = [];
        if ($idempotencyKey !== null) {
            $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
        }

        return $this->request('POST', $url, $params, $headers);
    }

    /**
     * Send a DELETE request to the API.
     *
     * @param string $path URL path relative to baseUrl.
     *
     * @return array<string, mixed> Decoded JSON response body.
     *
     * @throws OnPayException On non-2xx responses.
     */
    public function delete(string $path): array
    {
        $url = $this->buildUrl($path);

        return $this->request('DELETE', $url);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Build the full URL from base, path, and optional query parameters.
     *
     * @param string               $path  URL path segment.
     * @param array<string, mixed> $query Query parameters.
     *
     * @return string Fully-qualified URL.
     */
    private function buildUrl(string $path, array $query = []): string
    {
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($path, '/');

        if ($query !== []) {
            $url .= '?' . http_build_query($query);
        }

        return $url;
    }

    /**
     * Execute a cURL request and return the decoded JSON body.
     *
     * @param string               $method       HTTP method.
     * @param string               $url          Full request URL.
     * @param array<string, mixed> $body         Request body (only for POST/PUT/PATCH).
     * @param list<string>         $extraHeaders Additional headers.
     *
     * @return array<string, mixed> Decoded JSON response.
     *
     * @throws OnPayException On non-2xx status or cURL failure.
     */
    private function request(string $method, string $url, array $body = [], array $extraHeaders = []): array
    {
        $ch = curl_init();

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'OnPay-Version: ' . self::API_VERSION,
            'Content-Type: application/json',
            'Accept: application/json',
            ...$extraHeaders,
        ];

        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_CUSTOMREQUEST  => $method,
        ]);

        if ($method === 'POST' && $body !== []) {
            $encoded = json_encode($body, JSON_THROW_ON_ERROR);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $encoded);
        }

        $responseBody = curl_exec($ch);
        $httpCode     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError    = curl_error($ch);
        $curlErrno    = curl_errno($ch);

        curl_close($ch);

        if ($curlErrno !== 0) {
            throw new OnPayException(
                statusCode: 0,
                errorCode: 'NETWORK_ERROR',
                errorMessage: 'cURL error: ' . $curlError,
            );
        }

        if (!is_string($responseBody)) {
            throw new OnPayException(
                statusCode: $httpCode,
                errorCode: 'NETWORK_ERROR',
                errorMessage: 'Empty response from server',
            );
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            throw OnPayException::fromResponse($httpCode, $responseBody);
        }

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode($responseBody, true);

        if (!is_array($decoded)) {
            throw new OnPayException(
                statusCode: $httpCode,
                errorCode: 'INVALID_RESPONSE',
                errorMessage: 'Response body is not valid JSON',
            );
        }

        return $decoded;
    }
}
