-- CreateEnum
CREATE TYPE "QuestionPace" AS ENUM ('NORMAL', 'RELAXED', 'UNTIMED');

-- CreateEnum
CREATE TYPE "TextScale" AS ENUM ('NORMAL', 'LARGE', 'XLARGE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "questionPace" "QuestionPace" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "textScale" "TextScale" NOT NULL DEFAULT 'NORMAL';
