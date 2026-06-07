-- AlterTable
ALTER TABLE "CallJob" ADD COLUMN "parentCallJobId" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "retryOfCallJobId" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "retryAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CallJob" ADD COLUMN "maxRetryAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CallJob" ADD COLUMN "scheduledFor" DATETIME;
ALTER TABLE "CallJob" ADD COLUMN "retryReason" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "retryStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "CallJob" ADD COLUMN "createdFromOutcome" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "relatedTaskId" TEXT;

CREATE INDEX IF NOT EXISTS "CallJob_retryOfCallJobId_idx" ON "CallJob"("retryOfCallJobId");
CREATE INDEX IF NOT EXISTS "CallJob_parentCallJobId_idx" ON "CallJob"("parentCallJobId");
CREATE INDEX IF NOT EXISTS "CallJob_scheduledFor_idx" ON "CallJob"("scheduledFor");
CREATE INDEX IF NOT EXISTS "CallJob_retryStatus_idx" ON "CallJob"("retryStatus");
