-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "targetUserId" TEXT;

-- CreateIndex
CREATE INDEX "game_sessions_targetUserId_status_idx" ON "game_sessions"("targetUserId", "status");
