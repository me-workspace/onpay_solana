=== OnPay for WooCommerce ===
Contributors: onpay
Tags: solana, crypto, payments, usdc, woocommerce
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 0.1.0
License: MIT

Accept crypto payments on your WooCommerce store via OnPay.

== Description ==

OnPay for WooCommerce lets your customers pay with **any Solana token** while
you always receive **USDC**. Powered by Jupiter swap on Solana, payments settle
in seconds with near-zero fees and no chargebacks.

**Features:**

* Accept SOL, USDC, BONK, JUP, and hundreds of other Solana tokens.
* Automatic conversion — you always receive USDC regardless of what the buyer pays with.
* Hosted checkout page — no frontend integration needed.
* Webhook-driven order updates — orders move to "Processing" automatically on payment.
* Secure HMAC-SHA256 webhook signature verification.
* Test mode for development on Solana devnet.

== Installation ==

1. Upload the plugin to `/wp-content/plugins/onpay-woocommerce/`.
2. Activate the plugin through the **Plugins** menu in WordPress.
3. Go to **WooCommerce > Settings > Payments > OnPay - Crypto Payments**.
4. Enter your API key from [https://onpay.id/dashboard/settings](https://onpay.id/dashboard/settings).
5. Save changes — you're ready to accept crypto!

== Frequently Asked Questions ==

= What tokens can my customers pay with? =

Any token supported on Jupiter swap (Solana). This includes SOL, USDC, USDT,
BONK, JUP, and hundreds of others.

= What currency do I receive? =

You always receive USDC in your Solana wallet, regardless of which token the
buyer pays with.

= Are there chargebacks? =

No. Blockchain payments are final and irreversible.

= How do I test the integration? =

Enable "Test Mode" in the plugin settings and use an `sk_test_` API key. This
processes transactions on Solana devnet.

== Changelog ==

= 0.1.0 =
* Initial release.
* Invoice creation via OnPay API.
* Redirect to hosted checkout page.
* Webhook handling for invoice.paid, invoice.expired, and invoice.failed events.
* HMAC-SHA256 signature verification.
