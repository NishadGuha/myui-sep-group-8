
alter table "public"."users" add column "password" text
 null;

alter table "public"."users" drop column "email" cascade;
