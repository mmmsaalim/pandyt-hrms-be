/**
 * Central, data-driven RBAC rules. Pure constants only (no Nest/Prisma imports)
 * so this file can be shared by the runtime services and the Prisma seed.
 *
 * Model:
 *  - MODULE roles (LEAVE, ATTENDANCE, …) grant "access" (read-tier) to a module.
 *    They must NOT carry job-governed action permissions.
 *  - JOB roles (HR_MANAGER, TEAM_LEAD, EMPLOYEE) are tenant-scoped and carry the
 *    action permissions. A Company Admin edits them per tenant in Access
 *    Configuration — e.g. untick leave.manage on TEAM_LEAD to make team leads
 *    view-only, without affecting HR managers.
 */

/** Tenant-scoped job roles that carry configurable action permissions. */
export const JOB_ROLE_NAMES = ['HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE'] as const;
export type JobRoleName = (typeof JOB_ROLE_NAMES)[number];

/**
 * Action permissions that must come from a tenant-scoped job role, never from a
 * module (access) role. Extend this set to make more actions per-role configurable.
 */
export const JOB_GOVERNED_PERMISSIONS = ['leave.manage'] as const;

/**
 * BRD §4.2 default action permissions seeded onto each tenant job role.
 * Seed data only — editable afterward in Access Configuration.
 * (Read/access permissions come from module roles, so they are not repeated here.)
 */
export const DEFAULT_JOB_ROLE_PERMISSIONS: Record<JobRoleName, string[]> = {
  HR_MANAGER: ['leave.manage'],
  TEAM_LEAD: ['leave.manage'],
  EMPLOYEE: [],
};

/** BRD "Default Module Groups" — modules a freshly invited role receives. */
export const DEFAULT_MODULE_GROUPS: Record<string, string[]> = {
  EMPLOYEE: ['attendance', 'leave', 'payslips', 'reports'],
  TEAM_LEAD: ['attendance', 'leave', 'reports', 'canteen'],
  HR_MANAGER: ['employees', 'leave', 'attendance', 'payroll', 'payslips', 'reports', 'recruitment', 'canteen'],
  COMPANY_ADMIN: [
    'employees',
    'leave',
    'attendance',
    'payroll',
    'payslips',
    'reports',
    'recruitment',
    'configuration',
    'canteen',
  ],
};

const JOB_GOVERNED_SET = new Set<string>(JOB_GOVERNED_PERMISSIONS);
const JOB_ROLE_SET = new Set<string>(JOB_ROLE_NAMES);

export const isJobGovernedPermission = (permission: string): boolean =>
  JOB_GOVERNED_SET.has(permission);

export const isJobRoleName = (roleName: string): boolean => JOB_ROLE_SET.has(roleName);

/** Keeps only access-tier permissions for a module (strips job-governed actions). */
export const moduleAccessPermissions = <T extends { permission: string }>(permissions: T[]): T[] =>
  permissions.filter((p) => !JOB_GOVERNED_SET.has(p.permission));
