import { PrismaClient } from '@prisma/client';
import { TenantSeedContext } from './types';

const seedOrgEntity = async <T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> => {
  const existing = await find();
  return existing ?? create();
};

export async function seedDemoTenantData(
  prisma: PrismaClient,
  context: TenantSeedContext,
): Promise<void> {
  const { demoTenantId, demoEmployeeId } = context;

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
}

export async function cleanupLegacyConfigurationRoles(prisma: PrismaClient): Promise<void> {
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
}
