CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "code_series" (
	"prefix" text PRIMARY KEY NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "discount_pct" numeric(6, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "location" text DEFAULT 'Karachi' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name" ON "categories" USING btree ("kind",lower("name"));