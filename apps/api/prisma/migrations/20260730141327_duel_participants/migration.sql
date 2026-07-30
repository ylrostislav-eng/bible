-- AlterEnum
ALTER TYPE "GameMode" ADD VALUE 'DUEL';

-- AlterEnum
ALTER TYPE "GameSessionStatus" ADD VALUE 'WAITING_FOR_OPPONENT';

-- DropForeignKey
ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_userId_fkey";

-- DropIndex
DROP INDEX "game_answers_sessionId_order_key";

-- DropIndex
DROP INDEX "game_sessions_userId_idx";

-- AlterTable
ALTER TABLE "game_answers" ADD COLUMN     "participantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "game_sessions" DROP COLUMN "coinsEarned",
DROP COLUMN "correctCount",
DROP COLUMN "score",
DROP COLUMN "userId",
DROP COLUMN "xpEarned",
ADD COLUMN     "currentOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentQuestionStartedAt" TIMESTAMP(3),
ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "timeLimitSeconds" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "game_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_participants_sessionId_userId_key" ON "game_participants"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_answers_participantId_order_key" ON "game_answers"("participantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_inviteCode_key" ON "game_sessions"("inviteCode");

-- AddForeignKey
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "game_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

