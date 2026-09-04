-- CreateTable
CREATE TABLE "daily_word_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "wordId" TEXT NOT NULL,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" TIMESTAMP(3),
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_word_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_word_attempts_date_idx" ON "daily_word_attempts"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_word_attempts_userId_date_key" ON "daily_word_attempts"("userId", "date");

-- AddForeignKey
ALTER TABLE "daily_word_attempts" ADD CONSTRAINT "daily_word_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_word_attempts" ADD CONSTRAINT "daily_word_attempts_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "alias_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
