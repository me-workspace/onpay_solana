<?php

declare(strict_types=1);

namespace OnPay\Exceptions;

/**
 * Exception thrown when webhook signature verification fails.
 *
 * This may indicate a tampered payload, an incorrect endpoint secret,
 * a replayed request (timestamp too old), or a malformed signature header.
 */
class WebhookSignatureException extends \Exception
{
}
