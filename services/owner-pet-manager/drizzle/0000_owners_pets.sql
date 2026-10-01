CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"photo" text,
	"active" boolean DEFAULT true NOT NULL,
	"pet_list_visibility" text DEFAULT 'private' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"sex" text NOT NULL,
	"breed" text,
	"date_of_birth" text,
	"photo" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owners_username_uidx" ON "owners" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_email_lower_uidx" ON "owners" USING btree (lower("email"));