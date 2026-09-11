ALTER TABLE "dice_matches"
  ADD COLUMN "botDifficulty" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "turnStartedAt" TIMESTAMP(3),
  ADD COLUMN "botActionAt" TIMESTAMP(3),
  ADD COLUMN "lastEvents" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "rematchOfId" TEXT,
  ADD COLUMN "targetOpponentId" TEXT;
UPDATE "dice_matches" SET "turnStartedAt" = "lastActionAt" WHERE "status" = 'IN_PROGRESS';
CREATE UNIQUE INDEX "dice_matches_rematchOfId_key" ON "dice_matches"("rematchOfId");
CREATE INDEX "dice_matches_status_botActionAt_idx" ON "dice_matches"("status", "botActionAt");
CREATE UNIQUE INDEX "dice_match_players_matchId_seat_key" ON "dice_match_players"("matchId", "seat");
CREATE TABLE "dice_match_actions" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "version" INTEGER NOT NULL,
  "events" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dice_match_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dice_match_actions_matchId_userId_actionId_key" ON "dice_match_actions"("matchId", "userId", "actionId");
CREATE INDEX "dice_match_actions_matchId_version_idx" ON "dice_match_actions"("matchId", "version");
ALTER TABLE "dice_match_actions" ADD CONSTRAINT "dice_match_actions_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "dice_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
