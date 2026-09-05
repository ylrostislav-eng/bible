-- Общие подсказки дуэли: одна на двоих, по согласию обоих. Предложение
-- хранится в партии, а не летит сообщением: сообщение можно не увидеть,
-- если экран был закрыт, а согласие спрашивают у второго игрока.
ALTER TABLE "hot_cold_duels"
  ADD COLUMN "hints" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "hintsTaken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hintRequestedBy" TEXT;
