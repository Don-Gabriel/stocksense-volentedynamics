CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE "CodePurpose" AS ENUM ('RESET_PASSWORD', 'VERIFY_EMAIL');
ALTER TABLE "User" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'PENDING', ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PasswordReset" ADD COLUMN "purpose" "CodePurpose" NOT NULL DEFAULT 'RESET_PASSWORD';
-- Only the explicitly fictional local demo identities are pre-verified.
UPDATE "User" SET "status"='ACTIVE', "emailVerifiedAt"=CURRENT_TIMESTAMP
WHERE ("username"='manager' AND "email"='manager@stocksense.local') OR ("username"='warehouse' AND "email"='warehouse@stocksense.local');
CREATE INDEX "PasswordReset_userId_purpose_createdAt_idx" ON "PasswordReset"("userId", "purpose", "createdAt");
