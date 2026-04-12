<?php
/**
 * Plugin Name: OnPay for WooCommerce
 * Plugin URI: https://onpay.id
 * Description: Accept crypto payments via OnPay. Buyers pay with any Solana token; you receive USDC.
 * Version: 0.1.0
 * Author: OnPay
 * Author URI: https://onpay.id
 * License: MIT
 * Requires PHP: 8.1
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 *
 * @package OnPay_WooCommerce
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

define('ONPAY_WC_VERSION', '0.1.0');
define('ONPAY_WC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ONPAY_WC_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Check whether WooCommerce is active before bootstrapping the plugin.
 *
 * We inspect the active plugins list rather than checking for a class name so
 * that the gateway class is never loaded if WooCommerce is missing — avoiding
 * fatal errors from extending a non-existent base class.
 *
 * @return bool True when WooCommerce is active.
 */
function onpay_wc_is_woocommerce_active(): bool
{
    /** @var string[] $active_plugins */
    $active_plugins = (array) get_option('active_plugins', []);

    if (in_array('woocommerce/woocommerce.php', $active_plugins, true)) {
        return true;
    }

    // Multisite: check network-active plugins.
    if (is_multisite()) {
        /** @var array<string, mixed> $network_plugins */
        $network_plugins = (array) get_site_option('active_sitewide_plugins', []);

        if (isset($network_plugins['woocommerce/woocommerce.php'])) {
            return true;
        }
    }

    return false;
}

/**
 * Display an admin notice when WooCommerce is not active.
 *
 * @return void
 */
function onpay_wc_missing_woocommerce_notice(): void
{
    ?>
    <div class="notice notice-error">
        <p>
            <strong>OnPay for WooCommerce</strong> requires
            <a href="https://woocommerce.com/" target="_blank" rel="noopener noreferrer">WooCommerce</a>
            to be installed and active.
        </p>
    </div>
    <?php
}

/**
 * Bootstrap the plugin once all plugins are loaded.
 *
 * @return void
 */
function onpay_wc_init(): void
{
    if (!onpay_wc_is_woocommerce_active()) {
        add_action('admin_notices', 'onpay_wc_missing_woocommerce_notice');
        return;
    }

    // Load plugin classes.
    require_once ONPAY_WC_PLUGIN_DIR . 'includes/class-onpay-api.php';
    require_once ONPAY_WC_PLUGIN_DIR . 'includes/class-onpay-gateway.php';
    require_once ONPAY_WC_PLUGIN_DIR . 'includes/class-onpay-webhook.php';

    // Register the payment gateway with WooCommerce.
    add_filter('woocommerce_payment_gateways', 'onpay_wc_add_gateway');

    // Register the webhook listener on the WooCommerce API endpoint.
    add_action('woocommerce_api_onpay', 'onpay_wc_handle_webhook');
}
add_action('plugins_loaded', 'onpay_wc_init');

/**
 * Register the OnPay gateway class with WooCommerce.
 *
 * @param  string[] $gateways Existing gateway class names.
 * @return string[] Updated gateway class names.
 */
function onpay_wc_add_gateway(array $gateways): array
{
    $gateways[] = 'OnPay_Gateway';
    return $gateways;
}

/**
 * Handle incoming webhook requests from OnPay.
 *
 * Triggered via `https://example.com/?wc-api=onpay`.
 *
 * @return void
 */
function onpay_wc_handle_webhook(): void
{
    $gateway = new OnPay_Gateway();
    $webhook = new OnPay_Webhook($gateway);
    $webhook->handle();
}
