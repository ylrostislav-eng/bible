-- CreateTable
CREATE TABLE "room_invites" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_invites_toUserId_idx" ON "room_invites"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "room_invites_sessionId_toUserId_key" ON "room_invites"("sessionId", "toUserId");

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
