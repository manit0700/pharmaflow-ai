-- Bring existing local SQLite databases in line with the current CallJob model.
ALTER TABLE "CallJob" ADD COLUMN "transcriptJson" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "messagesJson" TEXT;
ALTER TABLE "CallJob" ADD COLUMN "aiConfidence" REAL;
ALTER TABLE "CallJob" ADD COLUMN "resolutionStatus" TEXT;
