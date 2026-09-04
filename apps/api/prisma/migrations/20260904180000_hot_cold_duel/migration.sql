-- CreateEnum
CREATE TYPE "HotColdDuelStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "hot_cold_duels" (
    "id" TEXT NOT NULL,
    "status" "HotColdDuelStatus" NOT NULL DEFAULT 'WAITING',
    "inviteCode" TEXT NOT NULL,
    "targetUserId" TEXT,
    "wordId" TEXT NOT NULL,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "hot_cold_duels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_cold_duel_players" (
    "id" TEXT NOT NULL,
    "duelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guesses" JSONB NOT NULL DEFAULT '[]',
    "guessCount" INTEGER NOT NULL DEFAULT 0,
    "bestRank" INTEGER,
    "solvedAt" TIMESTAMP(3),
    "surrenderedAt" TIMESTAMP(3),
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "ratingDelta" INTEGER NOT NULL DEFAULT 0,
    "ratingCapped" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hot_cold_duel_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_duels_inviteCode_key" ON "hot_cold_duels"("inviteCode");

-- CreateIndex
CREATE INDEX "hot_cold_duels_targetUserId_status_idx" ON "hot_cold_duels"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "hot_cold_duels_status_createdAt_idx" ON "hot_cold_duels"("status", "createdAt");

-- CreateIndex
CREATE INDEX "hot_cold_duel_players_userId_duelId_idx" ON "hot_cold_duel_players"("userId", "duelId");

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_duel_players_duelId_userId_key" ON "hot_cold_duel_players"("duelId", "userId");

-- AddForeignKey
ALTER TABLE "hot_cold_duels" ADD CONSTRAINT "hot_cold_duels_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "alias_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_cold_duel_players" ADD CONSTRAINT "hot_cold_duel_players_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "hot_cold_duels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_cold_duel_players" ADD CONSTRAINT "hot_cold_duel_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

