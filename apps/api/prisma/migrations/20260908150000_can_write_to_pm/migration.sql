-- Разрешение бота писать в личные сообщения. По умолчанию false: у тех,
-- кто нажимал Start в боте, оно проставится при первом же входе из
-- initData (allows_write_to_pm), а отправку уведомлений флаг не
-- загораживает — см. комментарий в схеме.
ALTER TABLE "users" ADD COLUMN "canWriteToPm" BOOLEAN NOT NULL DEFAULT false;
