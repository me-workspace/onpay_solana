<?php

declare(strict_types=1);

namespace OnPay\Resources;

use OnPay\HttpClient;

/**
 * Invoices resource.
 *
 * Provides methods to create, retrieve, and list payment invoices via the
 * OnPay API. Each invoice contains a Solana Pay URL ready for QR rendering.
 */
class Invoices
{
    /**
     * @param HttpClient $client HTTP client instance.
     */
    public function __construct(
        private readonly HttpClient $client,
    ) {
    }

    /**
     * Create a new invoice.
     *
     * Required params:
     *   - amountDecimal (string) — decimal amount, e.g. "10.00"
     *   - currency      (string) — 3-8 char currency code, default "USD"
     *
     * Optional params:
     *   - label (string|null) — up to 200 chars
     *   - memo  (string|null) — up to 500 chars
     *
     * @param array<string, mixed> $params         Invoice creation parameters.
     * @param string|null          $idempotencyKey  Optional idempotency key for safe retries.
     *
     * @return array{
     *     id: string,
     *     reference: string,
     *     merchantId: string,
     *     amount: array{raw: string, formatted: string, currency: string, decimals: int},
     *     label: string|null,
     *     memo: string|null,
     *     status: string,
     *     expiresAt: string,
     *     createdAt: string,
     *     paymentUrl: string,
     * }
     */
    public function create(array $params, ?string $idempotencyKey = null): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->post('/api/invoices', $params, $idempotencyKey);

        return $result;
    }

    /**
     * Retrieve a single invoice by ID.
     *
     * If the invoice is still pending, the server may perform lazy on-chain
     * confirmation and flip the status to "paid" before responding.
     *
     * @param string $id Invoice UUID.
     *
     * @return array{
     *     id: string,
     *     reference: string,
     *     merchantId: string,
     *     amount: array{raw: string, formatted: string, currency: string, decimals: int},
     *     label: string|null,
     *     memo: string|null,
     *     status: string,
     *     expiresAt: string,
     *     createdAt: string,
     *     paymentUrl: string,
     * }
     */
    public function retrieve(string $id): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->get('/api/invoices/' . urlencode($id));

        return $result;
    }

    /**
     * List invoices for the authenticated merchant.
     *
     * Supported query params:
     *   - status (string) — filter by "pending", "paid", "expired", or "failed"
     *   - limit  (int)    — 1-100, default 20
     *   - offset (int)    — pagination offset, default 0
     *
     * @param array<string, mixed> $params Query parameters.
     *
     * @return array{
     *     invoices: list<array{
     *         id: string,
     *         reference: string,
     *         merchantId: string,
     *         amount: array{raw: string, formatted: string, currency: string, decimals: int},
     *         label: string|null,
     *         memo: string|null,
     *         status: string,
     *         expiresAt: string,
     *         createdAt: string,
     *         paymentUrl: string,
     *     }>,
     *     limit: int,
     *     offset: int,
     * }
     */
    public function list(array $params = []): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->get('/api/invoices', $params);

        return $result;
    }
}
