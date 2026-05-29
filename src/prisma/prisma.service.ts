import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/tenant-context';

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

    const tenantModels = new Set([
      'User',
      'Role',
      'Employee',
      'Invitation',
      'PayrollRun',
      'Candidate',
      'Location',
      'Department',
      'Team',
      'LeavePolicy',
      'LeaveBalance',
    ]);

    const middlewareClient = this as unknown as {
      $use?: (fn: (params: any, next: (params: any) => Promise<any>) => Promise<any>) => void;
    };

    if (typeof middlewareClient.$use !== 'function') {
      console.warn(
        'Prisma $use middleware is unavailable in this runtime. Falling back to service-level tenant checks.',
      );
      return;
    }

    middlewareClient.$use(async (params, next) => {
      const tenantId = TenantContext.getTenantId();
      const model = params.model ?? '';

      if (!tenantId || !tenantModels.has(model)) {
        return next(params);
      }

      const action = params.action;

      if (action === 'findMany' || action === 'findFirst' || action === 'count') {
        params.args = params.args ?? {};
        params.args.where = {
          ...(params.args.where ?? {}),
          tenantId,
        };
      }

      if (action === 'create' && params.args?.data) {
        params.args.data = {
          ...params.args.data,
          tenantId,
        };
      }

      if (action === 'createMany' && Array.isArray(params.args?.data)) {
        params.args.data = params.args.data.map((row: Record<string, unknown>) => ({
          ...row,
          tenantId,
        }));
      }

      if (action === 'updateMany' || action === 'deleteMany') {
        params.args = params.args ?? {};
        params.args.where = {
          ...(params.args.where ?? {}),
          tenantId,
        };
      }

      return next(params);
    });
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
