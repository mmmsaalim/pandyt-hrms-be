import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import {
  SL_EPF_EMPLOYEE_RATE,
  SL_EPF_EMPLOYER_RATE,
  SL_ETF_EMPLOYER_RATE,
} from './sri-lanka-statutory.constants';

type RequestUser = { sub?: number; roles?: string[]; tenantId?: number } | undefined;

// ─────────────────────────────────────────────────
// Sri Lanka Statutory Calculator (IRD / EPF / ETF)
// ─────────────────────────────────────────────────
function calculateStatutory(basicPay: number, allowances: number) {
  const grossPay = basicPay + allowances;

  const epfEmployee = Math.round(grossPay * SL_EPF_EMPLOYEE_RATE * 100) / 100;
  const epfEmployer = Math.round(grossPay * SL_EPF_EMPLOYER_RATE * 100) / 100;
  const etfEmployer = Math.round(grossPay * SL_ETF_EMPLOYER_RATE * 100) / 100;

  // PAYE – IRD monthly tax schedule (LKR, 2024)
  // Annual gross = grossPay * 12
  const annualGross = grossPay * 12;
  let annualPaye = 0;
  if (annualGross <= 1_200_000) {
    annualPaye = 0;
  } else if (annualGross <= 1_800_000) {
    annualPaye = (annualGross - 1_200_000) * 0.06;
  } else if (annualGross <= 2_400_000) {
    annualPaye = 36_000 + (annualGross - 1_800_000) * 0.12;
  } else if (annualGross <= 3_600_000) {
    annualPaye = 108_000 + (annualGross - 2_400_000) * 0.18;
  } else if (annualGross <= 6_000_000) {
    annualPaye = 324_000 + (annualGross - 3_600_000) * 0.24;
  } else {
    annualPaye = 900_000 + (annualGross - 6_000_000) * 0.36;
  }
  const payeTax = Math.round((annualPaye / 12) * 100) / 100;

  const totalDeductions = epfEmployee + payeTax;
  const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;

  return { grossPay, epfEmployee, epfEmployer, etfEmployer, payeTax, deductions: totalDeductions, netPay };
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: RequestUser): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    return tenantId;
  }

  private async assertOwnership(id: number, tenantId: number) {
    const row = await this.prisma.payrollRun.findUnique({
      where: { id },
      select: { tenantId: true, status: true, period: true },
    });
    if (!row || row.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot access payroll for another tenant.');
    }
    return row;
  }

  findAll(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.payrollRun.findMany({
      where: { tenantId },
      include: { tenant: true },
    });
  }

  create(dto: CreatePayrollRunDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.payrollRun.create({
      data: {
        ...dto,
        tenantId,
        status: 'DRAFT',
        grossAmount: 0,
        netAmount: 0,
        processedAt: null,
      },
    });
  }

  /**
   * Process payroll: iterates all active employees, computes LKR statutory
   * deductions, creates Payslip records, and marks the run as COMPLETED.
   */
  async process(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const run = await this.assertOwnership(id, tenantId);

    if (run.status === 'COMPLETED') {
      throw new BadRequestException('This payroll run has already been completed.');
    }
    if (run.status === 'PROCESSING') {
      throw new BadRequestException('This payroll run is already in progress.');
    }

    // Mark as PROCESSING
    await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employmentStatus: 'ACTIVE', deletedAt: null },
      select: { id: true, salary: true },
    });

    if (employees.length === 0) {
      await this.prisma.payrollRun.update({
        where: { id },
        data: { status: 'DRAFT' },
      });
      throw new BadRequestException('No active employees found for this tenant.');
    }

    let totalGross = 0;
    let totalNet = 0;

    // Delete any pre-existing payslips for this run (re-process safety)
    await this.prisma.payslip.deleteMany({ where: { payrollRunId: id } });

    const [periodYear, periodMonth] = run.period.split('-').map((value) => Number(value));
    const canteenDeductionByEmployee = new Map<number, number>();
    const attendanceDeductionByEmployee = new Map<number, number>();
    const overtimeAllowanceByEmployee = new Map<number, number>();
    if (Number.isInteger(periodYear) && Number.isInteger(periodMonth)) {
      const startDate = new Date(periodYear, periodMonth - 1, 1);
      const endDate = new Date(periodYear, periodMonth, 1);
      const [canteenEntries, attendanceSettings, attendanceRows] = await Promise.all([
        this.prisma.canteenMealEntry.findMany({
          where: {
            tenantId,
            deductFromSalary: true,
            date: {
              gte: startDate,
              lt: endDate,
            },
          },
          select: {
            employeeId: true,
            totalCost: true,
          },
        }),
        this.prisma.attendanceSettings.findUnique({ where: { tenantId } }),
        this.prisma.attendance.findMany({
          where: {
            date: {
              gte: startDate,
              lt: endDate,
            },
            employee: { tenantId },
          },
          select: {
            employeeId: true,
            payrollAdjustment: true,
            overtimeHours: true,
            status: true,
          },
        }),
      ]);

      for (const entry of canteenEntries) {
        canteenDeductionByEmployee.set(
          entry.employeeId,
          (canteenDeductionByEmployee.get(entry.employeeId) ?? 0) + entry.totalCost,
        );
      }

      const payrollIntegration =
        attendanceSettings?.payrollIntegration &&
        typeof attendanceSettings.payrollIntegration === 'object'
          ? (attendanceSettings.payrollIntegration as {
              deductLateArrivals?: boolean;
              deductEarlyDepartures?: boolean;
              deductAbsences?: boolean;
              includeOvertime?: boolean;
            })
          : null;

      for (const row of attendanceRows) {
        if (payrollIntegration?.deductLateArrivals || payrollIntegration?.deductEarlyDepartures) {
          attendanceDeductionByEmployee.set(
            row.employeeId,
            (attendanceDeductionByEmployee.get(row.employeeId) ?? 0) + (row.payrollAdjustment ?? 0),
          );
        }

        if (payrollIntegration?.deductAbsences && row.status === 'ABSENT') {
          const employee = employees.find((item) => item.id === row.employeeId);
          if (employee) {
            const dailySalary = employee.salary / 22;
            attendanceDeductionByEmployee.set(
              row.employeeId,
              (attendanceDeductionByEmployee.get(row.employeeId) ?? 0) + dailySalary,
            );
          }
        }

        if (payrollIntegration?.includeOvertime && row.overtimeHours > 0) {
          const employee = employees.find((item) => item.id === row.employeeId);
          if (employee) {
            const hourlyRate = employee.salary / (22 * 8);
            overtimeAllowanceByEmployee.set(
              row.employeeId,
              (overtimeAllowanceByEmployee.get(row.employeeId) ?? 0) + row.overtimeHours * hourlyRate,
            );
          }
        }
      }
    }

    const payslipData = employees.map((emp) => {
      const statutory =
        calculateStatutory(emp.salary, 0);
      const canteenDeduction = Math.round((canteenDeductionByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const attendanceDeduction = Math.round((attendanceDeductionByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const overtimeAllowance = Math.round((overtimeAllowanceByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const grossPay = Math.round((statutory.grossPay + overtimeAllowance) * 100) / 100;
      const deductions = Math.round((statutory.deductions + canteenDeduction + attendanceDeduction) * 100) / 100;
      const netPay = Math.round((grossPay - deductions) * 100) / 100;
      totalGross += grossPay;
      totalNet += netPay;
      return {
        employeeId: emp.id,
        payrollRunId: id,
        basicPay: emp.salary,
        allowances: overtimeAllowance,
        grossPay,
        epfEmployee: statutory.epfEmployee,
        epfEmployer: statutory.epfEmployer,
        etfEmployer: statutory.etfEmployer,
        payeTax: statutory.payeTax,
        deductions,
        netPay,
        status: 'GENERATED' as const,
      };
    });

    await this.prisma.payslip.createMany({ data: payslipData });

    return this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        grossAmount: Math.round(totalGross * 100) / 100,
        netAmount: Math.round(totalNet * 100) / 100,
        processedAt: new Date(),
      },
    });
  }

  async update(id: number, dto: UpdatePayrollRunDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const row = await this.assertOwnership(id, tenantId);

    if (row.status === 'COMPLETED') {
      throw new BadRequestException('Cannot update a completed payroll run.');
    }

    return this.prisma.payrollRun.update({ where: { id }, data: dto });
  }

  async remove(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    await this.assertOwnership(id, tenantId);
    return this.prisma.payrollRun.delete({ where: { id } });
  }
}
