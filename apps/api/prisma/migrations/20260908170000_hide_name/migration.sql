-- Скрытое имя гейм-мастера и администраторов: вместо никнейма везде
-- остаётся значок роли. Только для них — см. комментарий в схеме.
ALTER TABLE "users" ADD COLUMN "hideName" BOOLEAN NOT NULL DEFAULT false;
