-- Data fix: accounts created before the rating baseline moved from 1000 to
-- 100 (see 20260830000446_titles_rating_rebase_and_shuffled_options,
-- applied 2026-08-30 00:04:46 UTC) are still sitting on the old scale.
-- Shift them down by 900 so their earned progress carries over onto the
-- new scale — the same net position a fresh account created after that
-- migration would already be at. Accounts created after that migration
-- already default to 100 and are untouched. The cutoff is a literal
-- timestamp (not a lookup against _prisma_migrations) so this replays
-- cleanly against Prisma's shadow database too.
UPDATE "users"
SET "rating" = "rating" - 900
WHERE "createdAt" < '2026-08-30 00:04:46.137651'::timestamp;
