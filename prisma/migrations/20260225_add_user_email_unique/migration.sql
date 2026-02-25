-- AddUniqueConstraint: User.email
-- Prevents email-collision account takeover during Clerk→Supabase migration
ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
