/**
 * Drizzle ORM schema — the canonical definition of OnPay's database.
 *
 * This file is the single source of truth for every table, column, index,
 * constraint, and relation in the system. Schema changes are tracked via
 * `drizzle-kit generate` → migration SQL files in `drizzle/migrations/`.
 *
 * Security / correctness principles encoded below:
 *
 * 1. All IDs are UUIDs (unguessable, collision-free across shards).
 * 2. All monetary amounts are stored as `text` (bigint-as-string). Postgres
 *    `numeric` would also work, but text is transport-safe to/from JS
 *    `bigint` without any precision loss.
 * 3. All timestamps are `timestamptz` — timezone-aware, UTC canonical.
 * 4. Enums (status, language) use `pgEnum` so invalid values are rejected
 *    at the database layer, not just in application code.
 * 5. Foreign keys enforce referential integrity; cascading deletes are
 *    used only where it makes sense (delete merchant → delete their invoices).
 * 6. Indexes cover the exact access patterns used by InvoiceRepository.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "expired", "failed"]);

export const preferredLanguageEnum = pgEnum("preferred_language", ["en", "id"]);

export const apiKeyTypeEnum = pgEnum("api_key_type", ["publishable", "secret"]);

export const apiKeyModeEnum = pgEnum("api_key_mode", ["live", "test"]);

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull().unique(),
    businessName: text("business_name"),
    settlementMint: text("settlement_mint").notNull(),
    preferredLanguage: preferredLanguageEnum("preferred_language").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("merchants_wallet_idx").on(table.walletAddress)],
);

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    reference: text("reference").notNull().unique(),
    /** Raw base-unit amount as bigint-serialized-as-text (preserves precision). */
    amountRaw: text("amount_raw").notNull(),
    /** ISO-ish currency code or token symbol (e.g. "USD", "IDR", "USDC"). */
    currency: text("currency").notNull(),
    /** Number of decimal places for the amount (USD = 2, USDC = 6, IDR = 0). */
    decimals: integer("decimals").notNull(),
    label: text("label"),
    memo: text("memo"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("invoices_reference_idx").on(table.reference),
    index("invoices_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
    index("invoices_expires_idx").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    buyerWallet: text("buyer_wallet").notNull(),
    inputMint: text("input_mint").notNull(),
    inputAmount: text("input_amount").notNull(),
    outputAmount: text("output_amount").notNull(),
    txHash: text("tx_hash").notNull().unique(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payments_invoice_idx").on(table.invoiceId),
    index("payments_tx_hash_idx").on(table.txHash),
  ],
);

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    /** Human-readable label, e.g. "Production key". */
    name: text("name").notNull(),
    keyType: apiKeyTypeEnum("key_type").notNull(),
    /** Visible prefix: pk_live_, sk_live_, pk_test_, sk_test_. */
    keyPrefix: text("key_prefix").notNull(),
    /** SHA-256 hash of the full key — we never store the raw key. */
    keyHash: text("key_hash").notNull(),
    /** Last 4 chars of the raw key for display (e.g. "...abc1"). */
    keyHint: text("key_hint").notNull(),
    mode: apiKeyModeEnum("mode").notNull(),
    /** Array of scope strings, e.g. ["invoices:create", "invoices:read"]. */
    scopes: text("scopes").array().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    /** Non-null means the key has been revoked (soft-delete). */
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_merchant_idx").on(table.merchantId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------
export const merchantsRelations = relations(merchants, ({ many }) => ({
  invoices: many(invoices),
  apiKeys: many(apiKeys),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [invoices.merchantId],
    references: [merchants.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  merchant: one(merchants, {
    fields: [apiKeys.merchantId],
    references: [merchants.id],
  }),
}));

// ---------------------------------------------------------------------------
// Revoked Sessions
// ---------------------------------------------------------------------------
export const revokedSessions = pgTable("revoked_sessions", {
  /** JWT ID (`jti` claim) — the primary key. */
  jti: text("jti").primaryKey(),
  /** When the original session JWT expires. Used to garbage-collect stale rows. */
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  /** When the revocation was created. */
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Idempotency Keys
// ---------------------------------------------------------------------------
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** HTTP status code of the original response. */
    responseStatus: integer("response_status").notNull(),
    /** Full JSON response body, stored as text (not jsonb) to preserve exact serialization. */
    responseBody: text("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique("idempotency_keys_merchant_key").on(table.merchantId, table.key)],
);

// ---------------------------------------------------------------------------
// Inferred row types — consumed by the invoice-repo adapter for row→domain mapping.
// ---------------------------------------------------------------------------
export type MerchantRow = typeof merchants.$inferSelect;
export type NewMerchantRow = typeof merchants.$inferInsert;
export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;
export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;
export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKeyRow = typeof idempotencyKeys.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
