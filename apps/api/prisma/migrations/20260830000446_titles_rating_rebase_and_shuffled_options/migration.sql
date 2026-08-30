-- AlterTable
ALTER TABLE "chapter_check_answers" ADD COLUMN     "shuffledCorrectIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shuffledOptions" TEXT[];

-- AlterTable
ALTER TABLE "chapter_check_sessions" ADD COLUMN     "rewarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "duelRatingCapDate" DATE,
ADD COLUMN     "duelRatingWinsToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "rating" SET DEFAULT 100;
