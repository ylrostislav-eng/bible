import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.redis.ping().catch(() => false),
    ]);

    const status = database && redis ? 'ok' : 'error';
    const body = { status, database, redis, uptime: process.uptime() };

    if (status === 'error') {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
