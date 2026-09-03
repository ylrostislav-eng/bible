import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';

/** How often the sweep looks for people to remind. The window below is two
 * hours wide, so this is frequent enough that nobody falls through it and
 * rare enough to be invisible in the database's load. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * The player's own local hours during which a reminder may go out. Evening
 * on purpose: early enough that there's still time to play, late enough
 * that most people have finished their day. Nothing is ever sent at night —
 * a streak isn't worth waking someone up for.
 */
const REMIND_FROM_HOUR = 19;
const REMIND_UNTIL_HOUR = 21;

/** Guard against a runaway sweep on a large database. Anyone missed is
 * picked up by the next pass ten minutes later, still inside the window. */
const MAX_PER_SWEEP = 200;

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramBotService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error) =>
        this.logger.warn(`Reminder sweep failed: ${String(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The calendar day a moment falls on for someone at this UTC offset,
   * as a UTC-midnight `Date` — the same representation `lastActivityDate`
   * is stored in. Mirrors `UsersService.localDateLabel`. */
  private localDateLabel(at: Date, offsetMinutes: number): Date {
    const shifted = new Date(at.getTime() - offsetMinutes * 60_000);
    return new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ),
    );
  }

  private localHour(at: Date, offsetMinutes: number): number {
    return new Date(at.getTime() - offsetMinutes * 60_000).getUTCHours();
  }

  /**
   * Sends the evening "your streak is about to lapse" reminder.
   *
   * Deliberately narrow about who gets one. A reminder is an interruption
   * on someone's phone, so it only goes to a person who (a) asked for it by
   * leaving the setting on, (b) has a streak that is actually about to be
   * lost — they played yesterday and haven't played today — and (c) is in
   * their own evening right now. Anyone who already played today gets
   * nothing: there is nothing to warn them about.
   *
   * Exported (rather than private) so it can be driven directly in tests
   * instead of waiting out a ten-minute timer.
   */
  async sweep(
    now: Date = new Date(),
  ): Promise<{ sent: number; skipped: number }> {
    // The window is a local-time condition and the offset is per-user, so it
    // can't be a SQL predicate. Narrow as far as the database can — reminders
    // on, a live streak, active within the last two days — and decide the
    // rest in memory over that much smaller set.
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
    const candidates = await this.prisma.user.findMany({
      where: {
        remindersEnabled: true,
        currentStreak: { gte: 1 },
        nickname: { not: null },
        lastActivityDate: { gte: twoDaysAgo },
      },
      select: {
        id: true,
        telegramId: true,
        nickname: true,
        currentStreak: true,
        lastActivityDate: true,
        lastReminderAt: true,
        timezoneOffsetMinutes: true,
      },
      take: MAX_PER_SWEEP,
    });

    let sent = 0;
    let skipped = 0;

    for (const user of candidates) {
      const offset = user.timezoneOffsetMinutes;
      const hour = this.localHour(now, offset);
      if (hour < REMIND_FROM_HOUR || hour >= REMIND_UNTIL_HOUR) {
        skipped++;
        continue;
      }

      const today = this.localDateLabel(now, offset);
      // Already played today — the streak is safe, so there is nothing to
      // say. This is the single most important check here: reminding
      // someone who already showed up is how an app teaches people to
      // ignore it.
      if (user.lastActivityDate?.getTime() === today.getTime()) {
        skipped++;
        continue;
      }
      // Streak already broken (last played before yesterday) — a "you're
      // about to lose it" message would simply be false.
      const yesterday = new Date(today.getTime() - 86_400_000);
      if (user.lastActivityDate?.getTime() !== yesterday.getTime()) {
        skipped++;
        continue;
      }
      // One per day, measured in the player's own days.
      if (
        user.lastReminderAt &&
        this.localDateLabel(user.lastReminderAt, offset).getTime() ===
          today.getTime()
      ) {
        skipped++;
        continue;
      }

      const result = await this.telegram.sendMessage(
        user.telegramId,
        this.reminderText(user.currentStreak),
      );

      if (result.status === 'sent') {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastReminderAt: now },
        });
        sent++;
      } else if (result.status === 'blocked') {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { remindersEnabled: false },
        });
        this.logger.log(`Reminders disabled for ${user.id} (bot blocked)`);
        skipped++;
      } else {
        // `disabled` (no token) and `failed` both leave `lastReminderAt`
        // alone, so the next sweep tries again while the window is open.
        skipped++;
        if (result.status === 'failed') {
          this.logger.warn(`Reminder to ${user.id} failed: ${result.reason}`);
        }
      }
    }

    return { sent, skipped };
  }

  /** One sentence, no markup, and it says what is at stake in the player's
   * own terms — not "come back", which is about the app's interests. */
  private reminderText(streak: number): string {
    const days =
      streak % 10 === 1 && streak % 100 !== 11
        ? 'день'
        : [2, 3, 4].includes(streak % 10) &&
            ![12, 13, 14].includes(streak % 100)
          ? 'дня'
          : 'дней';
    return `Ваша серия — ${streak} ${days} подряд. Одна игра сегодня, и она продолжится.`;
  }
}
