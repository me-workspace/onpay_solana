<?php

declare(strict_types=1);

namespace OnPay\Exceptions;

/**
 * Exception thrown when the OnPay API returns a non-2xx response.
 *
 * Provides structured access to the HTTP status code and the parsed
 * JSON error body returned by the API (`code`, `message`, `details`).
 */
class OnPayException extends \Exception
{
    /**
     * @param int         $statusCode   HTTP status code from the API response.
     * @param string      $errorCode    Machine-readable error code (e.g. "INVALID_REQUEST").
     * @param string      $errorMessage Human-readable error description from the API.
     * @param mixed       $details      Optional structured details from the API error body.
     */
    public function __construct(
        public readonly int $statusCode,
        public readonly string $errorCode,
        public readonly string $errorMessage,
        public readonly mixed $details = null,
    ) {
        parent::__construct(
            sprintf('OnPay API error [%d %s]: %s', $statusCode, $errorCode, $errorMessage),
            $statusCode,
        );
    }

    /**
     * Build an OnPayException from an HTTP status code and raw response body.
     *
     * Attempts to parse the body as JSON. If parsing fails, falls back to
     * a generic "UNKNOWN_ERROR" code with the raw body as the message.
     *
     * @param int    $statusCode HTTP status code.
     * @param string $body       Raw response body string.
     *
     * @return self
     */
    public static function fromResponse(int $statusCode, string $body): self
    {
        /** @var array{code?: string, message?: string, details?: mixed}|null $parsed */
        $parsed = json_decode($body, true);

        if (!is_array($parsed)) {
            return new self(
                statusCode: $statusCode,
                errorCode: 'UNKNOWN_ERROR',
                errorMessage: $body !== '' ? $body : 'Unknown error',
            );
        }

        return new self(
            statusCode: $statusCode,
            errorCode: is_string($parsed['code'] ?? null) ? $parsed['code'] : 'UNKNOWN_ERROR',
            errorMessage: is_string($parsed['message'] ?? null) ? $parsed['message'] : 'Unknown error',
            details: $parsed['details'] ?? null,
        );
    }
}
