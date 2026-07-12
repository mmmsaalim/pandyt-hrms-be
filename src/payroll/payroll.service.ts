import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import { AttendanceCalculationService } from '../attendance/attendance-calculation.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCalculation: AttendanceCalculationService,
  ) {}

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
    const leaveDeductionByEmployee = new Map<number, number>();
    const overtimeAllowanceByEmployee = new Map<number, number>();
    const breakdownByEmployee = new Map<number, Array<{ type: string; amount: number; reason: string }>>();
    let payrollIntegration = this.attendanceCalculation.resolvePayrollIntegration(null);

    const pushBreakdown = (employeeId: number, type: string, amount: number, reason: string) => {
      if (amount <= 0 && type !== 'OT_TIME_OFF') {
        return;
      }
      const rows = breakdownByEmployee.get(employeeId) ?? [];
      rows.push({ type, amount: Math.round(amount * 100) / 100, reason });
      breakdownByEmployee.set(employeeId, rows);
    };

    if (Number.isInteger(periodYear) && Number.isInteger(periodMonth)) {
      const startDate = new Date(periodYear, periodMonth - 1, 1);
      const endDate = new Date(periodYear, periodMonth, 1);
      const [canteenEntries, attendanceSettings, attendanceRows, leaveRows] = await Promise.all([
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
            date: true,
          },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            status: 'APPROVED',
            employee: { tenantId },
            startDate: { lt: endDate },
            endDate: { gte: startDate },
          },
          select: {
            employeeId: true,
            type: true,
            unpaidDays: true,
            paidDays: true,
            days: true,
            startDate: true,
            endDate: true,
          },
        }),
      ]);

      for (const entry of canteenEntries) {
        canteenDeductionByEmployee.set(
          entry.employeeId,
          (canteenDeductionByEmployee.get(entry.employeeId) ?? 0) + entry.totalCost,
        );
      }

      payrollIntegration = this.attendanceCalculation.resolvePayrollIntegration(
        attendanceSettings?.payrollIntegration,
      );
      const overtimeRules = this.attendanceCalculation.resolveOvertimeRules(
        attendanceSettings?.overtimeRules,
      );

      for (const row of attendanceRows) {
        if (payrollIntegration.ignoreWeekends && row.status === 'WEEKEND') {
          continue;
        }
        if (payrollIntegration.ignoreCompanyHolidays && row.status === 'HOLIDAY') {
          continue;
        }
        if (payrollIntegration.ignoreApprovedLeave && String(row.status).startsWith('ON_LEAVE')) {
          continue;
        }

        if (payrollIntegration.deductLateArrivals || payrollIntegration.deductEarlyDepartures) {
          const adj = row.payrollAdjustment ?? 0;
          if (adj > 0) {
            attendanceDeductionByEmployee.set(
              row.employeeId,
              (attendanceDeductionByEmployee.get(row.employeeId) ?? 0) + adj,
            );
            pushBreakdown(
              row.employeeId,
              'ATTENDANCE',
              adj,
              `Attendance adjustment on ${this.attendanceCalculation.toDateKey(row.date)} (late/early rule)`,
            );
          }
        }

        if (payrollIntegration.deductAbsences && row.status === 'ABSENT') {
          const employee = employees.find((item) => item.id === row.employeeId);
          if (employee) {
            const dailySalary = this.attendanceCalculation.resolveDailySalary(
              employee.salary,
              payrollIntegration,
            );
            attendanceDeductionByEmployee.set(
              row.employeeId,
              (attendanceDeductionByEmployee.get(row.employeeId) ?? 0) + dailySalary,
            );
            pushBreakdown(
              row.employeeId,
              'ABSENCE',
              dailySalary,
              `Absent on ${this.attendanceCalculation.toDateKey(row.date)} — 1 day salary deducted`,
            );
          }
        }

        if (
          payrollIntegration.includeOvertime &&
          row.overtimeHours > 0 &&
          attendanceSettings?.overtimeEnabled
        ) {
          const employee = employees.find((item) => item.id === row.employeeId);
          if (!employee) {
            continue;
          }

          if (overtimeRules.compensationMode === 'TIME_OFF') {
            const standardHours = this.attendanceCalculation.resolveStandardHoursPerDay(payrollIntegration);
            const leaveDays = this.attendanceCalculation.roundDays(
              row.overtimeHours / (standardHours > 0 ? standardHours : 8),
            );
            if (leaveDays > 0) {
              await this.creditAnnualLeaveForOt(tenantId, row.employeeId, leaveDays);
              pushBreakdown(
                row.employeeId,
                'OT_TIME_OFF',
                0,
                `OT ${row.overtimeHours}h converted to ${leaveDays} Annual leave day(s) (TIME_OFF mode)`,
              );
            }
          } else if (
            overtimeRules.compensationMode === 'PAY' &&
            !overtimeRules.requiresApproval &&
            !attendanceSettings.requireManagerApproval
          ) {
            const overtimePay = this.attendanceCalculation.computeOvertimePay(
              employee.salary,
              row.overtimeHours,
              overtimeRules,
              payrollIntegration,
            );
            overtimeAllowanceByEmployee.set(
              row.employeeId,
              (overtimeAllowanceByEmployee.get(row.employeeId) ?? 0) + overtimePay,
            );
          }
        }
      }

      // Unpaid leave (beyond entitlement) — company holidays & paid leave do NOT deduct.
      for (const leave of leaveRows) {
        const unpaid =
          leave.unpaidDays > 0
            ? leave.unpaidDays
            : 0;
        if (unpaid <= 0) {
          continue;
        }
        const employee = employees.find((item) => item.id === leave.employeeId);
        if (!employee) {
          continue;
        }
        const dailySalary = this.attendanceCalculation.resolveDailySalary(
          employee.salary,
          payrollIntegration,
        );
        const amount = this.attendanceCalculation.roundDays(unpaid) * dailySalary;
        leaveDeductionByEmployee.set(
          leave.employeeId,
          (leaveDeductionByEmployee.get(leave.employeeId) ?? 0) + amount,
        );
        const paid = leave.paidDays > 0 ? leave.paidDays : Math.max(0, leave.days - unpaid);
        pushBreakdown(
          leave.employeeId,
          'UNPAID_LEAVE',
          amount,
          `Unpaid ${leave.type} leave: ${unpaid} day(s) beyond entitlement (paid ${paid} of ${leave.days} from balance)`,
        );
      }
    }

    const payslipData = employees.map((emp) => {
      const statutory = calculateStatutory(emp.salary, 0);
      const canteenDeduction = Math.round((canteenDeductionByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const attendanceDeduction = Math.round((attendanceDeductionByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const leaveDeduction = Math.round((leaveDeductionByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const overtimeAllowance = Math.round((overtimeAllowanceByEmployee.get(emp.id) ?? 0) * 100) / 100;
      const grossPay = Math.round((statutory.grossPay + overtimeAllowance) * 100) / 100;
      const deductions =
        Math.round((statutory.deductions + canteenDeduction + attendanceDeduction + leaveDeduction) * 100) /
        100;
      const netPay = Math.round((grossPay - deductions) * 100) / 100;
      totalGross += grossPay;
      totalNet += netPay;

      if (canteenDeduction > 0) {
        pushBreakdown(emp.id, 'CANTEEN', canteenDeduction, 'Canteen meal deductions');
      }

      return {
        employeeId: emp.id,
        payrollRunId: id,
        basicPay: emp.salary,
        allowances: overtimeAllowance,
        attendanceDeduction,
        leaveDeduction,
        deductionBreakdown: breakdownByEmployee.get(emp.id) ?? [],
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

  private async creditAnnualLeaveForOt(tenantId: number, employeeId: number, days: number) {
    const policy = await this.prisma.leavePolicy.findFirst({
      where: {
        tenantId,
        OR: [
          { code: { equals: 'annual', mode: 'insensitive' } },
          { name: { contains: 'annual', mode: 'insensitive' } },
        ],
      },
    });
    if (!policy) {
      return;
    }

    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leavePolicyId: {
          employeeId,
          leavePolicyId: policy.id,
        },
      },
    });

    if (balance) {
      await this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { allocated: { increment: days } },
      });
    } else {
      await this.prisma.leaveBalance.create({
        data: {
          tenantId,
          employeeId,
          leavePolicyId: policy.id,
          allocated: policy.days + days,
          used: 0,
          accrued: days,
        },
      });
    }
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

  private shouldPayOvertime(overtimeRules: unknown, overtimeEnabled?: boolean | null): boolean {
    if (!overtimeEnabled) {
      return false;
    }

    if (!overtimeRules || typeof overtimeRules !== 'object') {
      return true;
    }

    const compensationMode = (overtimeRules as { compensationMode?: string }).compensationMode ?? 'PAY';
    return compensationMode === 'PAY';
  }
}
