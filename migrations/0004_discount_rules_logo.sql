CREATE TABLE "customer_discount_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'pct' NOT NULL,
	"value" numeric(18, 2) DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'editable' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "logo_data" text;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "discount_rs" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_rule_customer_category" ON "customer_discount_rules" USING btree ("customer_id",lower("category"));