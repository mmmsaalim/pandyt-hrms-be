/**
 * Application role definitions and groupings.
 * Single source of truth for role names and role-based access control (RBAC).
 * Used by @Roles() decorators across all controllers.
 *
 * Role Hierarchy (from BRD §4.1):
 * - SUPER_ADMIN: Platform owner, manages all tenants and billing
 * - COMPANY_ADMIN: Single-tenant owner, manages all company operations
 * - HR_MANAGER: HR department role, manages people and policies
 * - TEAM_LEAD: Team manager role, approves leaves and manages team
 * - EMPLOYEE: End employee self-service role
 */

// Global identity roles (apply across all tenants)
export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';
export const COMPANY_ADMIN_ROLE = 'COMPANY_ADMIN';
export const HR_MANAGER_ROLE = 'HR_MANAGER';
export const TEAM_LEAD_ROLE = 'TEAM_LEAD';
export const EMPLOYEE_ROLE = 'EMPLOYEE';

// Role groupings for @Roles() decorators
export const ADMIN_ROLES = [SUPER_ADMIN_ROLE, COMPANY_ADMIN_ROLE];
export const HR_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const MANAGER_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE];
export const TENANT_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE, EMPLOYEE_ROLE];
export const ALL_ROLES = [SUPER_ADMIN_ROLE, ...TENANT_ROLES];

// Module-specific role groupings (for @Roles() on module controllers)
export const SUPER_ADMIN_ONLY = [SUPER_ADMIN_ROLE];
export const COMPANY_ADMIN_ONLY = [COMPANY_ADMIN_ROLE];

// Employees module (BRD §6.2): Create/edit/delete by admin and HR
export const EMPLOYEES_WRITE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const EMPLOYEES_READ_ROLES = TENANT_ROLES;

// Leave module (BRD §6.4): Request by all; approve by admin/hr/manager
export const LEAVE_REQUEST_ROLES = TENANT_ROLES;
export const LEAVE_APPROVE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE];
export const LEAVE_ADMIN_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];

// Attendance module (BRD §6.4): Clock-in by all; override by admin/hr
export const ATTENDANCE_CLOCK_ROLES = TENANT_ROLES;
export const ATTENDANCE_OVERRIDE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const ATTENDANCE_SETTINGS_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];

// Payroll module (BRD §6.5): Run payroll by admin only
export const PAYROLL_WRITE_ROLES = [COMPANY_ADMIN_ROLE];
export const PAYROLL_READ_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const PAYROLL_ADMIN_ROLES = [COMPANY_ADMIN_ROLE];

// Payslips module (BRD §6.5): View own or all (by admin/hr)
export const PAYSLIPS_READ_OWN = TENANT_ROLES;
export const PAYSLIPS_READ_ALL = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];

// Recruitment module (BRD §6.6): Job/candidate CRUD by admin/hr
export const RECRUITMENT_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const RECRUITMENT_PUBLIC = ['PUBLIC']; // For public careers portal

// Organisation module (BRD §6.3): Location/dept/team CRUD by admin/hr
export const ORGANISATION_WRITE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const ORGANISATION_READ_ROLES = TENANT_ROLES;

// Dashboard module (BRD §6.1): Different views per role
export const DASHBOARD_ADMIN_ROLES = [SUPER_ADMIN_ROLE, COMPANY_ADMIN_ROLE];
export const DASHBOARD_HR_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const DASHBOARD_MANAGER_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE];
export const DASHBOARD_EMPLOYEE_ROLES = TENANT_ROLES;

// Reports module (BRD §6.9): Export by admin/hr/manager
export const REPORTS_EXPORT_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE];
export const REPORTS_READ_ROLES = TENANT_ROLES;

// Configuration module (Super Admin only): Tenant setup and catalog
export const PLATFORM_CONFIG_ROLES = [SUPER_ADMIN_ROLE];
export const TENANT_CONFIGURATION_ROLES = [SUPER_ADMIN_ROLE];
export const TENANT_ONBOARD_ROLES = [SUPER_ADMIN_ROLE];

// Tenant-level configuration (Company Admin only): Module and field settings
export const COMPANY_CONFIGURATION_ROLES = [COMPANY_ADMIN_ROLE];
export const TENANT_MODULE_SETTINGS_ROLES = [COMPANY_ADMIN_ROLE];

// Letters module (BRD §6.2, included on all plans): Create/view by admin/hr
export const LETTERS_WRITE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE];
export const LETTERS_READ_ROLES = TENANT_ROLES;

// Feedback module (BRD §6.2, included on all plans): Submit by admin/hr/lead
export const FEEDBACK_WRITE_ROLES = [COMPANY_ADMIN_ROLE, HR_MANAGER_ROLE, TEAM_LEAD_ROLE];
export const FEEDBACK_READ_ROLES = TENANT_ROLES;

// Canteen module: Settings by admin, entries by all
export const CANTEEN_SETTINGS_ROLES = [COMPANY_ADMIN_ROLE];
export const CANTEEN_ENTRY_ROLES = TENANT_ROLES;

// Cross-tenant reports (Super Admin only): Multi-tenant data aggregation
export const CROSS_TENANT_REPORTS_ROLES = [SUPER_ADMIN_ROLE];

/**
 * Helper: Check if a role is super admin
 */
export function isSuperAdmin(role: string | undefined): boolean {
  return role === SUPER_ADMIN_ROLE;
}

/**
 * Helper: Check if a role is company admin
 */
export function isCompanyAdmin(role: string | undefined): boolean {
  return role === COMPANY_ADMIN_ROLE;
}

/**
 * Helper: Check if a role is an admin (super or company)
 */
export function isAdmin(role: string | undefined): boolean {
  return role === SUPER_ADMIN_ROLE || role === COMPANY_ADMIN_ROLE;
}

/**
 * Helper: Check if a role is a manager (company admin, hr manager, or team lead)
 */
export function isManager(role: string | undefined): boolean {
  return MANAGER_ROLES.includes(role as string);
}

/**
 * Helper: Check if a role is a valid tenant role
 */
export function isTenantRole(role: string | undefined): boolean {
  return TENANT_ROLES.includes(role as string);
}
