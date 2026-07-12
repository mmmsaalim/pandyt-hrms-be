import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from './constants';
import { RoleIds } from './types';

export async function seedRolesAndPermissions(prisma: PrismaClient): Promise<RoleIds> {
  const upsertCommonRole = async (name: string, description: string) => {
    const existing = await prisma.role.findFirst({ where: { name, tenantId: null } });
    if (existing) {
      return prisma.role.update({
        where: { id: existing.id },
        data: { description },
      });
    }

    return prisma.role.create({
      data: {
        name,
        description,
        tenantId: null,
      },
    });
  };

  const [superAdminRole, companyAdminRole, hrManagerRole, teamLeadRole, employeeRole] = await Promise.all([
    upsertCommonRole('SUPER_ADMIN', 'Platform-wide administrator role.'),
    upsertCommonRole('COMPANY_ADMIN', 'Tenant administrator role.'),
    upsertCommonRole('HR_MANAGER', 'Tenant HR manager role.'),
    upsertCommonRole('TEAM_LEAD', 'Team lead or manager role.'),
    upsertCommonRole('EMPLOYEE', 'Self-service employee role.'),
  ]);

  const permissions = await Promise.all(
    PERMISSION_CATALOG.map((row) =>
      prisma.permission.upsert({
        where: { permission: row.permission },
        update: {
          module: row.module,
          description: row.description,
        },
        create: row,
      }),
    ),
  );

  const byKey = new Map(permissions.map((x) => [x.permission, x.id]));

  const setRolePermissions = async (roleId: number, permissionKeys: string[]) => {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionKeys.length === 0) {
      return;
    }

    await prisma.rolePermission.createMany({
      data: permissionKeys
        .map((key) => byKey.get(key))
        .filter((id): id is number => typeof id === 'number')
        .map((permissionId) => ({ roleId, permissionId })),
    });
  };

  await Promise.all([
    setRolePermissions(superAdminRole.id, PERMISSION_CATALOG.map((p) => p.permission)),
    setRolePermissions(companyAdminRole.id, [
      'employees.read',
      'employees.invite',
      'leave.read',
      'leave.manage',
      'attendance.read',
      'canteen.read',
      'canteen.manage',
      'payroll.manage',
      'payslips.manage',
      'reports.read',
      'configuration.manage',
      'organisation.read',
      'organisation.manage',
      'recruitment.read',
      'recruitment.manage',
    ]),
    setRolePermissions(hrManagerRole.id, [
      'employees.read',
      'employees.invite',
      'leave.read',
      'leave.manage',
      'attendance.read',
      'canteen.read',
      'canteen.manage',
      'reports.read',
      'organisation.read',
      'organisation.manage',
      'recruitment.read',
      'recruitment.manage',
    ]),
    setRolePermissions(teamLeadRole.id, [
      'leave.read',
      'leave.manage',
      'attendance.read',
      'canteen.read',
      'canteen.manage',
      'reports.read',
      'organisation.read',
    ]),
    setRolePermissions(employeeRole.id, ['leave.read', 'attendance.read', 'organisation.read']),
  ]);

  return {
    superAdminRoleId: superAdminRole.id,
    companyAdminRoleId: companyAdminRole.id,
    hrManagerRoleId: hrManagerRole.id,
    teamLeadRoleId: teamLeadRole.id,
    employeeRoleId: employeeRole.id,
  };
}
