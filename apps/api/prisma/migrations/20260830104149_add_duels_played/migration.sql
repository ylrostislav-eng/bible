-- AlterTable
ALTER TABLE "users" ADD COLUMN "duelsPlayed" INTEGER NOT NULL DEFAULT 0;

-- Backfill from actual history: count of completed DUEL sessions each user
-- participated in. Distinct from `gamesWon + gamesLost` because it also
-- includes draws, which never increment either of those.
UPDATE "users" u
SET "duelsPlayed" = counted.total
FROM (
  SELECT gp."userId" AS "userId", COUNT(*) AS total
  FROM "game_participants" gp
  JOIN "game_sessions" gs ON gs.id = gp."sessionId"
  WHERE gs.mode = 'DUEL' AND gs.status = 'COMPLETED'
  GROUP BY gp."userId"
) counted
WHERE u.id = counted."userId";
