-- Когда слово правили. У уже залитых слов ставим время создания: это
-- честнее, чем «только что», и не выдаёт старую заливку за свежую правку.
ALTER TABLE "alias_words" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "alias_words" SET "updatedAt" = "createdAt";
