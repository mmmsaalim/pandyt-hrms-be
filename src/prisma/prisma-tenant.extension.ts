import { Prisma } from '@prisma/client';
import { TenantContext } from '../common/tenant-context';

const TENANT_MODELS = new Set([
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
  'AttendanceSettings',
  'WorkShift',
  'CompanyHoliday',
]);

type QueryArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
};

function withTenantWhere(args: QueryArgs, tenantId: number): QueryArgs {
  return {
    ...args,
    where: {
      ...(args.where ?? {}),
      tenantId,
    },
  };
}

function withTenantData(args: QueryArgs, tenantId: number): QueryArgs {
  if (Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((row) => ({ ...row, tenantId })),
    };
  }

  return {
    ...args,
    data: {
      ...(args.data ?? {}),
      tenantId,
    },
  };
}

function applyTenantScope(model: string, operation: string, args: QueryArgs, tenantId: number): QueryArgs {
  if (
    operation === 'findMany' ||
    operation === 'findFirst' ||
    operation === 'count' ||
    operation === 'findUnique'
  ) {
    return withTenantWhere(args, tenantId);
  }

  if (operation === 'create' || operation === 'createMany') {
    return withTenantData(args, tenantId);
  }

  if (
    operation === 'update' ||
    operation === 'delete' ||
    operation === 'updateMany' ||
    operation === 'deleteMany'
  ) {
    return withTenantWhere(args, tenantId);
  }

  return args;
}

export const prismaTenantExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const tenantId = TenantContext.getTenantId();
        if (!tenantId || !TENANT_MODELS.has(model)) {
          return query(args);
        }

        const scopedArgs = applyTenantScope(model, operation, args as QueryArgs, tenantId);
        return query(scopedArgs);
      },
    },
  },
});
