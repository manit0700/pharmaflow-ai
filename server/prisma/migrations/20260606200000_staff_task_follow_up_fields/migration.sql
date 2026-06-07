-- AlterTable
ALTER TABLE "StaffTask" ADD COLUMN "assignedTeam" TEXT NOT NULL DEFAULT 'Unassigned';
ALTER TABLE "StaffTask" ADD COLUMN "dueDate" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "dueTime" TEXT NOT NULL DEFAULT '15:00';
ALTER TABLE "StaffTask" ADD COLUMN "sourceWorkflow" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "issueSummary" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "activityJson" TEXT;
