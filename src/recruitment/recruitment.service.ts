import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: { tenantId?: number } | undefined): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }

    return tenantId;
  }

  findAll(user: { tenantId?: number } | undefined) {
    const tenantId = this.requireTenant(user);
    return this.prisma.candidate.findMany({
      where: { tenantId },
      include: { tenant: true },
    });
  }

  create(dto: CreateCandidateDto, user: { tenantId?: number } | undefined) {
    const tenantId = this.requireTenant(user);
    return this.prisma.candidate.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async update(
    id: number,
    dto: UpdateCandidateDto,
    user: { tenantId?: number } | undefined,
  ) {
    const tenantId = this.requireTenant(user);
    const row = await this.prisma.candidate.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!row || row.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot update candidate for another tenant.');
    }

    return this.prisma.candidate.update({ where: { id }, data: dto });
  }

  async remove(id: number, user: { tenantId?: number } | undefined) {
    const tenantId = this.requireTenant(user);
    const row = await this.prisma.candidate.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!row || row.tenantId !== tenantId) {
      throw new ForbiddenException('Cannot remove candidate for another tenant.');
    }

    return this.prisma.candidate.delete({ where: { id } });
  }
}
