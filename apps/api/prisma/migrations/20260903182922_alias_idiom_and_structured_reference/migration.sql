/*
  Warnings:

  - You are about to drop the column `reference` on the `alias_words` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AliasCategory" ADD VALUE 'IDIOM';

-- AlterTable
ALTER TABLE "alias_words" DROP COLUMN "reference",
ADD COLUMN     "refBookId" INTEGER,
ADD COLUMN     "refChapter" INTEGER,
ADD COLUMN     "refVerse" INTEGER;
