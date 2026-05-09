import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const ids = {
    tenant: 'tenant-demo',
    adminEmployee: 'admin-employee-demo',
    payrollRun: 'payrollrun-demo-2026-04',
    payrollRunMay: 'payrollrun-demo-2026-05',
    leaveRequest: 'leave-demo-001',
    leaveRequest2: 'leave-demo-002',
    attendance: 'attendance-demo-2026-04-29',
    attendance2: 'attendance-demo-2026-04-30',
    attendance3: 'attendance-demo-2026-05-01',
    payslip: 'payslip-demo-2026-04',
    payslip2: 'payslip-demo-2026-05',
    candidate: 'candidate-demo-001',
  };

  const [superAdminRole, companyAdminRole, employeeRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN' },
    }),
    prisma.role.upsert({
      where: { name: 'COMPANY_ADMIN' },
      update: {},
      create: { name: 'COMPANY_ADMIN' },
    }),
    prisma.role.upsert({
      where: { name: 'EMPLOYEE' },
      update: {},
      create: { name: 'EMPLOYEE' },
    }),
  ]);

  const tenant = await prisma.tenant.upsert({
    where: { id: ids.tenant },
    update: {
      name: 'Acme Corp',
      plan: 'Growth',
      status: 'ACTIVE',
      seats: 100,
    },
    create: {
      id: ids.tenant,
      name: 'Acme Corp',
      plan: 'Growth',
      status: 'ACTIVE',
      seats: 100,
    },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);

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

  const companyAdmin = await prisma.user.upsert({
    where: { email: 'admin@flowhr.com' },
    update: {
      firstName: 'Company',
      lastName: 'Admin',
      status: 'ACTIVE',
      tenantId: tenant.id,
    },
    create: {
      email: 'admin@flowhr.com',
      passwordHash,
      firstName: 'Company',
      lastName: 'Admin',
      status: 'ACTIVE',
      tenantId: tenant.id,
    },
  });

  const employeeUser = await prisma.user.upsert({
    where: { email: 'employee@flowhr.com' },
    update: {
      firstName: 'John',
      lastName: 'Doe',
      status: 'ACTIVE',
      tenantId: tenant.id,
    },
    create: {
      email: 'employee@flowhr.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Doe',
      status: 'ACTIVE',
      tenantId: tenant.id,
    },
  });

  await Promise.all([
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: superAdmin.id, roleId: superAdminRole.id },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: companyAdmin.id, roleId: companyAdminRole.id } },
      update: {},
      create: { userId: companyAdmin.id, roleId: companyAdminRole.id },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: employeeUser.id, roleId: employeeRole.id } },
      update: {},
      create: { userId: employeeUser.id, roleId: employeeRole.id },
    }),
  ]);

  const employee = await prisma.employee.upsert({
    where: { employeeCode: 'EMP-0001' },
    update: {
      tenantId: tenant.id,
      userId: employeeUser.id,
      department: 'Engineering',
      designation: 'Software Engineer',
      joinedDate: new Date('2024-01-10'),
      employmentStatus: 'ACTIVE',
    },
    create: {
      tenantId: tenant.id,
      userId: employeeUser.id,
      employeeCode: 'EMP-0001',
      department: 'Engineering',
      designation: 'Software Engineer',
      joinedDate: new Date('2024-01-10'),
      employmentStatus: 'ACTIVE',
    },
  });

  await prisma.employee.upsert({
    where: { id: ids.adminEmployee },
    update: {
      tenantId: tenant.id,
      userId: companyAdmin.id,
      employeeCode: 'ADM-0001',
      department: 'HR',
      designation: 'HR Manager',
      joinedDate: new Date('2023-08-01'),
      employmentStatus: 'ACTIVE',
    },
    create: {
      id: ids.adminEmployee,
      tenantId: tenant.id,
      userId: companyAdmin.id,
      employeeCode: 'ADM-0001',
      department: 'HR',
      designation: 'HR Manager',
      joinedDate: new Date('2023-08-01'),
      employmentStatus: 'ACTIVE',
    },
  });

  const payrollRun = await prisma.payrollRun.upsert({
    where: { id: ids.payrollRun },
    update: {
      tenantId: tenant.id,
      period: '2026-04',
      grossAmount: 50000,
      netAmount: 43000,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
    create: {
      id: ids.payrollRun,
      tenantId: tenant.id,
      period: '2026-04',
      grossAmount: 50000,
      netAmount: 43000,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  });

  const payrollRunMay = await prisma.payrollRun.upsert({
    where: { id: ids.payrollRunMay },
    update: {
      tenantId: tenant.id,
      period: '2026-05',
      grossAmount: 52000,
      netAmount: 44600,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
    create: {
      id: ids.payrollRunMay,
      tenantId: tenant.id,
      period: '2026-05',
      grossAmount: 52000,
      netAmount: 44600,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  });

  await Promise.all([
    prisma.leaveRequest.upsert({
      where: { id: ids.leaveRequest },
      update: {
        employeeId: employee.id,
        type: 'Casual',
        startDate: new Date('2026-05-04'),
        endDate: new Date('2026-05-06'),
        days: 3,
        reason: 'Personal work',
        status: 'PENDING',
      },
      create: {
        id: ids.leaveRequest,
        employeeId: employee.id,
        type: 'Casual',
        startDate: new Date('2026-05-04'),
        endDate: new Date('2026-05-06'),
        days: 3,
        reason: 'Personal work',
        status: 'PENDING',
      },
    }),
    prisma.leaveRequest.upsert({
      where: { id: ids.leaveRequest2 },
      update: {
        employeeId: employee.id,
        type: 'Sick',
        startDate: new Date('2026-04-15'),
        endDate: new Date('2026-04-16'),
        days: 2,
        reason: 'Fever',
        status: 'APPROVED',
      },
      create: {
        id: ids.leaveRequest2,
        employeeId: employee.id,
        type: 'Sick',
        startDate: new Date('2026-04-15'),
        endDate: new Date('2026-04-16'),
        days: 2,
        reason: 'Fever',
        status: 'APPROVED',
      },
    }),
    prisma.attendance.upsert({
      where: { id: ids.attendance },
      update: {
        employeeId: employee.id,
        date: new Date('2026-04-29'),
        clockIn: new Date('2026-04-29T09:00:00Z'),
        clockOut: new Date('2026-04-29T17:30:00Z'),
        hours: 8.5,
        status: 'PRESENT',
      },
      create: {
        id: ids.attendance,
        employeeId: employee.id,
        date: new Date('2026-04-29'),
        clockIn: new Date('2026-04-29T09:00:00Z'),
        clockOut: new Date('2026-04-29T17:30:00Z'),
        hours: 8.5,
        status: 'PRESENT',
      },
    }),
    prisma.attendance.upsert({
      where: { id: ids.attendance2 },
      update: {
        employeeId: employee.id,
        date: new Date('2026-04-30'),
        clockIn: new Date('2026-04-30T09:10:00Z'),
        clockOut: new Date('2026-04-30T17:20:00Z'),
        hours: 8.2,
        status: 'PRESENT',
      },
      create: {
        id: ids.attendance2,
        employeeId: employee.id,
        date: new Date('2026-04-30'),
        clockIn: new Date('2026-04-30T09:10:00Z'),
        clockOut: new Date('2026-04-30T17:20:00Z'),
        hours: 8.2,
        status: 'PRESENT',
      },
    }),
    prisma.attendance.upsert({
      where: { id: ids.attendance3 },
      update: {
        employeeId: employee.id,
        date: new Date('2026-05-01'),
        clockIn: new Date('2026-05-01T09:05:00Z'),
        clockOut: new Date('2026-05-01T17:40:00Z'),
        hours: 8.6,
        status: 'PRESENT',
      },
      create: {
        id: ids.attendance3,
        employeeId: employee.id,
        date: new Date('2026-05-01'),
        clockIn: new Date('2026-05-01T09:05:00Z'),
        clockOut: new Date('2026-05-01T17:40:00Z'),
        hours: 8.6,
        status: 'PRESENT',
      },
    }),
    prisma.payslip.upsert({
      where: { id: ids.payslip },
      update: {
        employeeId: employee.id,
        payrollRunId: payrollRun.id,
        grossPay: 50000,
        deductions: 7000,
        netPay: 43000,
        status: 'GENERATED',
      },
      create: {
        id: ids.payslip,
        employeeId: employee.id,
        payrollRunId: payrollRun.id,
        grossPay: 50000,
        deductions: 7000,
        netPay: 43000,
        status: 'GENERATED',
      },
    }),
    prisma.payslip.upsert({
      where: { id: ids.payslip2 },
      update: {
        employeeId: employee.id,
        payrollRunId: payrollRunMay.id,
        grossPay: 52000,
        deductions: 7400,
        netPay: 44600,
        status: 'SENT',
      },
      create: {
        id: ids.payslip2,
        employeeId: employee.id,
        payrollRunId: payrollRunMay.id,
        grossPay: 52000,
        deductions: 7400,
        netPay: 44600,
        status: 'SENT',
      },
    }),
    prisma.candidate.upsert({
      where: { id: ids.candidate },
      update: {
        tenantId: tenant.id,
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        roleApplied: 'HR Executive',
        source: 'LinkedIn',
        stage: 'Interview',
        rating: 4,
      },
      create: {
        id: ids.candidate,
        tenantId: tenant.id,
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        roleApplied: 'HR Executive',
        source: 'LinkedIn',
        stage: 'Interview',
        rating: 4,
      },
    }),
  ]);

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
