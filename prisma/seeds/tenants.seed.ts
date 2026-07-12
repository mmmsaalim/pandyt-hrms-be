import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { modulesForPlan, SEED_PASSWORD } from './constants';
import { seedTenantConfiguration } from './catalog.seed';
import { RoleIds, TenantSeedContext } from './types';

export async function seedTenants(
  prisma: PrismaClient,
  roleIds: RoleIds,
  passwordHash: string,
): Promise<TenantSeedContext> {
  const tenantSeeds = Array.from({ length: 5 }).map((_, i) => {
    const tenantNum = i + 1;
    return {
      code: `TNT${tenantNum}`,
      name: `Tenant ${tenantNum}`,
      plan: 'Starter',
      seats: 10,
      admin: {
        email: `tetsre1@gmail.com`,
        firstName: `Admin${tenantNum}`,
        lastName: 'User',
        department: 'Management',
        designation: 'Company Admin',
      },
      employees: Array.from({ length: 4 }).map((__, j) => {
        const empNum = j + 2;
        return {
          email: `tetsre${empNum}@gmail.com`,
          firstName: `Emp${empNum}_T${tenantNum}`,
          lastName: 'User',
          department: 'Staff',
          designation: 'Employee',
        };
      }),
    };
  });

  let demoTenantId = 0;
  let demoEmployeeId = 0;
  let secondTenantId = 0;

  for (let seedIndex = 0; seedIndex < tenantSeeds.length; seedIndex += 1) {
    const seed = tenantSeeds[seedIndex];
    const tenantNum = seedIndex + 1;
    const existingTenant = await prisma.tenant.findFirst({ where: { name: seed.name } });
    const tenant = existingTenant
      ? await prisma.tenant.update({
          where: { id: existingTenant.id },
          data: {
            name: seed.name,
            companyCode: seed.code.toLowerCase(),
            plan: seed.plan,
            status: 'ACTIVE',
            leadStatus: 'CONVERTED',
            seats: seed.seats,
          },
        })
      : await prisma.tenant.create({
          data: {
            name: seed.name,
            companyCode: seed.code.toLowerCase(),
            plan: seed.plan,
            status: 'ACTIVE',
            leadStatus: 'CONVERTED',
            seats: seed.seats,
          },
        });

    const adminUser = await prisma.user.upsert({
      where: { email: seed.admin.email },
      update: {
        firstName: seed.admin.firstName,
        lastName: seed.admin.lastName,
        status: 'ACTIVE',
        tenantId: tenant.id,
        passwordHash,
      },
      create: {
        email: seed.admin.email,
        passwordHash,
        firstName: seed.admin.firstName,
        lastName: seed.admin.lastName,
        status: 'ACTIVE',
        tenantId: tenant.id,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: roleIds.companyAdminRoleId } },
      update: {},
      create: { userId: adminUser.id, roleId: roleIds.companyAdminRoleId },
    });

    const adminEmployeeCode = `${seed.code}-ADM-001`;
    await prisma.employee.upsert({
      where: { userId: adminUser.id },
      update: {
        tenantId: tenant.id,
        employeeCode: adminEmployeeCode,
        department: seed.admin.department,
        designation: seed.admin.designation,
        joinedDate: new Date('2023-08-01'),
        employmentStatus: 'ACTIVE',
      },
      create: {
        tenantId: tenant.id,
        userId: adminUser.id,
        employeeCode: adminEmployeeCode,
        department: seed.admin.department,
        designation: seed.admin.designation,
        joinedDate: new Date('2023-08-01'),
        employmentStatus: 'ACTIVE',
      },
    });

    for (let index = 0; index < seed.employees.length; index += 1) {
      const e = seed.employees[index];
      const code = `${seed.code}-EMP-${String(index + 1).padStart(3, '0')}`;

      const employeeUser = await prisma.user.upsert({
        where: { email: e.email },
        update: {
          firstName: e.firstName,
          lastName: e.lastName,
          status: 'ACTIVE',
          tenantId: tenant.id,
          passwordHash,
        },
        create: {
          email: e.email,
          passwordHash,
          firstName: e.firstName,
          lastName: e.lastName,
          status: 'ACTIVE',
          tenantId: tenant.id,
        },
      });

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: employeeUser.id, roleId: roleIds.employeeRoleId } },
        update: {},
        create: { userId: employeeUser.id, roleId: roleIds.employeeRoleId },
      });

      const employee = await prisma.employee.upsert({
        where: { userId: employeeUser.id },
        update: {
          tenantId: tenant.id,
          employeeCode: code,
          department: e.department,
          designation: e.designation,
          joinedDate: new Date('2024-01-10'),
          employmentStatus: 'ACTIVE',
        },
        create: {
          tenantId: tenant.id,
          userId: employeeUser.id,
          employeeCode: code,
          department: e.department,
          designation: e.designation,
          joinedDate: new Date('2024-01-10'),
          employmentStatus: 'ACTIVE',
        },
      });

      if (demoTenantId === 0) {
        demoTenantId = tenant.id;
        demoEmployeeId = employee.id;
      }

      if (secondTenantId === 0 && tenantNum === 2) {
        secondTenantId = tenant.id;
      }
    }

    const enabledModules =
      tenantNum === 2
        ? ['employees', 'attendance', 'payroll', 'payslips']
        : modulesForPlan(seed.plan);

    await seedTenantConfiguration(
      prisma,
      tenant.id,
      enabledModules,
      tenantNum === 1
        ? {
            employees: {
              religion: { enabled: true },
              epfNo: { enabled: true, required: false },
            },
          }
        : {},
    );
  }

  if (demoTenantId === 0 || demoEmployeeId === 0) {
    throw new Error('Seed setup did not create demo tenant/employee context.');
  }

  return { demoTenantId, demoEmployeeId, secondTenantId };
}

export async function createSeedPasswordHash(): Promise<string> {
  return bcrypt.hash(SEED_PASSWORD, 10);
}

export async function seedSuperAdmin(prisma: PrismaClient, roleIds: RoleIds, passwordHash: string): Promise<void> {
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@flowhr.com' },
    update: {
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
    create: {
      email: 'superadmin@flowhr.com',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: roleIds.superAdminRoleId } },
    update: {},
    create: { userId: superAdmin.id, roleId: roleIds.superAdminRoleId },
  });
}
