-- Музыка в партиях, а не только в меню. Отдельно от `musicEnabled`:
-- «хочу ли я музыку вообще» и «мешает ли она мне играть» — разные
-- вопросы, и одним тумблером второй не решается.
ALTER TABLE "users" ADD COLUMN "musicInGames" BOOLEAN NOT NULL DEFAULT true;
