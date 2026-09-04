-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "openToMatchmaking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "hot_cold_duels" ADD COLUMN     "openToMatchmaking" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "game_sessions_mode_status_openToMatchmaking_idx" ON "game_sessions"("mode", "status", "openToMatchmaking");

-- CreateIndex
CREATE INDEX "hot_cold_duels_status_openToMatchmaking_idx" ON "hot_cold_duels"("status", "openToMatchmaking");

