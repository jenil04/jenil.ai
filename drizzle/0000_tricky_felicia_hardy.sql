CREATE TABLE "intro_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_wallet" text,
	"project_name" text NOT NULL,
	"category" text NOT NULL,
	"contact" text NOT NULL,
	"pitch" text NOT NULL,
	"links" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text NOT NULL,
	"amount_usdc" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intro_requests_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"ip" text,
	"payer_wallet" text,
	"outcome" text NOT NULL,
	"detail" text,
	"http_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repost_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_wallet" text,
	"tweet_url" text NOT NULL,
	"tweet_id" text NOT NULL,
	"tweet_text_snapshot" text,
	"screen_decision" text,
	"screen_reason" text,
	"screen_confidence" double precision,
	"screen_model" text,
	"reposted" boolean DEFAULT false NOT NULL,
	"repost_tweet_id" text,
	"status" text DEFAULT 'auto' NOT NULL,
	"tx_hash" text NOT NULL,
	"amount_usdc" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repost_requests_tx_hash_unique" UNIQUE("tx_hash")
);
