-- CreateTable
CREATE TABLE "hot_cold_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "guess" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hot_cold_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hot_cold_feedback_wordId_guess_idx" ON "hot_cold_feedback"("wordId", "guess");

-- CreateIndex
CREATE UNIQUE INDEX "hot_cold_feedback_userId_date_guess_key" ON "hot_cold_feedback"("userId", "date", "guess");

-- AddForeignKey
ALTER TABLE "hot_cold_feedback" ADD CONSTRAINT "hot_cold_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_cold_feedback" ADD CONSTRAINT "hot_cold_feedback_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "alias_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
