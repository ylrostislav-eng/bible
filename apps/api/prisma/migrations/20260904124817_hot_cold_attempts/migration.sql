-- CreateTable
CREATE TABLE "hot_cold_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "wordId" TEXT NOT NULL,
    "guesses" JSONB NOT NULL DEFAULT '[]',
    "guessCount" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" TIMESTAMP(3),
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_cold_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hot_cold_attempts_date_idx" ON "hot_cold_attempts"("date");

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_attempts_userId_date_key" ON "hot_cold_attempts"("userId", "date");

-- AddForeignKey
ALTER TABLE "hot_cold_attempts" ADD CONSTRAINT "hot_cold_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_cold_attempts" ADD CONSTRAINT "hot_cold_attempts_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "alias_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
