<?php

declare(strict_types=1);

namespace OnPay;

use OnPay\Resources\Invoices;
use OnPay\Resources\Merchants;
use OnPay\Resources\WebhookEndpoints;

/**
 * OnPay PHP SDK client.
 *
 * Main entry point for interacting with the OnPay Solana payment gateway API.
 * Resource accessors are lazy-initialized on first access.
 *
 * @example
 * ```php
 * use OnPay\OnPay;
 *
 * $onpay = new OnPay('sk_live_...');
 *
 * // Create an invoice
 * $invoice = $onpay->invoices->create([
 *     'amountDecimal' => '10.00',
 *     'currency'      => 'USD',
 *     'label'         => 'Coffee',
 * ]);
 *
 * // List paid invoices
 * $invoices = $onpay->invoices->list(['status' => 'paid', 'limit' => 10]);
 *
 * // Get merchant profile
 * $merchant = $onpay->merchants->retrieve();
 * ```
 *
 * @property-read Invoices         $invoices         Invoice operations.
 * @property-read Merchants        $merchants        Merchant profile operations.
 * @property-read WebhookEndpoints $webhookEndpoints Webhook endpoint management.
 */
class OnPay
{
    /** @var string Default API base URL. */
    private const DEFAULT_BASE_URL = 'https://pay.onpay.id';

    /** @var HttpClient Shared HTTP client instance. */
    private readonly HttpClient $client;

    /** @var Invoices|null Lazy-initialized invoices resource. */
    private ?Invoices $invoicesInstance = null;

    /** @var Merchants|null Lazy-initialized merchants resource. */
    private ?Merchants $merchantsInstance = null;

    /** @var WebhookEndpoints|null Lazy-initialized webhook endpoints resource. */
    private ?WebhookEndpoints $webhookEndpointsInstance = null;

    /**
     * Create a new OnPay client instance.
     *
     * @param string               $apiKey  API secret key (e.g. "sk_live_...").
     * @param array<string, mixed> $options Optional configuration:
     *                                      - base_url (string): Override the API base URL.
     */
    public function __construct(
        string $apiKey,
        array $options = [],
    ) {
        if ($apiKey === '') {
            throw new \InvalidArgumentException('API key must not be empty.');
        }

        $baseUrl = is_string($options['base_url'] ?? null)
            ? $options['base_url']
            : self::DEFAULT_BASE_URL;

        $this->client = new HttpClient($apiKey, $baseUrl);
    }

    /**
     * Magic getter for lazy-initialized resource accessors.
     *
     * @param string $name Property name.
     *
     * @return Invoices|Merchants|WebhookEndpoints
     *
     * @throws \InvalidArgumentException If the property does not exist.
     */
    public function __get(string $name): Invoices|Merchants|WebhookEndpoints
    {
        return match ($name) {
            'invoices'         => $this->invoicesInstance         ??= new Invoices($this->client),
            'merchants'        => $this->merchantsInstance        ??= new Merchants($this->client),
            'webhookEndpoints' => $this->webhookEndpointsInstance ??= new WebhookEndpoints($this->client),
            default            => throw new \InvalidArgumentException(
                sprintf('Undefined property: %s::$%s', self::class, $name),
            ),
        };
    }
}
