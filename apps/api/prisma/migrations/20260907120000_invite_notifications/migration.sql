-- Сообщение в Telegram, когда игрока зовут в игру при закрытом приложении.
-- Отдельно от `remindersEnabled`: выключить надоевшее напоминание про серию
-- и остаться доступным для друзей — разные желания.
ALTER TABLE "users" ADD COLUMN "inviteNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
