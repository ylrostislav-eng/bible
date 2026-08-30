-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friend_requests_toUserId_status_idx" ON "friend_requests"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_fromUserId_toUserId_key" ON "friend_requests"("fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "friendships_friendId_idx" ON "friendships"("friendId");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_userId_friendId_key" ON "friendships"("userId", "friendId");

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
