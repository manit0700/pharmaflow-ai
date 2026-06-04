-- CreateTable
CREATE TABLE "CallJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "callReason" TEXT NOT NULL,
    "notes" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationError" TEXT,
    "callStatus" TEXT NOT NULL DEFAULT 'queued',
    "twilioCallSid" TEXT,
    "callAttemptedAt" DATETIME,
    "callCompletedAt" DATETIME,
    "callDuration" INTEGER,
    "patientResponse" TEXT,
    "aiSummary" TEXT,
    "staffFollowUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "followUpReason" TEXT,
    "smsStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callJobId" TEXT,
    "patientName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "medicationName" TEXT,
    "taskType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "aiSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffTask_callJobId_fkey" FOREIGN KEY ("callJobId") REFERENCES "CallJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboundCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callerPhone" TEXT NOT NULL,
    "intent" TEXT,
    "patientName" TEXT,
    "dob" TEXT,
    "medicationName" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "handoffReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callJobId" TEXT,
    "twilioCallSid" TEXT,
    "eventType" TEXT NOT NULL,
    "eventPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallEvent_callJobId_fkey" FOREIGN KEY ("callJobId") REFERENCES "CallJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
