-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityDate" DATE,
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chapter_questions" (
    "id" TEXT NOT NULL,
    "bookId" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_check_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "currentQuestionStartedAt" TIMESTAMP(3),
    "timeLimitSeconds" INTEGER NOT NULL DEFAULT 20,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_check_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_check_answers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "selectedIndex" INTEGER,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "timeExpired" BOOLEAN NOT NULL DEFAULT false,
    "timeTakenMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_check_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chapter_questions_bookId_chapter_idx" ON "chapter_questions"("bookId", "chapter");

-- CreateIndex
CREATE INDEX "chapter_check_sessions_userId_idx" ON "chapter_check_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_check_answers_sessionId_questionId_key" ON "chapter_check_answers"("sessionId", "questionId");

-- AddForeignKey
ALTER TABLE "chapter_check_sessions" ADD CONSTRAINT "chapter_check_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_check_answers" ADD CONSTRAINT "chapter_check_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chapter_check_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_check_answers" ADD CONSTRAINT "chapter_check_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "chapter_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
