import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';
import { CreateLetterDto, UpdateLetterDto } from './dto/create-letter.dto';

type LetterAccessContext = {
  userId: number;
  roles: string[];
};

@Injectable()
export class LettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantConfigurationService: TenantConfigurationService,
  ) {}

  private isCompanyAdmin(roles: string[]): boolean {
    return roles.includes('COMPANY_ADMIN');
  }

  private assertLetterAccess(
    letter: { createdBy: number },
    { userId, roles }: LetterAccessContext,
  ): void {
    if (this.isCompanyAdmin(roles)) {
      return;
    }

    if (letter.createdBy !== userId) {
      throw new ForbiddenException('You can only access letters you created.');
    }
  }

  async list(tenantId: number, access: LetterAccessContext) {
    const where = this.isCompanyAdmin(access.roles)
      ? { tenantId }
      : { tenantId, createdBy: access.userId };

    const letters = await this.prisma.hrLetter.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (!this.isCompanyAdmin(access.roles) || letters.length === 0) {
      return letters.map((letter) => ({ ...letter, createdByUser: null }));
    }

    const creatorIds = [...new Set(letters.map((letter) => letter.createdBy))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

    return letters.map((letter) => ({
      ...letter,
      createdByUser: creatorById.get(letter.createdBy) ?? null,
    }));
  }

  async getOne(tenantId: number, id: number, access: LetterAccessContext) {
    const letter = await this.prisma.hrLetter.findFirst({
      where: { id, tenantId },
    });

    if (!letter) {
      throw new NotFoundException('Letter not found.');
    }

    this.assertLetterAccess(letter, access);
    return letter;
  }

  async create(tenantId: number, userId: number, dto: CreateLetterDto) {
    return this.prisma.hrLetter.create({
      data: {
        tenantId,
        createdBy: userId,
        title: dto.title.trim(),
        letterType: dto.letterType?.trim() || 'GENERAL',
        recipientName: dto.recipientName?.trim() || null,
        body: dto.body.trim(),
        status: 'DRAFT',
      },
    });
  }

  async update(tenantId: number, id: number, dto: UpdateLetterDto, access: LetterAccessContext) {
    const letter = await this.getOne(tenantId, id, access);

    return this.prisma.hrLetter.update({
      where: { id: letter.id },
      data: {
        title: dto.title?.trim(),
        letterType: dto.letterType?.trim(),
        recipientName: dto.recipientName?.trim(),
        body: dto.body?.trim(),
        status: dto.status?.trim(),
      },
    });
  }

  async remove(tenantId: number, id: number, access: LetterAccessContext) {
    const letter = await this.getOne(tenantId, id, access);
    await this.prisma.hrLetter.delete({ where: { id: letter.id } });
    return { success: true };
  }

  async getPrintPayload(tenantId: number, id: number, access: LetterAccessContext) {
    const [letter, tenant, runtimeConfig] = await Promise.all([
      this.getOne(tenantId, id, access),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, config: true },
      }),
      this.tenantConfigurationService.getTenantRuntimeConfig(tenantId),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const rawConfig = (tenant.config ?? {}) as Record<string, unknown>;
    const letterheadRaw = rawConfig.letterhead;
    const letterhead =
      letterheadRaw && typeof letterheadRaw === 'object' && !Array.isArray(letterheadRaw)
        ? (letterheadRaw as Record<string, string>)
        : {};

    return {
      letter,
      letterhead: {
        companyDisplayName: letterhead.companyDisplayName || tenant.name,
        address: letterhead.address || '',
        phone: letterhead.phone || '',
        email: letterhead.email || '',
        logoUrl: letterhead.logoUrl || '',
      },
      locale: runtimeConfig.config.locale,
      currency: runtimeConfig.config.currency,
    };
  }

  assertTenantAccess(userTenantId: number | null | undefined, tenantId: number) {
    if (!userTenantId || userTenantId !== tenantId) {
      throw new ForbiddenException('Tenant access denied.');
    }
  }
}
