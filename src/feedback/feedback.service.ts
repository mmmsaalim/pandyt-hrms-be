import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: number) {
    return this.prisma.hrFeedback.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async create(tenantId: number, authorUserId: number, dto: CreateFeedbackDto) {
    return this.prisma.hrFeedback.create({
      data: {
        tenantId,
        authorUserId,
        subjectLabel: dto.subjectLabel?.trim() || null,
        category: dto.category?.trim() || 'GENERAL',
        rating: dto.rating ?? null,
        body: dto.body.trim(),
        contextModule: dto.contextModule?.trim() || null,
      },
    });
  }

  assertTenantAccess(userTenantId: number | null | undefined, tenantId: number) {
    if (!userTenantId || userTenantId !== tenantId) {
      throw new ForbiddenException('Tenant access denied.');
    }
  }
}
