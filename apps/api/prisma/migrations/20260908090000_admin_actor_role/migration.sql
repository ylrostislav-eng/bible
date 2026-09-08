-- Роль в журнале: гейм-мастер один, администраторов несколько, и по
-- записи должно быть видно, кто именно воспользовался правом.
CREATE TYPE "AdminActorRole" AS ENUM ('GAME_MASTER', 'ADMIN');

ALTER TABLE "admin_actions" ADD COLUMN "actorRole" "AdminActorRole" NOT NULL DEFAULT 'ADMIN';
