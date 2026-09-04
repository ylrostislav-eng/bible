-- AlterTable
ALTER TABLE "alias_words" ADD COLUMN     "accepts" TEXT[] DEFAULT ARRAY[]::TEXT[];
