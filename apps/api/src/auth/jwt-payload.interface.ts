export interface JwtPayload {
  /** User id (matches Prisma User.id) */
  sub: string;
  telegramId: string;
}
