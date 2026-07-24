import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_JOB_ROLE_PERMISSIONS,
  JOB_GOVERNED_PERMISSIONS,
  JOB_ROLE_NAMES,
  JobRoleName,
} from '../../src/roles/rbac.constants';

/**
 * Idempotent migration for the split "module access" vs "job action" RBAC model.
 *
 * 1. Strips job-governed action permissions (e.g. leave.manage) off every tenant
 *    MODULE role — actions must live on job roles only.
 * 2. Ensures each tenant has editable job roles (HR_MANAGER, TEAM_LEAD, EMPLOYEE)
 *    seeded from BRD defaults.
 * 3. Migrates users from the shared (tenantId=null) job role to their tenant copy,
 *    so their approve/reject follows the tenant's editable role — not a global one.
 *
 * Safe to run repeatedly.
 */
export async function backfillRbacJobRoles(prisma: PrismaClient): Promise<void> {
  const jobRoleNameSet = new Set<string>(JOB_ROLE_NAMES);

  const permByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, permission: true } })).map(
      (p) => [p.permission, p.id] as const,
    ),
  );

  const jobGovernedIds = [...JOB_GOVERNED_PERMISSIONS]
    .map((key) => permByKey.get(key))
    .filter((id): id is number => typeof id === 'number');

  // 1. Strip job-governed permissions from tenant module roles.
  if (jobGovernedIds.length > 0) {
    const tenantRoles = await prisma.role.findMany({
      where: { tenantId: { not: null } },
      select: { id: true, name: true },
    });
    const moduleRoleIds = tenantRoles.filter((r) => !jobRoleNameSet.has(r.name)).map((r) => r.id);
    if (moduleRoleIds.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: moduleRoleIds }, permissionId: { in: jobGovernedIds } },
      });
    }
  }

  const sharedJobRoles = await prisma.role.findMany({
    where: { tenantId: null, name: { in: [...JOB_ROLE_NAMES] } },
    select: { id: true, name: true },
  });
  const sharedIdByName = new Map(sharedJobRoles.map((r) => [r.name, r.id] as const));

  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const { id: tenantId } of tenants) {
    for (const roleName of JOB_ROLE_NAMES) {
      // 2. Ensure the tenant's editable job role exists (seed defaults on create).
      let tenantRole = await prisma.role.findFirst({
        where: { tenantId, name: roleName },
        select: { id: true },
      });

      if (!tenantRole) {
        tenantRole = await prisma.role.create({
          data: {
            tenantId,
            name: roleName,
            description: `Tenant ${roleName} role — configurable in Access Configuration`,
          },
          select: { id: true },
        });

        const defaults = DEFAULT_JOB_ROLE_PERMISSIONS[roleName as JobRoleName] ?? [];
        const permIds = defaults
          .map((key) => permByKey.get(key))
          .filter((id): id is number => typeof id === 'number');
        if (permIds.length > 0) {
          await prisma.rolePermission.createMany({
            data: permIds.map((permissionId) => ({ roleId: tenantRole!.id, permissionId })),
            skipDuplicates: true,
          });
        }
      }

      // 3. Migrate users on the shared template role to the tenant copy.
      const sharedRoleId = sharedIdByName.get(roleName);
      if (!sharedRoleId) {
        continue;
      }

      const assignments = await prisma.userRole.findMany({
        where: { roleId: sharedRoleId, user: { tenantId } },
        select: { userId: true },
      });

      for (const { userId } of assignments) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId: tenantRole.id } },
          update: {},
          create: { userId, roleId: tenantRole.id },
        });
        await prisma.userRole.deleteMany({ where: { userId, roleId: sharedRoleId } });
      }
    }
  }
}
