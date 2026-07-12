import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { prismaTenantExtension } from './prisma-tenant.extension';

function createExtendedPrismaClient() {
  const prisma = new PrismaClient();
  return prisma.$extends(prismaTenantExtension);
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

export type PrismaTxClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

const PrismaClientExtended = class {
  constructor() {
    return createExtendedPrismaClient() as unknown as ExtendedPrismaClient;
  }
} as new () => ExtendedPrismaClient;

@Injectable()
export class PrismaService extends PrismaClientExtended implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    this.logger.log('Prisma tenant extension active (Prisma 6 $extends).');
  }

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL is not set. Prisma connection skipped (DB-later mode).');
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
