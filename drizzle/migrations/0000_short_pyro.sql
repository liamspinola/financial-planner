CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"use_context" boolean DEFAULT true NOT NULL,
	"context_snapshot" text,
	"summary" text,
	"deleted_at" text,
	"created_at" text DEFAULT now()::text NOT NULL,
	"updated_at" text DEFAULT now()::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"lender" text,
	"debt_type" text DEFAULT 'credit_card' NOT NULL,
	"minimum_payment" integer DEFAULT 0 NOT NULL,
	"min_payment_pct" double precision,
	"min_payment_floor" integer,
	"notes" text,
	"created_at" text DEFAULT current_date::text
);
--> statement-breakpoint
CREATE TABLE "expense_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"apply_month" integer NOT NULL,
	"category" text DEFAULT 'expected' NOT NULL,
	"created_at" text DEFAULT current_date::text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"is_essential" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"monthly_equivalent" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sequence" integer NOT NULL,
	"created_at" text DEFAULT now()::text NOT NULL,
	CONSTRAINT "uq_messages_conv_seq" UNIQUE("conversation_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "plan_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"input_hash" text NOT NULL,
	"strategy" text NOT NULL,
	"calc_result" text NOT NULL,
	"ai_narrative" text,
	"ai_budget_tips" text,
	"generated_at" text NOT NULL,
	"ai_mode" text DEFAULT 'C' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"snapshot_month" text NOT NULL,
	"recorded_at" text DEFAULT now()::text,
	"total_balance" integer NOT NULL,
	"balances_json" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "uq_settings_key_user" UNIQUE("key","user_id")
);
--> statement-breakpoint
CREATE TABLE "spending_actuals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"expense_id" integer,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"amount_actual" integer NOT NULL,
	"record_month" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tranches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"debt_id" integer NOT NULL,
	"label" text NOT NULL,
	"balance" integer NOT NULL,
	"apr" double precision NOT NULL,
	"promo_end_date" text,
	"post_promo_apr" double precision,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "user_ai_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"created_at" text DEFAULT now()::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "windfalls" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"apply_month" integer NOT NULL,
	"created_at" text DEFAULT current_date::text
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_actuals" ADD CONSTRAINT "spending_actuals_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tranches" ADD CONSTRAINT "tranches_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_messages_conv_seq" ON "messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_spending_actuals_month" ON "spending_actuals" USING btree ("record_month");