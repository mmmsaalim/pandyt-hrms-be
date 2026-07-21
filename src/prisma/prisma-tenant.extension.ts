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
  // BRD §6.6 & §6.9: Recruitment module models
  'JobPost',
  // BRD §6.8: HR Letter & Feedback modules (included on all plans)
  'HrLetter',
  'HrFeedback',
  // BRD §6.4, §15.2: Canteen settings (tenant-scoped)
  'CanteenSettings',
  'CanteenMealEntry',
  // BRD §14.2, §14.4: Tenant configuration platform models
  'TenantBillingSettings',
  'TenantModuleSetting',
  'TenantFieldSetting',
  'BillingReminderDispatch',
]);

type QueryArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
};

function shouldSkipTenantWhere(where?: Record<string, unknown>): boolean {
  if (!where) {
    return false;
  }

  // Global identity roles (EMPLOYEE, TEAM_LEAD, HR_MANAGER, etc.) use tenantId: null.
  if (where.tenantId === null) {
    return true;
  }

  // Mixed global + tenant queries (e.g. RBAC configuration) must not be narrowed.
  if (Array.isArray(where.OR) && where.OR.length > 0) {
    return true;
  }

  return false;
}

function withTenantWhere(args: QueryArgs, tenantId: number): QueryArgs {
  const where = args.where ?? {};
  if (shouldSkipTenantWhere(where)) {
    return args;
  }

  return {
    ...args,
    where: {
      ...where,
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
