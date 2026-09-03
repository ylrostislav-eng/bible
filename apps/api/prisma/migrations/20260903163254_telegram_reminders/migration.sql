-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;
