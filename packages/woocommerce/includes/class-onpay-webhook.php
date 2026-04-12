<?php
/**
 * OnPay webhook handler.
 *
 * Listens for incoming webhook events from OnPay (delivered to
 * `https://example.com/?wc-api=onpay`) and updates WooCommerce order
 * statuses accordingly.
 *
 * Signature verification follows the same HMAC-SHA256 scheme as the
 * Node and Python SDKs:
 *   Header format: `OnPay-Signature: t=<timestamp>,v1=<hmac_hex>`
 *   Signed payload: `${timestamp}.${raw_body}`
 *
 * @package OnPay_WooCommerce
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

/**
 * Webhook handler for OnPay payment events.
 *
 * @since 0.1.0
 */
class OnPay_Webhook
{
    /** @var int Maximum age of a webhook signature in seconds (5 minutes). */
    private const TIMESTAMP_TOLERANCE_SECONDS = 300;

    /** @var OnPay_Gateway The gateway instance (used to read the webhook secret). */
    private OnPay_Gateway $gateway;

    /**
     * @param OnPay_Gateway $gateway Gateway instance with access to settings.
     */
    public function __construct(OnPay_Gateway $gateway)
    {
        $this->gateway = $gateway;
    }

    /**
     * Process an incoming webhook request.
     *
     * Reads the raw POST body, verifies the HMAC signature, then dispatches
     * based on the event type. Always returns an HTTP response and calls
     * `exit` to prevent WordPress from rendering anything else.
     *
     * @return void
     */
    public function handle(): void
    {
        $raw_body = file_get_contents('php://input');

        if ($raw_body === false || $raw_body === '') {
            $this->respond(400, ['error' => 'Empty request body.']);
            return;
        }

        // Verify the webhook signature.
        $signature_header = $_SERVER['HTTP_ONPAY_SIGNATURE'] ?? '';

        if (!is_string($signature_header) || $signature_header === '') {
            $this->respond(400, ['error' => 'Missing OnPay-Signature header.']);
            return;
        }

        $secret = $this->gateway->get_webhook_secret();

        if ($secret === '') {
            wc_get_logger()->error(
                'OnPay webhook received but no webhook secret is configured.',
                ['source' => 'onpay-woocommerce']
            );
            $this->respond(400, ['error' => 'Webhook secret not configured.']);
            return;
        }

        if (!$this->verify_signature($signature_header, $raw_body, $secret)) {
            wc_get_logger()->warning(
                'OnPay webhook signature verification failed.',
                ['source' => 'onpay-woocommerce']
            );
            $this->respond(400, ['error' => 'Invalid signature.']);
            return;
        }

        // Parse the JSON payload.
        /** @var array<string, mixed>|null $payload */
        $payload = json_decode($raw_body, true);

        if (!is_array($payload)) {
            $this->respond(400, ['error' => 'Invalid JSON payload.']);
            return;
        }

        // Determine the event type from the header or payload.
        $event_type = $_SERVER['HTTP_ONPAY_EVENT_TYPE']
            ?? $payload['type']
            ?? $payload['event']
            ?? '';

        if (!is_string($event_type) || $event_type === '') {
            $this->respond(400, ['error' => 'Missing event type.']);
            return;
        }

        wc_get_logger()->info(
            sprintf('OnPay webhook received: %s', $event_type),
            ['source' => 'onpay-woocommerce']
        );

        $this->dispatch_event($event_type, $payload);
    }

    /**
     * Dispatch a webhook event to the appropriate handler.
     *
     * @param string               $event_type Event type string (e.g. "invoice.paid").
     * @param array<string, mixed> $payload    Decoded JSON payload.
     *
     * @return void
     */
    private function dispatch_event(string $event_type, array $payload): void
    {
        // Extract the invoice data from the payload. The payload structure may
        // include a `data` wrapper or be flat — support both.
        /** @var array<string, mixed> $invoice_data */
        $invoice_data = $payload['data'] ?? $payload;

        $invoice_id = $invoice_data['id'] ?? '';

        if (!is_string($invoice_id) || $invoice_id === '') {
            $this->respond(400, ['error' => 'Missing invoice ID in payload.']);
            return;
        }

        // Find the WooCommerce order by the stored invoice ID.
        $order = $this->find_order_by_invoice_id($invoice_id);

        if ($order === null) {
            wc_get_logger()->warning(
                sprintf('OnPay webhook: no order found for invoice %s', $invoice_id),
                ['source' => 'onpay-woocommerce']
            );
            // Return 200 to prevent retries for orders we don't recognise.
            $this->respond(200, ['status' => 'ignored', 'reason' => 'order_not_found']);
            return;
        }

        match ($event_type) {
            'invoice.paid'    => $this->handle_invoice_paid($order, $invoice_data),
            'invoice.expired' => $this->handle_invoice_failed($order, 'expired'),
            'invoice.failed'  => $this->handle_invoice_failed($order, 'failed'),
            default           => $this->respond(200, ['status' => 'ignored', 'reason' => 'unknown_event']),
        };
    }

    /**
     * Handle a successful payment.
     *
     * @param \WC_Order            $order        The WooCommerce order.
     * @param array<string, mixed> $invoice_data Invoice data from the webhook payload.
     *
     * @return void
     */
    private function handle_invoice_paid(\WC_Order $order, array $invoice_data): void
    {
        // Prevent processing if the order is already complete.
        if ($order->is_paid()) {
            $this->respond(200, ['status' => 'already_processed']);
            return;
        }

        $tx_signature = $invoice_data['txSignature'] ?? $invoice_data['transactionSignature'] ?? '';

        $order->payment_complete(is_string($tx_signature) ? $tx_signature : '');
        $order->add_order_note(
            sprintf(
                /* translators: %s: OnPay invoice ID */
                __('OnPay payment confirmed (Invoice: %s).', 'onpay-woocommerce'),
                $invoice_data['id'] ?? 'unknown'
            )
        );

        $this->respond(200, ['status' => 'ok']);
    }

    /**
     * Handle a failed or expired invoice.
     *
     * @param \WC_Order $order  The WooCommerce order.
     * @param string    $reason "expired" or "failed".
     *
     * @return void
     */
    private function handle_invoice_failed(\WC_Order $order, string $reason): void
    {
        // Only transition orders that haven't been paid yet.
        if ($order->is_paid()) {
            $this->respond(200, ['status' => 'already_paid']);
            return;
        }

        $note = $reason === 'expired'
            ? __('OnPay invoice expired. Payment was not received in time.', 'onpay-woocommerce')
            : __('OnPay invoice failed.', 'onpay-woocommerce');

        $order->update_status('failed', $note);

        $this->respond(200, ['status' => 'ok']);
    }

    // ------------------------------------------------------------------
    // Signature verification
    // ------------------------------------------------------------------

    /**
     * Verify the HMAC-SHA256 webhook signature.
     *
     * Follows the same algorithm as the Node/Python SDKs:
     *   1. Parse `t=<timestamp>,v1=<hex>` from the header.
     *   2. Reject if the timestamp is older than TIMESTAMP_TOLERANCE_SECONDS.
     *   3. Compute HMAC-SHA256 of `${timestamp}.${raw_body}` with the secret.
     *   4. Compare in constant time.
     *
     * @param string $signature_header The `OnPay-Signature` header value.
     * @param string $raw_body         Raw request body.
     * @param string $secret           Hex-encoded webhook signing secret.
     *
     * @return bool True if the signature is valid and the timestamp is fresh.
     */
    private function verify_signature(string $signature_header, string $raw_body, string $secret): bool
    {
        // Parse header: "t=1234567890,v1=abcdef..."
        $parts = [];
        foreach (explode(',', $signature_header) as $segment) {
            $kv = explode('=', $segment, 2);
            if (count($kv) === 2) {
                $parts[trim($kv[0])] = trim($kv[1]);
            }
        }

        $timestamp = $parts['t'] ?? '';
        $signature = $parts['v1'] ?? '';

        if ($timestamp === '' || $signature === '') {
            return false;
        }

        // Validate timestamp freshness.
        $ts = (int) $timestamp;
        $now = time();

        if (abs($now - $ts) > self::TIMESTAMP_TOLERANCE_SECONDS) {
            wc_get_logger()->warning(
                sprintf(
                    'OnPay webhook timestamp too old/future: %d (now: %d, drift: %ds)',
                    $ts,
                    $now,
                    abs($now - $ts)
                ),
                ['source' => 'onpay-woocommerce']
            );
            return false;
        }

        // Compute expected signature: HMAC-SHA256("${timestamp}.${body}", secret)
        $signed_payload    = $timestamp . '.' . $raw_body;
        $expected_signature = hash_hmac('sha256', $signed_payload, $secret);

        // Constant-time comparison.
        return hash_equals($expected_signature, $signature);
    }

    // ------------------------------------------------------------------
    // Order lookup
    // ------------------------------------------------------------------

    /**
     * Find a WooCommerce order by the stored OnPay invoice ID.
     *
     * @param  string $invoice_id OnPay invoice UUID.
     * @return \WC_Order|null The matching order, or null if not found.
     */
    private function find_order_by_invoice_id(string $invoice_id): ?\WC_Order
    {
        // Use wc_get_orders with meta_query for HPOS compatibility.
        /** @var \WC_Order[] $orders */
        $orders = wc_get_orders([
            'meta_key'   => '_onpay_invoice_id',
            'meta_value' => $invoice_id,
            'limit'      => 1,
            'return'     => 'objects',
        ]);

        return $orders[0] ?? null;
    }

    // ------------------------------------------------------------------
    // HTTP response helper
    // ------------------------------------------------------------------

    /**
     * Send a JSON response and terminate execution.
     *
     * @param int                  $status HTTP status code.
     * @param array<string, mixed> $body   Response body.
     *
     * @return never
     */
    private function respond(int $status, array $body): never
    {
        status_header($status);
        header('Content-Type: application/json; charset=utf-8');
        echo wp_json_encode($body);
        exit;
    }
}
