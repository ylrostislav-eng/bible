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
