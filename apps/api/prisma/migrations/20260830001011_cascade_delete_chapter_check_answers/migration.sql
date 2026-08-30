-- DropForeignKey
ALTER TABLE "chapter_check_answers" DROP CONSTRAINT "chapter_check_answers_questionId_fkey";

-- DropForeignKey
ALTER TABLE "chapter_check_answers" DROP CONSTRAINT "chapter_check_answers_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "chapter_check_answers" ADD CONSTRAINT "chapter_check_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chapter_check_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_check_answers" ADD CONSTRAINT "chapter_check_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "chapter_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
