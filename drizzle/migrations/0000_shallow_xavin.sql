CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."preferred_language" AS ENUM('en', 'id');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"amount_raw" text NOT NULL,
	"currency" text NOT NULL,
	"decimals" integer NOT NULL,
	"label" text,
	"memo" text,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"business_name" text,
	"settlement_mint" text NOT NULL,
	"preferred_language" "preferred_language" DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"buyer_wallet" text NOT NULL,
	"input_mint" text NOT NULL,
	"input_amount" text NOT NULL,
	"output_amount" text NOT NULL,
	"tx_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_reference_idx" ON "invoices" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "invoices_merchant_status_idx" ON "invoices" USING btree ("merchant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "invoices_expires_idx" ON "invoices" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "merchants_wallet_idx" ON "merchants" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_tx_hash_idx" ON "payments" USING btree ("tx_hash");