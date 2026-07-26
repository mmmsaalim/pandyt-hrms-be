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
 *
 * Why this matters: module (access) roles are rebuilt from the permission catalog
 * every time an employee is invited, so anything left on them cannot be durably
 * customised — an admin's change would be silently reset on the next invite. Only
 * permissions listed here are stripped off module roles and held on the tenant's
 * editable job role, which makes "untick it in Access Configuration → the role
 * genuinely loses that ability" actually work.
 *
 * Read-tier permissions (`*.read`) intentionally stay module-governed: they are
 * re-derived from module access on every login (see expandModuleRoleReadAccess).
 */
export const JOB_GOVERNED_PERMISSIONS = [
  'leave.manage',
  'employees.invite',
  'canteen.manage',
  'organisation.manage',
  // NOTE: recruitment.manage is deliberately NOT here yet. Its controller is
  // still role-gated only, so listing it would show a toggle in Access
  // Configuration that silently does nothing. Add it here at the same time as
  // adding PermissionsGuard + @RequirePermissions to RecruitmentController.
] as const;

/**
 * BRD §4.2 default action permissions seeded onto each tenant job role.
 * Seed data only — editable afterward in Access Configuration.
 * (Read/access permissions come from module roles, so they are not repeated here.)
 *
 * These mirror the job-governed actions implied by each role's DEFAULT_MODULE_GROUPS
 * below, so a freshly invited user keeps the abilities the role has always had. A
 * Company Admin then tightens them per tenant (e.g. untick employees.invite on
 * TEAM_LEAD to make team leads view-only, per BRD §4.2 "Hire: Team Lead = No").
 */
export const DEFAULT_JOB_ROLE_PERMISSIONS: Record<JobRoleName, string[]> = {
  // organisation.manage is included because HR managers could always manage the
  // org structure (the endpoints allowed the role directly); it is listed here so
  // that ability survives the move to permission-gating and stays revocable.
  HR_MANAGER: ['leave.manage', 'employees.invite', 'canteen.manage', 'organisation.manage'],
  TEAM_LEAD: ['leave.manage', 'employees.invite', 'canteen.manage'],
  EMPLOYEE: [],
};

/** BRD "Default Module Groups" — modules a freshly invited role receives. */
export const DEFAULT_MODULE_GROUPS: Record<string, string[]> = {
  // Reports is intentionally excluded from the employee default — reports are an
  // admin/manager view. A Company Admin can still grant Reports to specific
  // employees per tenant via Configuration → Users & Permissions.
  EMPLOYEE: ['attendance', 'leave', 'payslips'],
  // Reports is off by default for team leads (admin/manager view). A Company
  // Admin can still grant it per team lead in Access Configuration — reports
  // endpoints are gated by the reports.read permission, so the grant works.
  TEAM_LEAD: ['attendance', 'leave', 'canteen', 'employees'],
  // Payroll (run) is off by default for HR managers per BRD §4.2 (only Company
  // Admin runs payroll). A Company Admin can still grant it in Access
  // Configuration — payroll endpoints are gated by payroll.manage, so it works.
  // payslips stays so HR can view/manage payslips.
  HR_MANAGER: ['employees', 'leave', 'attendance', 'payslips', 'reports', 'recruitment', 'canteen'],
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
