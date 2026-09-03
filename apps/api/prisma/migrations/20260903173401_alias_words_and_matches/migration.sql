-- CreateEnum
CREATE TYPE "AliasDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AliasCategory" AS ENUM ('PERSON', 'PLACE', 'EVENT', 'OBJECT', 'CONCEPT', 'PARABLE');

-- CreateEnum
CREATE TYPE "AliasTestament" AS ENUM ('OLD', 'NEW', 'BOTH');

-- CreateTable
CREATE TABLE "alias_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "difficulty" "AliasDifficulty" NOT NULL,
    "category" "AliasCategory" NOT NULL,
    "testament" "AliasTestament" NOT NULL,
    "gloss" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_matches" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "teams" JSONB NOT NULL,
    "winnerName" TEXT,
    "roundsPlayed" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alias_words_word_key" ON "alias_words"("word");

-- CreateIndex
CREATE INDEX "alias_words_difficulty_idx" ON "alias_words"("difficulty");

-- CreateIndex
CREATE INDEX "alias_words_category_idx" ON "alias_words"("category");

-- CreateIndex
CREATE INDEX "alias_matches_hostUserId_playedAt_idx" ON "alias_matches"("hostUserId", "playedAt");

-- AddForeignKey
ALTER TABLE "alias_matches" ADD CONSTRAINT "alias_matches_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
