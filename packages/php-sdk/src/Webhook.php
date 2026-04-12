<?php

declare(strict_types=1);

namespace OnPay;

use OnPay\Exceptions\WebhookSignatureException;

/**
 * Webhook signature verification.
 *
 * Implements Stripe-compatible HMAC-SHA256 signature verification for
 * incoming webhook payloads. Use this in your webhook handler to confirm
 * that the request originated from OnPay and was not tampered with.
 *
 * Signature header format: `t=<unix_timestamp>,v1=<hmac_hex>`
 *
 * @example
 * ```php
 * $event = \OnPay\Webhook::constructEvent(
 *     file_get_contents('php://input'),
 *     $_SERVER['HTTP_ONPAY_SIGNATURE'],
 *     'your_endpoint_secret',
 * );
 * ```
 */
class Webhook
{
    /** @var int Default maximum age of a webhook signature in seconds (5 minutes). */
    private const DEFAULT_TOLERANCE = 300;

    /**
     * Verify the webhook signature and return the decoded event payload.
     *
     * @param string $payload        Raw request body string (do NOT json_decode first).
     * @param string $sigHeader      Value of the `OnPay-Signature` HTTP header.
     * @param string $endpointSecret The signing secret for this webhook endpoint.
     * @param int    $tolerance      Maximum age in seconds (default 300). Set to 0 to disable.
     *
     * @return array<string, mixed> The decoded JSON event payload.
     *
     * @throws WebhookSignatureException If verification fails for any reason.
     */
    public static function constructEvent(
        string $payload,
        string $sigHeader,
        string $endpointSecret,
        int $tolerance = self::DEFAULT_TOLERANCE,
    ): array {
        self::verifySignature($payload, $sigHeader, $endpointSecret, $tolerance);

        /** @var array<string, mixed>|null $event */
        $event = json_decode($payload, true);

        if (!is_array($event)) {
            throw new WebhookSignatureException(
                'Webhook payload is not valid JSON.',
            );
        }

        return $event;
    }

    /**
     * Verify the HMAC-SHA256 signature of a webhook payload.
     *
     * Steps:
     *   1. Parse `t=<timestamp>,v1=<hex_sig>` from the header.
     *   2. Reconstruct the signed payload as `{timestamp}.{body}`.
     *   3. Compute HMAC-SHA256 with the endpoint secret.
     *   4. Compare with constant-time `hash_equals()`.
     *   5. Reject if the timestamp exceeds the tolerance window.
     *
     * @param string $payload        Raw request body.
     * @param string $sigHeader      OnPay-Signature header value.
     * @param string $endpointSecret Endpoint signing secret.
     * @param int    $tolerance      Maximum age in seconds.
     *
     * @throws WebhookSignatureException On any verification failure.
     */
    private static function verifySignature(
        string $payload,
        string $sigHeader,
        string $endpointSecret,
        int $tolerance,
    ): void {
        $parts = self::parseSignatureHeader($sigHeader);

        if ($parts === null) {
            throw new WebhookSignatureException(
                'Invalid OnPay-Signature header format. Expected "t=<timestamp>,v1=<signature>".',
            );
        }

        [$timestamp, $signature] = $parts;

        // Reconstruct the signed payload: "{timestamp}.{body}"
        $signedPayload   = $timestamp . '.' . $payload;
        $expectedSig     = hash_hmac('sha256', $signedPayload, $endpointSecret);

        if (!hash_equals($expectedSig, $signature)) {
            throw new WebhookSignatureException(
                'Webhook signature verification failed. The payload may have been tampered with.',
            );
        }

        // Timestamp tolerance check (replay protection).
        if ($tolerance > 0) {
            $timestampInt = (int) $timestamp;
            $now          = time();

            if ($timestampInt < ($now - $tolerance)) {
                throw new WebhookSignatureException(
                    sprintf(
                        'Webhook timestamp is too old. Received %d, current time %d, tolerance %ds.',
                        $timestampInt,
                        $now,
                        $tolerance,
                    ),
                );
            }
        }
    }

    /**
     * Parse the OnPay-Signature header into timestamp and v1 signature.
     *
     * Expected format: `t=1234567890,v1=abcdef0123456789...`
     *
     * @param string $header Raw header value.
     *
     * @return array{0: string, 1: string}|null [timestamp, signature] or null on parse failure.
     */
    private static function parseSignatureHeader(string $header): ?array
    {
        $timestamp = null;
        $signature = null;

        $segments = explode(',', $header);

        foreach ($segments as $segment) {
            $segment = trim($segment);

            if (str_starts_with($segment, 't=')) {
                $timestamp = substr($segment, 2);
            } elseif (str_starts_with($segment, 'v1=')) {
                $signature = substr($segment, 3);
            }
        }

        if ($timestamp === null || $timestamp === '' || $signature === null || $signature === '') {
            return null;
        }

        return [$timestamp, $signature];
    }
}
