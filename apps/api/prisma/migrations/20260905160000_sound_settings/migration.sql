-- Настройки звука. Хранятся в профиле, а не в браузере: человек заходит с
-- телефона и с компьютера, и «выключил музыку» должно значить «выключил», а
-- не «выключил на этом устройстве».
ALTER TABLE "users"
  ADD COLUMN "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "musicEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hapticsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "soundVolume" INTEGER NOT NULL DEFAULT 70;
