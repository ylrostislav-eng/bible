-- Словарь в дуэли: три поиска на игрока за партию, личные и независимые.
-- Хранятся в базе, а не в памяти: поиск переживает переподключение, и
-- показанные слова не должны повторяться в следующем поиске.
ALTER TABLE "hot_cold_duel_players"
  ADD COLUMN "lookups" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "lookupCount" INTEGER NOT NULL DEFAULT 0;
