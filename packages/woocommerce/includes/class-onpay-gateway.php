<?php
/**
 * OnPay WooCommerce payment gateway.
 *
 * Extends the standard WooCommerce payment gateway to redirect customers to
 * the OnPay hosted checkout page where they can pay with any Solana token.
 * The merchant always receives USDC.
 *
 * @package OnPay_WooCommerce
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

/**
 * WooCommerce payment gateway for OnPay crypto payments.
 *
 * @since 0.1.0
 */
class OnPay_Gateway extends \WC_Payment_Gateway
{
    /**
     * Initialise the gateway.
     */
    public function __construct()
    {
        $this->id                 = 'onpay';
        $this->icon               = ONPAY_WC_PLUGIN_URL . 'assets/icon.png';
        $this->has_fields         = false;
        $this->method_title       = 'OnPay - Crypto Payments';
        $this->method_description = 'Accept any Solana token. Merchants receive USDC.';
        $this->supports           = ['products'];

        // Load settings.
        $this->init_form_fields();
        $this->init_settings();

        $this->title       = $this->get_option('title', 'Pay with Crypto');
        $this->description = $this->get_option('description', 'Pay with any Solana token via OnPay. Fast, secure, no chargebacks.');
        $this->enabled     = $this->get_option('enabled', 'no');

        // Persist settings on save.
        add_action(
            'woocommerce_update_options_payment_gateways_' . $this->id,
            [$this, 'process_admin_options']
        );
    }

    /**
     * Define the gateway settings fields shown in WooCommerce > Settings > Payments.
     *
     * @return void
     */
    public function init_form_fields(): void
    {
        $this->form_fields = [
            'enabled' => [
                'title'   => __('Enable/Disable', 'onpay-woocommerce'),
                'type'    => 'checkbox',
                'label'   => __('Enable OnPay crypto payments', 'onpay-woocommerce'),
                'default' => 'no',
            ],
            'title' => [
                'title'       => __('Title', 'onpay-woocommerce'),
                'type'        => 'text',
                'description' => __('Payment method title shown to the customer at checkout.', 'onpay-woocommerce'),
                'default'     => __('Pay with Crypto', 'onpay-woocommerce'),
                'desc_tip'    => true,
            ],
            'description' => [
                'title'       => __('Description', 'onpay-woocommerce'),
                'type'        => 'textarea',
                'description' => __('Payment method description shown to the customer at checkout.', 'onpay-woocommerce'),
                'default'     => __('Pay with any Solana token via OnPay. Fast, secure, no chargebacks.', 'onpay-woocommerce'),
                'desc_tip'    => true,
            ],
            'test_mode' => [
                'title'       => __('Test Mode', 'onpay-woocommerce'),
                'type'        => 'checkbox',
                'label'       => __('Enable test mode (use sk_test_ API key)', 'onpay-woocommerce'),
                'default'     => 'no',
                'description' => __('When enabled, transactions are processed on Solana devnet.', 'onpay-woocommerce'),
                'desc_tip'    => true,
            ],
            'api_key' => [
                'title'       => __('API Key', 'onpay-woocommerce'),
                'type'        => 'password',
                'description' => __('Your OnPay API key (sk_live_ or sk_test_). Find it at https://onpay.id/dashboard/settings.', 'onpay-woocommerce'),
                'default'     => '',
                'desc_tip'    => true,
            ],
            'api_url' => [
                'title'       => __('API URL', 'onpay-woocommerce'),
                'type'        => 'text',
                'description' => __('OnPay API base URL. Only change this for development/testing.', 'onpay-woocommerce'),
                'default'     => 'https://onpay.id',
                'desc_tip'    => true,
            ],
            'webhook_secret' => [
                'title'       => __('Webhook Secret', 'onpay-woocommerce'),
                'type'        => 'password',
                'description' => __('The webhook signing secret from your OnPay dashboard. Used to verify incoming webhook payloads.', 'onpay-woocommerce'),
                'default'     => '',
                'desc_tip'    => true,
            ],
        ];
    }

    /**
     * Process the payment for a given order.
     *
     * Creates an invoice via the OnPay API and redirects the customer to the
     * hosted checkout page at /pay/{reference}.
     *
     * @param  int $order_id WooCommerce order ID.
     * @return array{result: string, redirect?: string} Gateway result.
     */
    public function process_payment($order_id): array
    {
        $order = wc_get_order($order_id);

        if (!$order instanceof \WC_Order) {
            wc_add_notice(
                __('Order not found. Please try again.', 'onpay-woocommerce'),
                'error'
            );
            return ['result' => 'failure'];
        }

        try {
            $api = $this->get_api_client();

            $invoice = $api->create_invoice([
                'amountDecimal' => $order->get_total(),
                'currency'      => $order->get_currency(),
                'label'         => sprintf('Order #%s', $order->get_order_number()),
                'memo'          => $order->get_billing_email(),
            ]);

            // Validate required fields in the response.
            if (empty($invoice['id']) || empty($invoice['reference'])) {
                throw new \RuntimeException('Invalid invoice response: missing id or reference.');
            }

            /** @var string $invoice_id */
            $invoice_id = $invoice['id'];

            /** @var string $reference */
            $reference = $invoice['reference'];

            // Store OnPay metadata on the order.
            $order->update_meta_data('_onpay_invoice_id', $invoice_id);
            $order->update_meta_data('_onpay_reference', $reference);
            $order->set_status('pending', __('Awaiting OnPay crypto payment.', 'onpay-woocommerce'));
            $order->save();

            // Build the redirect URL to the hosted checkout page.
            $api_url     = rtrim($this->get_option('api_url', 'https://onpay.id'), '/');
            $redirect_url = $api_url . '/pay/' . urlencode($reference);

            return [
                'result'   => 'success',
                'redirect' => $redirect_url,
            ];
        } catch (\Throwable $e) {
            wc_get_logger()->error(
                sprintf('OnPay payment error for order #%d: %s', $order_id, $e->getMessage()),
                ['source' => 'onpay-woocommerce']
            );

            wc_add_notice(
                __('Payment could not be initiated. Please try again or choose a different payment method.', 'onpay-woocommerce'),
                'error'
            );

            return ['result' => 'failure'];
        }
    }

    /**
     * Create and return an OnPay API client instance.
     *
     * @return OnPay_Api Configured API client.
     *
     * @throws \RuntimeException If the API key is not configured.
     */
    public function get_api_client(): OnPay_Api
    {
        $api_key = $this->get_option('api_key', '');

        if ($api_key === '') {
            throw new \RuntimeException('OnPay API key is not configured.');
        }

        $api_url = $this->get_option('api_url', 'https://onpay.id');

        return new OnPay_Api($api_url, $api_key);
    }

    /**
     * Get the configured webhook secret.
     *
     * @return string The webhook signing secret (may be empty if not configured).
     */
    public function get_webhook_secret(): string
    {
        return $this->get_option('webhook_secret', '');
    }
}
