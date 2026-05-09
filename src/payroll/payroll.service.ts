import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: { tenantId?: string } | undefined): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }

    return tenantId;
  }

  findAll(user: { tenantId?: string } | undefined) {
    const tenantId = this.requireTenant(user);
    return this.prisma.payrollRun.findMany({
      where: { tenantId },
      include: { tenant: true },
    });
  }

  create(dto: CreatePayrollRunDto, user: { tenantId?: string } | undefined) {
    const tenantId = this.requireTenant(user);
    return this.prisma.payrollRun.create({
      data: {
        ...dto,
        tenantId,
        processedAt: dto.processedAt ? new Date(dto.processedAt) : null,
      },
    });
  }

  async update(
    id: string,
    dto: UpdatePayrollRunDto,
    user: { tenantId?: string } | undefined,
  ) {
    const tenantId = this.requireTenant(user);
    const row = await this.prisma.payrollRun.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!row || row.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot update payroll for another tenant.');
    }

    return this.prisma.payrollRun.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: { tenantId?: string } | undefined) {
    const tenantId = this.requireTenant(user);
    const row = await this.prisma.payrollRun.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!row || row.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot remove payroll for another tenant.');
    }

    return this.prisma.payrollRun.delete({ where: { id } });
  }
}
