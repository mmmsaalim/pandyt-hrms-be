import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';
import { EmailService } from '../email/email.service';
import { CreateLetterDto, SendLetterEmailDto, UpdateLetterDto } from './dto/create-letter.dto';

type LetterAccessContext = {
  userId: number;
  roles: string[];
};

const LETTER_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General letter',
  APPOINTMENT: 'Appointment letter',
  WARNING: 'Warning letter',
  CONFIRMATION: 'Confirmation letter',
  OFFER: 'Offer letter',
  EXPERIENCE: 'Experience certificate',
};

const LETTER_TYPE_SUBJECTS: Record<string, string> = {
  GENERAL: 'General Communication',
  APPOINTMENT: 'Appointment as [Job Title]',
  WARNING: 'Formal Warning — [Reason]',
  CONFIRMATION: 'Confirmation of Employment',
  OFFER: 'Offer of Employment — [Job Title]',
  EXPERIENCE: 'Experience Certificate — [Employee Name]',
};

@Injectable()
export class LettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantConfigurationService: TenantConfigurationService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
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

    const locale = runtimeConfig.config.locale || 'en-GB';
    const issueDate = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    return {
      letter,
      letterhead: {
        companyDisplayName: letterhead.companyDisplayName || tenant.name,
        address: letterhead.address || '',
        phone: letterhead.phone || '',
        email: letterhead.email || '',
        logoUrl: letterhead.logoUrl || '',
      },
      locale,
      currency: runtimeConfig.config.currency,
      printMeta: {
        referenceNo: `HR/${tenantId}/${letter.id}/${new Date().getFullYear()}`,
        issueDate,
        letterTypeLabel: LETTER_TYPE_LABELS[letter.letterType] ?? letter.letterType,
        subject: LETTER_TYPE_SUBJECTS[letter.letterType] ?? letter.title,
      },
    };
  }

  async sendByEmail(
    tenantId: number,
    id: number,
    dto: SendLetterEmailDto,
    access: LetterAccessContext,
  ) {
    const letter = await this.getOne(tenantId, id, access);

    // Resolve the recipient: either an existing employee (email taken from their
    // account) or an explicit email address for someone not yet onboarded.
    let to: string;
    let recipientName: string;

    if (dto.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId },
        select: { user: { select: { email: true, firstName: true, lastName: true } } },
      });

      if (!employee?.user?.email) {
        throw new BadRequestException('Selected employee does not have an email address on file.');
      }

      to = employee.user.email;
      recipientName =
        `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim() ||
        letter.recipientName ||
        'Colleague';
    } else if (dto.email) {
      to = dto.email;
      recipientName = dto.recipientName?.trim() || letter.recipientName || 'Colleague';
    } else {
      throw new BadRequestException('Provide an employee or an email address to send the letter to.');
    }

    const [tenant, sender] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: access.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const senderName = `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim() || undefined;

    await this.emailService.sendHrLetterEmail({
      to,
      recipientName,
      companyName: tenant?.name ?? 'Your company',
      subject: letter.title || 'Official Letter',
      body: letter.body,
      senderName,
      supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
    });

    const updated = await this.prisma.hrLetter.update({
      where: { id: letter.id },
      data: { status: 'SENT', recipientName },
    });

    return { success: true, sentTo: to, letter: updated };
  }

  assertTenantAccess(userTenantId: number | null | undefined, tenantId: number) {
    if (!userTenantId || userTenantId !== tenantId) {
      throw new ForbiddenException('Tenant access denied.');
    }
  }
}
