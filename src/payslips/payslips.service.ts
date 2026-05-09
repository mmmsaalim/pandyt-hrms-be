import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';

type RequestUser = { sub: string; roles?: string[] } | undefined;

@Injectable()
export class PayslipsService {
  constructor(private readonly prisma: PrismaService) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private async getEmployeeContext(userId: string) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
  }

  async findAll(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employeeContext = await this.getEmployeeContext(user.sub);
    if (!employeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      return this.prisma.payslip.findMany({
        where: { employeeId: employeeContext.id },
        include: { employee: { include: { user: true } }, payrollRun: true },
      });
    }

    if (this.hasRole(user, 'COMPANY_ADMIN')) {
      return this.prisma.payslip.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        include: { employee: { include: { user: true } }, payrollRun: true },
      });
    }

    throw new ForbiddenException('Insufficient role permission.');
  }

  async create(dto: CreatePayslipDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const [employee, payrollRun] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
        select: { tenantId: true },
      }),
      this.prisma.payrollRun.findUnique({
        where: { id: dto.payrollRunId },
        select: { tenantId: true },
      }),
    ]);

    if (
      !employee ||
      !payrollRun ||
      employee.tenantId !== adminEmployeeContext.tenantId ||
      payrollRun.tenantId !== adminEmployeeContext.tenantId
    ) {
      throw new ForbiddenException('Cannot create payslip for another tenant.');
    }

    return this.prisma.payslip.create({ data: dto });
  }

  async update(id: string, dto: UpdatePayslipDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      select: {
        employee: {
          select: { tenantId: true },
        },
      },
    });

    if (!payslip || payslip.employee.tenantId !== adminEmployeeContext.tenantId) {
      throw new ForbiddenException('Cannot update payslip for another tenant.');
    }

    return this.prisma.payslip.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      select: {
        employee: {
          select: { tenantId: true },
        },
      },
    });

    if (!payslip || payslip.employee.tenantId !== adminEmployeeContext.tenantId) {
      throw new ForbiddenException('Cannot remove payslip for another tenant.');
    }

    return this.prisma.payslip.delete({ where: { id } });
  }
}
