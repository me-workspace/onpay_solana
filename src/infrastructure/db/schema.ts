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
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "expired", "failed"]);

export const preferredLanguageEnum = pgEnum("preferred_language", ["en", "id"]);

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
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------
export const merchantsRelations = relations(merchants, ({ many }) => ({
  invoices: many(invoices),
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
