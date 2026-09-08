-- Правка содержимого игры (вопросы, ответы, слова) — тоже действие
-- администратора и тоже попадает в журнал.
ALTER TYPE "AdminActionKind" ADD VALUE 'EDIT_CONTENT';
ALTER TYPE "AdminActionKind" ADD VALUE 'CREATE_CONTENT';
ALTER TYPE "AdminActionKind" ADD VALUE 'DELETE_CONTENT';
