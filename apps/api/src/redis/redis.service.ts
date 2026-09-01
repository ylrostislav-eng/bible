import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis(this.configService.get<string>('REDIS_URL')!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      // Keeps retrying a dropped connection instead of giving up — capped
      // so a genuinely dead Redis doesn't retry in a tight loop forever.
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });

    // ioredis is an EventEmitter — Node's contract for EventEmitter is that
    // an 'error' event with no listener is rethrown as an uncaught
    // exception, which crashes the whole process. A Redis client emits
    // 'error' for anything from a refused connection to a network blip, so
    // without this listener a momentary Redis hiccup takes the entire API
    // down for every user, not just whatever feature happened to touch
    // Redis at that moment. Logging here is enough — ioredis keeps trying
    // to reconnect on its own via `retryStrategy`, and callers that need
    // Redis (e.g. presence) already handle a rejected call gracefully.
    this.client.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async ping(): Promise<boolean> {
    const result = await this.client.ping();
    return result === 'PONG';
  }
}
