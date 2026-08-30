-- AlterTable
ALTER TABLE "game_answers" ADD COLUMN     "shuffledCorrectIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shuffledOptions" TEXT[];
