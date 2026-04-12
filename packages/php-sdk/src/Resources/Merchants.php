<?php

declare(strict_types=1);

namespace OnPay\Resources;

use OnPay\HttpClient;

/**
 * Merchants resource.
 *
 * Provides methods to retrieve and update the authenticated merchant's
 * profile. The merchant is identified via the API key / session.
 */
class Merchants
{
    /**
     * @param HttpClient $client HTTP client instance.
     */
    public function __construct(
        private readonly HttpClient $client,
    ) {
    }

    /**
     * Retrieve the authenticated merchant's profile.
     *
     * @return array{
     *     id: string,
     *     walletAddress: string,
     *     businessName: string|null,
     *     settlementMint: string,
     *     preferredLanguage: string,
     *     createdAt: string,
     *     updatedAt: string,
     * }
     */
    public function retrieve(): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->get('/api/merchants');

        return $result;
    }

    /**
     * Update (upsert) the authenticated merchant's profile.
     *
     * Supported params:
     *   - businessName       (string|null) — up to 200 chars
     *   - settlementMint     (string)      — Solana mint address (32-44 chars)
     *   - preferredLanguage  (string)      — "en" or "id"
     *
     * @param array<string, mixed> $params Profile fields to update.
     *
     * @return array{
     *     id: string,
     *     walletAddress: string,
     *     businessName: string|null,
     *     settlementMint: string,
     *     preferredLanguage: string,
     *     createdAt: string,
     *     updatedAt: string,
     * }
     */
    public function update(array $params): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->post('/api/merchants', $params);

        return $result;
    }
}
