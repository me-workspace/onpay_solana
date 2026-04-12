/**
 * GET /api/merchants/me/stats — analytics totals for the authenticated merchant.
 *
 * Returns paid-invoice totals for three rolling windows: today (midnight
 * in server local time), the last 7 days, and the last 30 days. Amounts
 * are in USD for MVP — multi-currency breakdown ships with Phase 2.
 *
 * Auth-gated: the session cookie must identify a registered merchant.
 */
import { NextResponse, type NextRequest } from "next/server";

import { formatMoney, type Money } from "@/domain/value-objects/money";
import { getDb } from "@/infrastructure/db/client";
import { createInvoiceRepository } from "@/infrastructure/db/invoice-repo";
import { createMerchantRepository } from "@/infrastructure/db/merchant-repo";
import { apiError } from "@/lib/api-error";
import { requireAuthenticatedWallet } from "@/lib/auth";
import { clientKeyFromRequest, enforceRateLimit, withErrorHandler } from "@/lib/http";
import { mutationRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CURRENCY = "USD";
const DECIMALS = 2;

/**
 * Simple in-memory cache for stats responses. Keyed by merchant ID, expires
 * after CACHE_TTL_MS. Eliminates redundant DB aggregations when a merchant
 * refreshes the dashboard within a short window.
 */
const CACHE_TTL_MS = 30_000;
type CacheEntry = { expiresAt: number; body: StatsResponse };
const statsCache = new Map<string, CacheEntry>();

type StatCard = {
  readonly label: string;
  readonly totalFormatted: string;
  readonly totalRaw: string;
  readonly count: number;
};

type StatsResponse = {
  readonly currency: string;
  readonly today: StatCard;
  readonly week: StatCard;
  readonly month: StatCard;
};

function startOfTodayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function toCard(label: string, stats: { totalRaw: bigint; count: number }): StatCard {
  const money: Money = { amount: stats.totalRaw, currency: CURRENCY, decimals: DECIMALS };
  return {
    label,
    totalFormatted: formatMoney(money),
    totalRaw: stats.totalRaw.toString(),
    count: stats.count,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  enforceRateLimit(mutationRateLimiter.check(clientKeyFromRequest(req)), "merchants/me/stats");
  const authenticatedWallet = await requireAuthenticatedWallet(req);

  const db = getDb();
  const merchantRepo = createMerchantRepository(db);
  const merchantResult = await merchantRepo.findByWallet(authenticatedWallet);
  if (!merchantResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to fetch merchant");
  }
  if (merchantResult.value === null) {
    // Not yet registered — return an empty stats shape rather than 404
    // so the dashboard can render zero cards cleanly.
    const zero = { totalRaw: 0n, count: 0 };
    const response: StatsResponse = {
      currency: CURRENCY,
      today: toCard("Today", zero),
      week: toCard("Last 7 days", zero),
      month: toCard("Last 30 days", zero),
    };
    return NextResponse.json(response, { status: 200 });
  }

  const merchantId = merchantResult.value.id;

  // Serve from cache if available and fresh.
  const cached = statsCache.get(merchantId);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    const res = NextResponse.json(cached.body, { status: 200 });
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  const invoiceRepo = createInvoiceRepository(db);
  const now = new Date();

  const [todayResult, weekResult, monthResult] = await Promise.all([
    invoiceRepo.sumPaidByMerchantSince(merchantId, CURRENCY, startOfTodayUtc(now)),
    invoiceRepo.sumPaidByMerchantSince(merchantId, CURRENCY, daysAgo(now, 7)),
    invoiceRepo.sumPaidByMerchantSince(merchantId, CURRENCY, daysAgo(now, 30)),
  ]);

  if (!todayResult.ok || !weekResult.ok || !monthResult.ok) {
    throw apiError("INTERNAL_ERROR", "Failed to compute stats");
  }

  const response: StatsResponse = {
    currency: CURRENCY,
    today: toCard("Today", todayResult.value),
    week: toCard("Last 7 days", weekResult.value),
    month: toCard("Last 30 days", monthResult.value),
  };

  // Populate cache.
  statsCache.set(merchantId, { expiresAt: Date.now() + CACHE_TTL_MS, body: response });

  const res = NextResponse.json(response, { status: 200 });
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  res.headers.set("X-Cache", "MISS");
  return res;
});
