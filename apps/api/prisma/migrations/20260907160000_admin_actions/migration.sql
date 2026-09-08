-- Журнал администраторских действий. Без внешних ключей на "users":
-- запись об удалении аккаунта должна пережить сам аккаунт.
CREATE TYPE "AdminActionKind" AS ENUM ('MUTE', 'UNMUTE', 'RENAME', 'ADJUST_BALANCE', 'DELETE_ACCOUNT', 'CLOSE_SESSION', 'BROADCAST');

CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "adminNickname" TEXT,
    "kind" "AdminActionKind" NOT NULL,
    "targetUserId" TEXT,
    "targetNickname" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_actions_createdAt_idx" ON "admin_actions"("createdAt");
CREATE INDEX "admin_actions_targetUserId_createdAt_idx" ON "admin_actions"("targetUserId", "createdAt");
