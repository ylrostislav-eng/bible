-- CreateTable
CREATE TABLE "bible_verses" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bible_verses_bookId_chapter_idx" ON "bible_verses"("bookId", "chapter");

-- CreateIndex
CREATE UNIQUE INDEX "bible_verses_bookId_chapter_verse_key" ON "bible_verses"("bookId", "chapter", "verse");
