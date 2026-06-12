import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
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

  const permissionCatalog: Array<{ permission: string; module: string; description: string }> = [
    { permission: 'tenants.read', module: 'tenants', description: 'View tenant records.' },
    { permission: 'tenants.create', module: 'tenants', description: 'Create tenant records.' },
    { permission: 'tenants.delete', module: 'tenants', description: 'Delete tenant records.' },
    { permission: 'employees.read', module: 'employees', description: 'View tenant employees.' },
    { permission: 'employees.invite', module: 'employees', description: 'Invite tenant employees.' },
    { permission: 'leave.read', module: 'leave', description: 'View leave requests.' },
    { permission: 'leave.manage', module: 'leave', description: 'Approve and reject leave requests.' },
    { permission: 'attendance.read', module: 'attendance', description: 'View attendance records.' },
    { permission: 'payroll.manage', module: 'payroll', description: 'Manage payroll runs.' },
    { permission: 'payslips.manage', module: 'payslips', description: 'Manage payslips.' },
    { permission: 'reports.read', module: 'reports', description: 'View reports.' },
    {
      permission: 'configuration.manage',
      module: 'configuration',
      description: 'Manage tenant roles and permission assignments.',
    },
    {
      permission: 'organisation.manage',
      module: 'organisation',
      description: 'Manage locations, departments, and teams.',
    },
    {
      permission: 'organisation.read',
      module: 'organisation',
      description: 'View organisation tree and structure.',
    },
    {
      permission: 'recruitment.read',
      module: 'recruitment',
      description: 'View job posts and candidates.',
    },
    {
      permission: 'recruitment.manage',
      module: 'recruitment',
      description: 'Manage job posts, candidates, and hiring pipeline.',
    },
  ];

  const permissions = await Promise.all(
    permissionCatalog.map((row) =>
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
    setRolePermissions(superAdminRole.id, permissionCatalog.map((p) => p.permission)),
    setRolePermissions(companyAdminRole.id, [
      'employees.read',
      'employees.invite',
      'leave.read',
      'leave.manage',
      'attendance.read',
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
      'reports.read',
      'organisation.read',
    ]),
    setRolePermissions(employeeRole.id, ['leave.read', 'attendance.read', 'organisation.read']),
  ]);

  const passwordHash = await bcrypt.hash('admin@123', 10);

  // Only 5 tenants, each with 5 users (1 admin, 4 employees), emails tetsre1@gmail.com ... tetsre5@gmail.com, password admin@123
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
      employees: Array.from({ length: 4 }).map((_, j) => {
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
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
  });

  let demoTenantId = 0;
  let demoEmployeeId = 0;

  for (const seed of tenantSeeds) {
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
      where: { userId_roleId: { userId: adminUser.id, roleId: companyAdminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: companyAdminRole.id },
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
        where: { userId_roleId: { userId: employeeUser.id, roleId: employeeRole.id } },
        update: {},
        create: { userId: employeeUser.id, roleId: employeeRole.id },
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
    }
  }

  if (demoTenantId === 0 || demoEmployeeId === 0) {
    throw new Error('Seed setup did not create demo tenant/employee context.');
  }

  // BRD 6.3: sample org structure for demo tenant (Sri Lanka-style branch names)
  const seedOrgEntity = async <T>(
    find: () => Promise<T | null>,
    create: () => Promise<T>,
  ): Promise<T> => {
    const existing = await find();
    return existing ?? create();
  };

  const colomboLocation = await seedOrgEntity(
    () => prisma.location.findFirst({ where: { tenantId: demoTenantId, name: 'Colombo Head Office' } }),
    () =>
      prisma.location.create({
        data: {
          tenantId: demoTenantId,
          name: 'Colombo Head Office',
          address: 'No. 42, Galle Road, Colombo 03',
        },
      }),
  );

  const kandyLocation = await seedOrgEntity(
    () => prisma.location.findFirst({ where: { tenantId: demoTenantId, name: 'Kandy Branch' } }),
    () =>
      prisma.location.create({
        data: {
          tenantId: demoTenantId,
          name: 'Kandy Branch',
          address: 'Dalada Veediya, Kandy',
        },
      }),
  );

  const hrDepartment = await seedOrgEntity(
    () => prisma.department.findFirst({ where: { tenantId: demoTenantId, name: 'Human Resources' } }),
    () =>
      prisma.department.create({
        data: {
          tenantId: demoTenantId,
          name: 'Human Resources',
          locationId: colomboLocation.id,
        },
      }),
  );

  const engineeringDepartment = await seedOrgEntity(
    () => prisma.department.findFirst({ where: { tenantId: demoTenantId, name: 'Engineering' } }),
    () =>
      prisma.department.create({
        data: {
          tenantId: demoTenantId,
          name: 'Engineering',
          locationId: kandyLocation.id,
        },
      }),
  );

  await seedOrgEntity(
    () => prisma.team.findFirst({ where: { tenantId: demoTenantId, name: 'Recruitment', departmentId: hrDepartment.id } }),
    () =>
      prisma.team.create({
        data: {
          tenantId: demoTenantId,
          name: 'Recruitment',
          departmentId: hrDepartment.id,
        },
      }),
  );

  await seedOrgEntity(
    () =>
      prisma.team.findFirst({
        where: { tenantId: demoTenantId, name: 'Product Development', departmentId: engineeringDepartment.id },
      }),
    () =>
      prisma.team.create({
        data: {
          tenantId: demoTenantId,
          name: 'Product Development',
          departmentId: engineeringDepartment.id,
        },
      }),
  );

  const payrollRunByPeriod = await prisma.payrollRun.findFirst({
    where: { tenantId: demoTenantId, period: '2026-04' },
  });

  const payrollRun = payrollRunByPeriod
    ? await prisma.payrollRun.update({
        where: { id: payrollRunByPeriod.id },
        data: {
          tenantId: demoTenantId,
          period: '2026-04',
          grossAmount: 50000,
          netAmount: 43000,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      })
    : await prisma.payrollRun.create({
        data: {
          tenantId: demoTenantId,
          period: '2026-04',
          grossAmount: 50000,
          netAmount: 43000,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

  const payrollRunMayByPeriod = await prisma.payrollRun.findFirst({
    where: { tenantId: demoTenantId, period: '2026-05' },
  });

  const payrollRunMay = payrollRunMayByPeriod
    ? await prisma.payrollRun.update({
        where: { id: payrollRunMayByPeriod.id },
        data: {
          tenantId: demoTenantId,
          period: '2026-05',
          grossAmount: 52000,
          netAmount: 44600,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      })
    : await prisma.payrollRun.create({
        data: {
          tenantId: demoTenantId,
          period: '2026-05',
          grossAmount: 52000,
          netAmount: 44600,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

  await prisma.leaveRequest.deleteMany({ where: { employeeId: demoEmployeeId } });
  await prisma.leaveRequest.createMany({
    data: [
      {
        employeeId: demoEmployeeId,
        type: 'Casual',
        startDate: new Date('2026-05-04'),
        endDate: new Date('2026-05-06'),
        days: 3,
        reason: 'Personal work',
        status: 'PENDING',
      },
      {
        employeeId: demoEmployeeId,
        type: 'Sick',
        startDate: new Date('2026-04-15'),
        endDate: new Date('2026-04-16'),
        days: 2,
        reason: 'Fever',
        status: 'APPROVED',
      },
    ],
  });

  await Promise.all([
    prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: demoEmployeeId,
          date: new Date('2026-04-29'),
        },
      },
      update: {
        clockIn: new Date('2026-04-29T09:00:00Z'),
        clockOut: new Date('2026-04-29T17:30:00Z'),
        hours: 8.5,
        status: 'PRESENT',
      },
      create: {
        employeeId: demoEmployeeId,
        date: new Date('2026-04-29'),
        clockIn: new Date('2026-04-29T09:00:00Z'),
        clockOut: new Date('2026-04-29T17:30:00Z'),
        hours: 8.5,
        status: 'PRESENT',
      },
    }),
    prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: demoEmployeeId,
          date: new Date('2026-04-30'),
        },
      },
      update: {
        clockIn: new Date('2026-04-30T09:10:00Z'),
        clockOut: new Date('2026-04-30T17:20:00Z'),
        hours: 8.2,
        status: 'PRESENT',
      },
      create: {
        employeeId: demoEmployeeId,
        date: new Date('2026-04-30'),
        clockIn: new Date('2026-04-30T09:10:00Z'),
        clockOut: new Date('2026-04-30T17:20:00Z'),
        hours: 8.2,
        status: 'PRESENT',
      },
    }),
    prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: demoEmployeeId,
          date: new Date('2026-05-01'),
        },
      },
      update: {
        clockIn: new Date('2026-05-01T09:05:00Z'),
        clockOut: new Date('2026-05-01T17:40:00Z'),
        hours: 8.6,
        status: 'PRESENT',
      },
      create: {
        employeeId: demoEmployeeId,
        date: new Date('2026-05-01'),
        clockIn: new Date('2026-05-01T09:05:00Z'),
        clockOut: new Date('2026-05-01T17:40:00Z'),
        hours: 8.6,
        status: 'PRESENT',
      },
    }),
  ]);

  await prisma.payslip.deleteMany({ where: { employeeId: demoEmployeeId } });
  await prisma.payslip.createMany({
    data: [
      {
        employeeId: demoEmployeeId,
        payrollRunId: payrollRun.id,
        grossPay: 50000,
        deductions: 7000,
        netPay: 43000,
        status: 'GENERATED',
      },
      {
        employeeId: demoEmployeeId,
        payrollRunId: payrollRunMay.id,
        grossPay: 52000,
        deductions: 7400,
        netPay: 44600,
        status: 'SENT',
      },
    ],
  });

  const hrExecutiveJob = await seedOrgEntity(
    () => prisma.jobPost.findFirst({ where: { tenantId: demoTenantId, title: 'HR Executive' } }),
    () =>
      prisma.jobPost.create({
        data: {
          tenantId: demoTenantId,
          title: 'HR Executive',
          department: 'Human Resources',
          description: 'Support recruitment, onboarding, and employee records for Sri Lanka operations.',
          requiredSkills: ['HR Administration', 'Recruitment', 'Onboarding'],
          status: 'OPEN',
          openedAt: new Date(),
        },
      }),
  );

  await prisma.jobPost.deleteMany({
    where: { tenantId: demoTenantId, title: 'Software Engineer' },
  });

  await prisma.jobPost.create({
    data: {
      tenantId: demoTenantId,
      title: 'Software Engineer',
      department: 'Engineering',
      description: 'Build HR platform features for Pandyt HRMS.',
      requiredSkills: ['TypeScript', 'NestJS', 'Angular'],
      status: 'OPEN',
      openedAt: new Date(),
    },
  });

  await prisma.candidate.deleteMany({
    where: { tenantId: demoTenantId, email: { in: ['priya.sharma@example.com', 'kasun.perera@example.com'] } },
  });

  await prisma.candidate.create({
    data: {
      tenantId: demoTenantId,
      jobPostId: hrExecutiveJob.id,
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      phone: '+94 77 123 4567',
      roleApplied: 'HR Executive',
      source: 'LinkedIn',
      stage: 'INTERVIEW',
      rating: 4,
      notes: 'Strong local HR operations background.',
    },
  });

  await prisma.candidate.create({
    data: {
      tenantId: demoTenantId,
      jobPostId: hrExecutiveJob.id,
      name: 'Kasun Perera',
      email: 'kasun.perera@example.com',
      phone: '+94 71 987 6543',
      roleApplied: 'HR Executive',
      source: 'Employee Referral',
      stage: 'SCREENING',
      rating: 3,
    },
  });

  const configurationRoles = await prisma.role.findMany({
    where: { name: 'CONFIGURATION', tenantId: { not: null } },
    select: { id: true },
  });

  if (configurationRoles.length > 0) {
    await prisma.userRole.deleteMany({
      where: {
        roleId: { in: configurationRoles.map((role) => role.id) },
        user: {
          roles: {
            none: {
              role: {
                name: 'COMPANY_ADMIN',
                tenantId: null,
              },
            },
          },
        },
      },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
