-- CreateEnum
CREATE TYPE "DiceMatchStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "dice_matches" (
    "id" TEXT NOT NULL,
    "status" "DiceMatchStatus" NOT NULL DEFAULT 'WAITING',
    "inviteCode" TEXT NOT NULL,
    "openToMatchmaking" BOOLEAN NOT NULL DEFAULT false,
    "targetScore" INTEGER NOT NULL DEFAULT 4000,
    "turnTimeLimit" INTEGER,
    "state" JSONB NOT NULL,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dice_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dice_match_players" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "bustCount" INTEGER NOT NULL DEFAULT 0,
    "hotDiceCount" INTEGER NOT NULL DEFAULT 0,
    "bestTurn" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dice_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dice_rolls" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "rollNumber" INTEGER NOT NULL,
    "dice" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dice_rolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dice_matches_inviteCode_key" ON "dice_matches"("inviteCode");

-- CreateIndex
CREATE INDEX "dice_matches_status_openToMatchmaking_createdAt_idx" ON "dice_matches"("status", "openToMatchmaking", "createdAt");

-- CreateIndex
CREATE INDEX "dice_matches_status_lastActionAt_idx" ON "dice_matches"("status", "lastActionAt");

-- CreateIndex
CREATE INDEX "dice_match_players_userId_idx" ON "dice_match_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dice_match_players_matchId_userId_key" ON "dice_match_players"("matchId", "userId");

-- CreateIndex
CREATE INDEX "dice_rolls_matchId_createdAt_idx" ON "dice_rolls"("matchId", "createdAt");

-- AddForeignKey
ALTER TABLE "dice_match_players" ADD CONSTRAINT "dice_match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "dice_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dice_match_players" ADD CONSTRAINT "dice_match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dice_rolls" ADD CONSTRAINT "dice_rolls_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "dice_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

