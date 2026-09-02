-- CreateEnum
CREATE TYPE "DeclineNoticeKind" AS ENUM ('DUEL_CHALLENGE', 'ROOM_INVITE');

-- CreateTable
CREATE TABLE "decline_notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DeclineNoticeKind" NOT NULL,
    "declinedByUserId" TEXT NOT NULL,
    "roomName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decline_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decline_notices_userId_idx" ON "decline_notices"("userId");

-- AddForeignKey
ALTER TABLE "decline_notices" ADD CONSTRAINT "decline_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decline_notices" ADD CONSTRAINT "decline_notices_declinedByUserId_fkey" FOREIGN KEY ("declinedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
