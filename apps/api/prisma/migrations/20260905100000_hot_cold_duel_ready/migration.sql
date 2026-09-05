-- Готовность перед стартом: партия ждёт «готов» от обоих, потом идёт
-- отсчёт «3-2-1». Без этого игра начиналась в ту же секунду, когда
-- находился соперник, и часы шли, пока человек ещё читал экран.
ALTER TYPE "HotColdDuelStatus" ADD VALUE IF NOT EXISTS 'READY_CHECK' BEFORE 'IN_PROGRESS';

ALTER TABLE "hot_cold_duels" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "hot_cold_duel_players" ADD COLUMN "readyAt" TIMESTAMP(3);
