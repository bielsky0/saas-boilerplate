CREATE TABLE "mail_message" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"senderUserId" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"createdByUserId" text NOT NULL,
	"lastMessageAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_thread_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"userId" text NOT NULL,
	"folder" text DEFAULT 'inbox' NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"isStarred" boolean DEFAULT false NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_participant_folder_ck" CHECK ("mail_thread_participant"."folder" IN ('inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'))
);
--> statement-breakpoint
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_threadId_mail_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."mail_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_senderUserId_user_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_thread" ADD CONSTRAINT "mail_thread_createdByUserId_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_thread_participant" ADD CONSTRAINT "mail_thread_participant_threadId_mail_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."mail_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_thread_participant" ADD CONSTRAINT "mail_thread_participant_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_message_thread_idx" ON "mail_message" USING btree ("threadId","createdAt");--> statement-breakpoint
CREATE INDEX "mail_thread_last_idx" ON "mail_thread" USING btree ("lastMessageAt");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_participant_thread_user_uq" ON "mail_thread_participant" USING btree ("threadId","userId");--> statement-breakpoint
CREATE INDEX "mail_participant_user_folder_idx" ON "mail_thread_participant" USING btree ("userId","folder","updatedAt");