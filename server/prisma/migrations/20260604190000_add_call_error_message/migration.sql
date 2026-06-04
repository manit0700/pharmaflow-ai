-- Add non-PHI operational error details for Twilio/API failures.
ALTER TABLE "CallJob" ADD COLUMN "errorMessage" TEXT;
