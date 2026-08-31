-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterEnum
ALTER TYPE "GameMode" ADD VALUE 'ROOM';

-- AlterEnum
ALTER TYPE "GameSessionStatus" ADD VALUE 'LOBBY';

-- AlterTable
ALTER TABLE "game_participants" ADD COLUMN     "isLeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReady" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "leaderId" TEXT,
ADD COLUMN     "maxParticipants" INTEGER,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "roomName" TEXT,
ADD COLUMN     "visibility" "RoomVisibility";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "roomRatingCapDate" DATE,
ADD COLUMN     "roomRatingPointsToday" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "room_bans" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "bannedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_bans_leaderId_bannedUserId_key" ON "room_bans"("leaderId", "bannedUserId");

-- CreateIndex
CREATE INDEX "game_sessions_mode_status_visibility_idx" ON "game_sessions"("mode", "status", "visibility");

-- AddForeignKey
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_bannedUserId_fkey" FOREIGN KEY ("bannedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
