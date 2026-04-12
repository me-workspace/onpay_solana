CREATE TABLE "qris_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"midtrans_order_id" text NOT NULL,
	"midtrans_transaction_id" text,
	"qris_url" text NOT NULL,
	"gross_amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qris_charges_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "qris_charges_midtrans_order_id_unique" UNIQUE("midtrans_order_id")
);
--> statement-breakpoint
ALTER TABLE "qris_charges" ADD CONSTRAINT "qris_charges_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qris_charges_midtrans_order_id_idx" ON "qris_charges" USING btree ("midtrans_order_id");--> statement-breakpoint
CREATE INDEX "qris_charges_invoice_id_idx" ON "qris_charges" USING btree ("invoice_id");