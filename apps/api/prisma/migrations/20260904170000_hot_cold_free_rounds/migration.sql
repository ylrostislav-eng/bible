-- DropIndex
DROP INDEX "hot_cold_attempts_userId_date_key";

-- DropIndex
DROP INDEX "hot_cold_feedback_userId_date_guess_key";

-- AlterTable
ALTER TABLE "hot_cold_attempts" ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_attempts_userId_date_round_key" ON "hot_cold_attempts"("userId", "date", "round");

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_feedback_userId_date_wordId_guess_key" ON "hot_cold_feedback"("userId", "date", "wordId", "guess");

