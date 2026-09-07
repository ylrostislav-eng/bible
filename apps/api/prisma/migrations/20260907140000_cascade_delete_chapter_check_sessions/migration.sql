-- Удаление игрока падало на внешнем ключе: связь сессий проверки главы с
-- пользователем была единственной на RESTRICT, все остальные — на CASCADE.
-- DropForeignKey
ALTER TABLE "chapter_check_sessions" DROP CONSTRAINT "chapter_check_sessions_userId_fkey";

-- AddForeignKey
ALTER TABLE "chapter_check_sessions" ADD CONSTRAINT "chapter_check_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
