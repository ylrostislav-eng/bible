-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarFrame" TEXT,
ADD COLUMN     "dailyWordRetries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nameColor" TEXT,
ADD COLUMN     "streakFreezes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shop_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_purchases_userId_idx" ON "shop_purchases"("userId");

-- CreateIndex
CREATE INDEX "shop_purchases_userId_itemId_idx" ON "shop_purchases"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

