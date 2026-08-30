-- AlterTable
ALTER TABLE "game_participants" ADD COLUMN     "ratingCapped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratingDelta" INTEGER NOT NULL DEFAULT 0;
