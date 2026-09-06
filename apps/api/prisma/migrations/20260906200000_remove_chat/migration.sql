-- Личная переписка убрана из приложения.
--
-- Приглашения в игры, вызовы на дуэль и заявки в друзья остаются — уходит
-- только возможность писать друг другу произвольный текст.
--
-- Таблица удаляется вместе с данными, а не остаётся «на всякий случай».
-- Переписка, которую никто больше не может ни прочитать, ни удалить, — это
-- чужие личные данные, лежащие у нас без причины. Держать их дороже, чем
-- потерять.
DROP TABLE IF EXISTS "chat_messages";

-- Жалобы на конкретное сообщение больше не бывает: жаловаться можно на
-- человека. Прежние жалобы на сообщения остаются в таблице как жалобы на
-- их автора — это по-прежнему верно по смыслу.
--
-- Уникальность была по тройке (кто, на кого, сообщение) — с NULL в
-- последнем поле Postgres считает такие строки различными, то есть на
-- одного человека можно было пожаловаться много раз. Теперь пара, и
-- дубликаты надо убрать до создания индекса.
DELETE FROM "abuse_reports" a
USING "abuse_reports" b
WHERE a."reporterId" = b."reporterId"
  AND a."targetUserId" = b."targetUserId"
  AND a."createdAt" > b."createdAt";

DROP INDEX IF EXISTS "abuse_reports_reporterId_targetUserId_messageId_key";
ALTER TABLE "abuse_reports" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "abuse_reports" DROP COLUMN IF EXISTS "messageId";
ALTER TABLE "abuse_reports" DROP COLUMN IF EXISTS "messageBody";
CREATE UNIQUE INDEX "abuse_reports_reporterId_targetUserId_key"
  ON "abuse_reports"("reporterId", "targetUserId");

DROP TYPE IF EXISTS "AbuseReportKind";
