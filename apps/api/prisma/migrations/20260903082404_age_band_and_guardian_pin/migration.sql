-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('CHILD', 'TEEN', 'ADULT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ageBand" "AgeBand",
ADD COLUMN     "guardianConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "guardianPinHash" TEXT;
