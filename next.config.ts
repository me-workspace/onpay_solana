import type { NextConfig } from "next";

/**
 * Strict Content Security Policy for OnPay.
 *
 * Non-custodial guarantee depends in part on the browser refusing to load
 * untrusted scripts that could intercept wallet signing. Keep this list
 * minimal and audit every addition.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Inline styles are required by Next.js in dev mode and Tailwind runtime.
  "style-src 'self' 'unsafe-inline'",
  // Scripts: self + inline for Next.js hydration. No third-party analytics.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Fonts loaded from self.
  "font-src 'self' data:",
  // Images: self + data URIs (QR codes) + HTTPS (merchant logos).
  "img-src 'self' data: blob: https:",
  // Network calls: self + Solana RPC + Jupiter API + Supabase.
  "connect-src 'self' https://*.solana.com https://*.helius-rpc.com https://quote-api.jup.ag https://lite-api.jup.ag https://*.supabase.co wss://*.supabase.co",
  // Frames: none.
  "frame-src 'none'",
  "frame-ancestors 'none'",
  // Forms: self only.
  "form-action 'self'",
  // Always use HTTPS for subresources.
  "upgrade-insecure-requests",
  // Deny loading from objects/embeds.
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  typedRoutes: true,
  // Fail the build on type errors and lint errors — never silently ship broken code.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
