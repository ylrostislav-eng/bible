-- CreateEnum
CREATE TYPE "ErrorReportSource" AS ENUM ('API', 'WEB');

-- CreateTable
CREATE TABLE "error_reports" (
    "id" TEXT NOT NULL,
    "source" "ErrorReportSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "statusCode" INTEGER,
    "path" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "extra" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_reports_resolved_createdAt_idx" ON "error_reports"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "error_reports_source_kind_createdAt_idx" ON "error_reports"("source", "kind", "createdAt");
