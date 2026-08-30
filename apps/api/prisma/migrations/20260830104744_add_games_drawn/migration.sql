-- AlterTable
ALTER TABLE "users" ADD COLUMN "gamesDrawn" INTEGER NOT NULL DEFAULT 0;

-- Backfill: duelsPlayed is the count of all completed duels (win, loss, or
-- draw) as of the previous migration's backfill, so whatever's left after
-- subtracting the decisive outcomes must have been draws.
UPDATE "users"
SET "gamesDrawn" = "duelsPlayed" - "gamesWon" - "gamesLost"
WHERE "duelsPlayed" - "gamesWon" - "gamesLost" > 0;
