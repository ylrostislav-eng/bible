-- AlterTable
ALTER TABLE "hot_cold_attempts" ADD COLUMN     "gaveUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hints" JSONB NOT NULL DEFAULT '[]';

