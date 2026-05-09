import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      console.warn(
        'DATABASE_URL is not set. Prisma connection skipped (DB-later mode).',
      );
      return;
    }

    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    (this as unknown as { $on: (event: string, cb: () => Promise<void>) => void }).$on(
      'beforeExit',
      async () => {
      await app.close();
      },
    );
  }
}
