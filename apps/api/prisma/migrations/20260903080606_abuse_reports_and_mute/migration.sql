-- CreateEnum
CREATE TYPE "AbuseReportKind" AS ENUM ('USER', 'MESSAGE');

-- CreateEnum
CREATE TYPE "AbuseReportReason" AS ENUM ('INSULT', 'SPAM', 'INAPPROPRIATE', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AbuseReportStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mutedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" TEXT NOT NULL,
    "kind" "AbuseReportKind" NOT NULL,
    "reason" "AbuseReportReason" NOT NULL,
    "comment" TEXT,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "messageId" TEXT,
    "messageBody" TEXT,
    "status" "AbuseReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abuse_reports_status_createdAt_idx" ON "abuse_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "abuse_reports_targetUserId_status_idx" ON "abuse_reports"("targetUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "abuse_reports_reporterId_targetUserId_messageId_key" ON "abuse_reports"("reporterId", "targetUserId", "messageId");

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
