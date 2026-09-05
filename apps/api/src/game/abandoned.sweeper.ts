import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Уборка брошенных партий.
 *
 * ## Что здесь на самом деле ломалось
 *
 * Дуэль, из которой ушёл один игрок, доигрывается сама: оставшийся
 * опрашивает состояние, `resolveIfReady` засчитывает ушедшему промахи по
 * таймауту, и партия доходит до конца. Это работает и здесь не трогается.
 *
 * Ломается другой случай — когда ушли **оба**. Тогда состояние никто не
 * запрашивает, а значит и двигать партию некому: она остаётся
 * `IN_PROGRESS` навсегда. Для игрока это выглядит так, что вкладка
 * «Играть» упорно возвращает в мёртвую партию, а «найти соперника»
 * отдаёт её же вместо новой — `findOpponent` честно возвращает
 * существующую активную дуэль, и пока та не закрыта, новую не начать.
 *
 * Сюда же ожидание, которое никто не отменил: создал дуэль по коду,
 * отправил его другу, друг не пришёл — партия висит в
 * `WAITING_FOR_OPPONENT`. Кнопка отмены есть, но требовать её нажатия
 * от того, кто уже закрыл приложение, бессмысленно.
 *
 * ## Почему без наград
 *
 * Брошенная партия не доиграна, и раздавать за неё опыт нельзя: иначе
 * появляется способ получать награду, начиная партии и уходя. Статус
 * `ABANDONED` — это «не состоялось», а не «ничья».
 *
 * Проигрывающему это тоже не лазейка: пока в партии остаётся живой
 * соперник, она доигрывается без ушедшего и заканчивается его
 * поражением. Сюда попадают только те, где не осталось никого.
 */

/** Как часто проверять. Реже, чем у комнат: тут нечему разваливаться. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Сколько ждать соперника, который не пришёл.
 *
 * Полчаса — это про человека, а не про технику: код отправляют в
 * переписке, и друг может открыть её не сразу.
 */
const WAITING_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Сколько молчания считать уходом обоих.
 *
 * Считается от начала текущего вопроса. У живой партии это поле
 * обновляется на каждом переходе, поэтому двадцать минут набегают только
 * там, где действительно никого не осталось. Запас нарочно велик:
 * оставшийся мог отложить телефон на экране разбора, и обрывать ему
 * партию было бы хуже, чем подержать её лишние четверть часа.
 */
const SILENCE_THRESHOLD_MS = 20 * 60 * 1000;

/**
 * Сколько живёт незавершённая одиночная партия.
 *
 * Тут спешить некуда — соперника нет, никому не мешает. Сутки берутся
 * не ради базы, а потому что вкладка «Играть» возвращает в активную
 * партию: через день человек уже не помнит, на чём остановился, и
 * встреча со старым вопросом читается как поломка.
 */
const SOLO_THRESHOLD_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AbandonedSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AbandonedSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Возвращает, сколько партий закрыто — по нему же написан тест. */
  async sweep(): Promise<number> {
    try {
      const now = Date.now();
      const closed = await this.prisma.gameSession.updateMany({
        where: {
          OR: [
            {
              mode: 'DUEL',
              status: 'WAITING_FOR_OPPONENT',
              startedAt: { lt: new Date(now - WAITING_THRESHOLD_MS) },
            },
            {
              mode: 'DUEL',
              status: 'IN_PROGRESS',
              // `currentQuestionStartedAt` бывает пустым у партии, которая
              // так и не дошла до первого вопроса; тогда отсчёт от начала.
              OR: [
                {
                  currentQuestionStartedAt: {
                    lt: new Date(now - SILENCE_THRESHOLD_MS),
                  },
                },
                {
                  currentQuestionStartedAt: null,
                  startedAt: { lt: new Date(now - SILENCE_THRESHOLD_MS) },
                },
              ],
            },
            {
              mode: 'SOLO',
              status: 'IN_PROGRESS',
              startedAt: { lt: new Date(now - SOLO_THRESHOLD_MS) },
            },
          ],
        },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });

      if (closed.count > 0) {
        this.logger.log(`Закрыто брошенных партий: ${closed.count}`);
      }
      return closed.count;
    } catch (err) {
      // Уборка не должна ронять приложение: следующий заход повторит.
      this.logger.error(`Уборка брошенных партий не удалась: ${err}`);
      return 0;
    }
  }
}
