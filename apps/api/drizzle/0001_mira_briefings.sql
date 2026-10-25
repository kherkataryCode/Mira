CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" text NOT NULL,
	"slot" text NOT NULL,
	"message_id" uuid,
	"lesson_id" uuid,
	"news_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "kind" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "local_date" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "diagram" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "insight" jsonb;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "question" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "learn_more" jsonb;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "origin" text DEFAULT 'curated' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "relevance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "exploitation" text DEFAULT 'not-reported' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "affected" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefings_user_idx" ON "briefings" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_daily_idx" ON "conversations" USING btree ("user_id","local_date") WHERE "conversations"."kind" = 'daily';--> statement-breakpoint
CREATE INDEX "lessons_owner_idx" ON "lessons" USING btree ("owner_user_id");--> statement-breakpoint
-- Mira: existing users without any news source get the default cybersecurity feeds.
INSERT INTO "news_sources" ("user_id", "name", "url", "category")
SELECT u."id", s."name", s."url", s."category"
FROM "users" u
CROSS JOIN (VALUES
  ('CISA — Cybersecurity Advisories', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', 'advisory'),
  ('CISA — ICS Advisories', 'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml', 'ot-security'),
  ('The Hacker News', 'https://feeds.feedburner.com/TheHackersNews', 'cybersecurity'),
  ('BleepingComputer', 'https://www.bleepingcomputer.com/feed/', 'cybersecurity'),
  ('SecurityWeek', 'https://www.securityweek.com/feed/', 'cybersecurity')
) AS s("name", "url", "category")
WHERE NOT EXISTS (SELECT 1 FROM "news_sources" ns WHERE ns."user_id" = u."id")
ON CONFLICT DO NOTHING;
