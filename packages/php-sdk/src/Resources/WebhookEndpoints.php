<?php

declare(strict_types=1);

namespace OnPay\Resources;

use OnPay\HttpClient;

/**
 * Webhook endpoints resource.
 *
 * Provides methods to create, list, and delete webhook endpoints. Each
 * endpoint receives POST requests for subscribed events (e.g. invoice.paid)
 * signed with an HMAC-SHA256 secret.
 */
class WebhookEndpoints
{
    /**
     * @param HttpClient $client HTTP client instance.
     */
    public function __construct(
        private readonly HttpClient $client,
    ) {
    }

    /**
     * Create a new webhook endpoint.
     *
     * Required params:
     *   - url    (string)   — HTTPS URL to receive webhook POSTs
     *   - events (string[]) — event types to subscribe to:
     *                         "invoice.paid", "invoice.expired", "invoice.failed"
     *
     * The response includes a `secret` field. Store it securely; it cannot
     * be retrieved again.
     *
     * @param array<string, mixed> $params Endpoint creation parameters.
     *
     * @return array{
     *     id: string,
     *     url: string,
     *     events: list<string>,
     *     enabled: bool,
     *     createdAt: string,
     *     secret: string,
     * }
     */
    public function create(array $params): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->post('/api/webhooks', $params);

        return $result;
    }

    /**
     * List all webhook endpoints for the authenticated merchant.
     *
     * @return array{
     *     endpoints: list<array{
     *         id: string,
     *         url: string,
     *         events: list<string>,
     *         enabled: bool,
     *         createdAt: string,
     *     }>,
     * }
     */
    public function list(): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->get('/api/webhooks');

        return $result;
    }

    /**
     * Delete a webhook endpoint by ID.
     *
     * This is a hard delete that also removes all associated delivery records.
     *
     * @param string $id Webhook endpoint UUID.
     *
     * @return array{ok: bool, id: string}
     */
    public function delete(string $id): array
    {
        /** @var array<string, mixed> $result */
        $result = $this->client->delete('/api/webhooks/' . urlencode($id));

        return $result;
    }
}
