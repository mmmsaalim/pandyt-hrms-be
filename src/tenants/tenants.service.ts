import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService, PrismaTxClient } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantLeadStatusEnum } from './dto/create-tenant.dto';
import { CreateCompanyWithAdminDto } from './dto/create-company-with-admin.dto';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';
import { LeaveService } from '../leave/leave.service';
import { LeaveSetupConfig } from '../leave/leave.constants';
import { DEFAULT_PAYSLIP_TEMPLATE_KEY } from '../payroll/payslip.constants';
import { SaveTenantConfigurationDto } from '../tenant-configuration/dto/save-tenant-configuration.dto';
import {
  DEFAULT_TENANT_CONFIG,
  modulesForPlan,
  normalizePlan,
  resolveSeatsForPlan,
} from '../tenant-configuration/tenant-configuration.constants';
import { buildPaginatedResult, parsePaginationQuery } from '../common/pagination';
import { normalizeCompanyProfile, readCompanyProfile } from './tenant-company-profile.constants';

type TxClient = PrismaTxClient;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly defaultReminderDays = [7, 3, 1, 0];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly tenantConfigurationService: TenantConfigurationService,
    private readonly leaveService: LeaveService,
  ) {}

  private normalizeCompanyCode(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildCompanyCodeBase(name: string): string {
    const normalized = this.normalizeCompanyCode(name);
    return normalized || 'tenant';
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL', 'http://localhost:4200');
  }

  private loginUrl(): string {
    return `${this.appUrl()}/login`;
  }

  private onboardingUrl(token: string): string {
    return `${this.appUrl()}/reset-password?token=${token}`;
  }

  private resetExpiryHours(): number {
    return Number(this.config.get<string>('PASSWORD_RESET_EXPIRY_HOURS', '24'));
  }

  private async createPasswordSetupToken(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.resetExpiryHours() * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: this.tokenHash(token),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private async resolveCompanyCode(
    preferred: string | undefined,
    companyName: string,
    excludeTenantId?: number,
  ): Promise<string> {
    const baseCandidate = preferred?.trim()
      ? this.normalizeCompanyCode(preferred)
      : this.buildCompanyCodeBase(companyName);

    if (!baseCandidate) {
      throw new BadRequestException('companyCode is invalid.');
    }

    for (let suffix = 0; suffix < 500; suffix += 1) {
      const candidate = suffix === 0 ? baseCandidate : `${baseCandidate}-${suffix + 1}`;

      const existing = await this.prisma.tenant.findFirst({
        where: {
          companyCode: candidate,
          ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}),
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new BadRequestException('Unable to allocate a unique companyCode.');
  }

  private buildAdminEmployeeCode(tenantId: number, userId: number): string {
    return `TEN${tenantId}-ADM-${String(userId).padStart(4, '0')}`;
  }

  private async ensureCompanyAdminEmployeeProfile(
    tx: TxClient,
    tenantId: number,
    user: { id: number; firstName: string; lastName: string },
  ) {
    const employeeCode = this.buildAdminEmployeeCode(tenantId, user.id);
    const adminDepartment = await tx.department.upsert({
      where: {
        id: (
          await tx.department.findFirst({
            where: { tenantId, name: 'Administration' },
            select: { id: true },
          })
        )?.id ?? 0,
      },
      update: {},
      create: {
        tenantId,
        name: 'Administration',
      },
    });

    await tx.employee.upsert({
      where: { userId: user.id },
      update: {
        tenantId,
        employeeCode,
        department: 'Administration',
        departmentId: adminDepartment.id,
        designation: 'Company Admin',
        employmentStatus: 'ACTIVE',
      },
      create: {
        tenantId,
        userId: user.id,
        employeeCode,
        department: 'Administration',
        departmentId: adminDepartment.id,
        designation: 'Company Admin',
        joinedDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
  }

  private async ensureBusinessModuleAccess(
    tx: TxClient,
    tenantId: number,
    userId: number,
    enabledModules?: string[],
  ) {
    const moduleKeys =
      enabledModules ??
      (await this.tenantConfigurationService.getEnabledModuleKeys(tenantId));

    const permissions = await tx.permission.findMany({
      where: {
        module: { in: moduleKeys },
        NOT: [{ module: 'configuration' }, { module: 'tenants' }],
      },
      orderBy: [{ module: 'asc' }, { permission: 'asc' }],
    });

    const grouped = new Map<string, number[]>();
    for (const permission of permissions) {
      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission.id]);
    }

    for (const [module, permissionIds] of grouped.entries()) {
      const roleName = module.toUpperCase();
      const existingRole = await tx.role.findFirst({
        where: { tenantId, name: roleName },
        select: { id: true },
      });

      const role =
        existingRole ??
        (await tx.role.create({
          data: {
            tenantId,
            name: roleName,
            description: `${module} module access role`,
          },
          select: { id: true },
        }));

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: role.id,
        },
      });
    }
  }

  private tenantListWhere(group?: 'active' | 'archived'): Prisma.TenantWhereInput | undefined {
    if (group === 'active') {
      return {
        OR: [{ leadStatus: 'PENDING' }, { status: 'ACTIVE' }],
      };
    }

    if (group === 'archived') {
      return {
        OR: [{ leadStatus: 'DELETED' }, { status: 'SUSPENDED', leadStatus: { not: 'PENDING' } }],
      };
    }

    return undefined;
  }

  async findAll(page?: string | number, limit?: string | number, group?: 'active' | 'archived') {
    const pagination = parsePaginationQuery(page, limit);
    const where = this.tenantListWhere(group);
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          _count: {
            select: {
              users: true,
            },
          },
          users: {
            where: {
              roles: {
                some: {
                  role: {
                    name: 'COMPANY_ADMIN',
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              email: true,
              status: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      companyCode: row.companyCode,
      plan: row.plan,
      status: row.status,
      leadStatus: row.leadStatus,
      seats: row.seats,
      createdAt: row.createdAt,
      usersCount: row._count.users,
      companyAdmin: row.users[0] ?? null,
      companyProfile: readCompanyProfile(row.config),
    }));

    return buildPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  async findLeads(
    status?: TenantLeadStatusEnum,
    page?: string | number,
    limit?: string | number,
    group?: 'active' | 'archived',
  ) {
    const pagination = parsePaginationQuery(page, limit);
    const where = status ? { leadStatus: status } : this.tenantListWhere(group);
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          invitations: {
            where: { role: 'COMPANY_ADMIN' },
            orderBy: { invitedAt: 'desc' },
            select: {
              id: true,
              status: true,
              invitedAt: true,
              acceptedAt: true,
              expiresAt: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const items = rows.map((row) => {
      const latestAdminInvitation = row.invitations[0] ?? null;
      const pendingAdminInvitations = row.invitations.filter(
        (invitation) => invitation.status === 'PENDING',
      ).length;

      return {
        id: row.id,
        name: row.name,
        companyCode: row.companyCode,
        plan: row.plan,
        status: row.status,
        leadStatus: row.leadStatus,
        seats: row.seats,
        createdAt: row.createdAt,
        leadDetails:
          row.config && typeof row.config === 'object' && !Array.isArray(row.config)
            ? (row.config as Record<string, unknown>)['leadDetails'] ?? null
            : null,
        companyProfile: readCompanyProfile(row.config),
        latestAdminInvitation,
        pendingAdminInvitations,
      };
    });

    return buildPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  async paymentsOverview(page?: string | number, limit?: string | number) {
    const pagination = parsePaginationQuery(page, limit);
    const [tenants, total, billingConfig] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          billingSettings: true,
          users: {
            where: {
              status: { not: 'INACTIVE' },
              roles: {
                some: {
                  role: {
                    name: 'COMPANY_ADMIN',
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
            select: { email: true },
          },
          _count: {
            select: {
              employees: {
                where: {
                  deletedAt: null,
                  employmentStatus: { not: 'INACTIVE' },
                },
              },
            },
          },
        },
      }),
      this.prisma.tenant.count(),
      this.tenantConfigurationService.getPlatformBillingConfig(),
    ]);

    const items = tenants.map((tenant) => {
      const billingSettings = this.mapBillingSettings(tenant.id, tenant.billingSettings);
      return {
        ...this.toPaymentOverviewRow(tenant, billingConfig),
        billingContactEmails: billingSettings.recipientEmails,
        companyAdminEmail: tenant.users[0]?.email ?? null,
        billingRemindersEnabled: billingSettings.enabled,
      };
    });
    return buildPaginatedResult(items, total, pagination.page, pagination.limit);
  }

  async sendOverdueReminder(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        billingSettings: true,
        _count: {
          select: {
            employees: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const billingConfig = await this.tenantConfigurationService.getPlatformBillingConfig();
    const payment = this.toPaymentOverviewRow(tenant, billingConfig);
    if (payment.billingStatus !== 'OVERDUE') {
      throw new BadRequestException('Reminder is available only for overdue tenants.');
    }

    const settings = this.mapBillingSettings(tenant.id, tenant.billingSettings);
    const recipients = await this.resolveBillingRecipients(tenant.id, settings.recipientEmails);
    if (recipients.length === 0) {
      return {
        tenantId: tenant.id,
        companyName: tenant.name,
        recipients: 0,
        message: 'No billing contacts or company admin recipients were found.',
      };
    }

    let sent = 0;
    for (const recipient of recipients) {
      try {
        await this.emailService.sendOverduePaymentReminderEmail({
          to: recipient.email,
          fullName: recipient.fullName,
          companyName: tenant.name,
          totalDueLkr: payment.totalDue ?? 0,
          renewalDate: new Date(payment.renewalDate).toLocaleDateString('en-GB'),
          loginUrl: this.loginUrl(),
          supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `Overdue reminder could not be sent to ${recipient.email}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return {
      tenantId: tenant.id,
      companyName: tenant.name,
      recipients: sent,
      recipientEmails: recipients.map((recipient) => recipient.email),
      totalDue: payment.totalDue,
    };
  }

  async sendTenantMessage(tenantId: number, dto: { subject: string; message: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingSettings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const settings = this.mapBillingSettings(tenant.id, tenant.billingSettings);
    const recipients = await this.resolveBillingRecipients(tenant.id, settings.recipientEmails);

    if (recipients.length === 0) {
      return {
        tenantId: tenant.id,
        companyName: tenant.name,
        recipients: 0,
        message: 'No billing contacts or company admin recipients were found.',
      };
    }

    let sent = 0;
    for (const recipient of recipients) {
      try {
        await this.emailService.sendTenantMessageEmail({
          to: recipient.email,
          fullName: recipient.fullName,
          companyName: tenant.name,
          subject: dto.subject,
          message: dto.message,
          loginUrl: this.loginUrl(),
          supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `Tenant message could not be sent to ${recipient.email}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return {
      tenantId: tenant.id,
      companyName: tenant.name,
      recipients: sent,
      recipientEmails: recipients.map((recipient) => recipient.email),
    };
  }

  async sendOverdueReminders() {
    const overdueTenants = await this.prisma.tenant.findMany({
      where: { status: 'SUSPENDED' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    let tenantsReminded = 0;
    let totalRecipients = 0;

    for (const tenant of overdueTenants) {
      const result = await this.sendOverdueReminder(tenant.id);
      if ((result.recipients ?? 0) > 0) {
        tenantsReminded += 1;
      }
      totalRecipients += result.recipients ?? 0;
    }

    return {
      overdueTenants: overdueTenants.length,
      tenantsReminded,
      totalRecipients,
    };
  }

  async getBillingSettings(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingSettings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return this.mapBillingSettings(tenantId, tenant.billingSettings);
  }

  async upsertBillingSettings(tenantId: number, dto: UpdateBillingSettingsDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const reminderDays = this.normalizeReminderDays(dto.reminderDays);
    const recipientEmails = this.normalizeRecipientEmails(dto.recipientEmails);

    const saved = await this.prisma.tenantBillingSettings.upsert({
      where: { tenantId },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(reminderDays ? { reminderDaysCsv: reminderDays.join(',') } : {}),
        ...(recipientEmails ? { recipientEmailsCsv: recipientEmails.join(',') } : {}),
        ...(dto.subjectTemplate !== undefined ? { subjectTemplate: dto.subjectTemplate || null } : {}),
        ...(dto.bodyTemplate !== undefined ? { bodyTemplate: dto.bodyTemplate || null } : {}),
      },
      create: {
        tenantId,
        enabled: dto.enabled ?? true,
        reminderDaysCsv: (reminderDays ?? this.defaultReminderDays).join(','),
        recipientEmailsCsv: (recipientEmails ?? []).join(',') || null,
        subjectTemplate: dto.subjectTemplate || null,
        bodyTemplate: dto.bodyTemplate || null,
      },
    });

    return this.mapBillingSettings(tenantId, saved);
  }

  async sendScheduledBillingReminders(referenceDate = new Date()) {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        billingSettings: true,
        _count: {
          select: {
            employees: true,
          },
        },
      },
    });

    let tenantCount = 0;
    let emailCount = 0;
    const billingConfig = await this.tenantConfigurationService.getPlatformBillingConfig();

    for (const tenant of tenants) {
      const payment = this.toPaymentOverviewRow(tenant, billingConfig);
      const settings = this.mapBillingSettings(tenant.id, tenant.billingSettings);
      if (!settings.enabled) {
        continue;
      }

      const daysLeft = this.daysUntilUtcDate(referenceDate, payment.renewalDate);
      if (!settings.reminderDays.includes(daysLeft)) {
        continue;
      }

      const reminderType = daysLeft > 0 ? 'PRE_DUE' : daysLeft === 0 ? 'DUE_TODAY' : 'OVERDUE';
      const reminderKey = `${referenceDate.toISOString().slice(0, 10)}:${daysLeft}`;

      const alreadySent = await this.prisma.billingReminderDispatch.findUnique({
        where: {
          tenantId_reminderKey: {
            tenantId: tenant.id,
            reminderKey,
          },
        },
        select: { id: true },
      });

      if (alreadySent) {
        continue;
      }

      const recipients = await this.resolveBillingRecipients(tenant.id, settings.recipientEmails);
      if (recipients.length === 0) {
        continue;
      }

      let sent = 0;
      for (const recipient of recipients) {
        try {
          await this.emailService.sendBillingReminderEmail({
            to: recipient.email,
            fullName: recipient.fullName,
            companyName: payment.companyName,
            totalDueLkr: payment.totalDue ?? 0,
            renewalDate: new Date(payment.renewalDate).toLocaleDateString('en-GB'),
            loginUrl: this.loginUrl(),
            daysLeft,
            subjectTemplate: settings.subjectTemplate || undefined,
            bodyTemplate: settings.bodyTemplate || undefined,
            supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
          });
          sent += 1;
        } catch (error) {
          this.logger.warn(
            `Scheduled billing reminder failed for ${recipient.email}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }

      await this.prisma.billingReminderDispatch.create({
        data: {
          tenantId: tenant.id,
          reminderType,
          reminderKey,
          recipientCount: sent,
        },
      });

      if (sent > 0) {
        tenantCount += 1;
        emailCount += sent;
      }
    }

    return {
      tenantsProcessed: tenants.length,
      tenantsReminded: tenantCount,
      emailsSent: emailCount,
      runDate: referenceDate.toISOString(),
    };
  }

  private mapBillingSettings(
    tenantId: number,
    settings: {
      enabled: boolean;
      reminderDaysCsv: string;
      recipientEmailsCsv: string | null;
      subjectTemplate: string | null;
      bodyTemplate: string | null;
    } | null,
  ) {
    const reminderDays = this.parseReminderDaysCsv(settings?.reminderDaysCsv ?? '');

    return {
      tenantId,
      enabled: settings?.enabled ?? true,
      reminderDays: reminderDays.length > 0 ? reminderDays : this.defaultReminderDays,
      recipientEmails: this.parseRecipientEmailsCsv(settings?.recipientEmailsCsv ?? ''),
      subjectTemplate: settings?.subjectTemplate ?? '',
      bodyTemplate: settings?.bodyTemplate ?? '',
    };
  }

  private normalizeReminderDays(days?: number[]) {
    if (!days) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(
        days
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= -30 && value <= 30),
      ),
    ).sort((a, b) => b - a);

    if (normalized.length === 0) {
      throw new BadRequestException('reminderDays must include at least one integer between -30 and 30.');
    }

    return normalized;
  }

  private parseReminderDaysCsv(csv: string): number[] {
    if (!csv.trim()) {
      return [];
    }

    return Array.from(
      new Set(
        csv
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value) && value >= -30 && value <= 30),
      ),
    ).sort((a, b) => b - a);
  }

  private normalizeRecipientEmails(emails?: string[]) {
    if (!emails) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(
        emails
          .map((value) => value.trim().toLowerCase())
          .filter((value) => !!value),
      ),
    );

    return normalized;
  }

  private parseRecipientEmailsCsv(csv: string): string[] {
    if (!csv.trim()) {
      return [];
    }

    return Array.from(
      new Set(
        csv
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter((value) => !!value),
      ),
    );
  }

  private daysUntilUtcDate(from: Date, to: Date): number {
    const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const target = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.floor((target - start) / (24 * 60 * 60 * 1000));
  }

  private async resolveBillingRecipients(tenantId: number, customEmails: string[]) {
    const billingContacts = new Map<string, string>();
    for (const email of customEmails) {
      const trimmed = email.trim();
      if (!trimmed) {
        continue;
      }
      billingContacts.set(trimmed.toLowerCase(), trimmed);
    }

    if (billingContacts.size > 0) {
      return Array.from(billingContacts.values()).map((email) => ({
        email,
        fullName: 'Billing Contact',
      }));
    }

    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: { not: 'INACTIVE' },
        roles: {
          some: {
            role: {
              name: 'COMPANY_ADMIN',
            },
          },
        },
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    return admins.map((admin) => ({
      email: admin.email,
      fullName: `${admin.firstName} ${admin.lastName}`.trim() || 'Company Admin',
    }));
  }

  private normalizePlan(plan: string): 'FREEMIUM' | 'STARTER' | 'GROWTH' | 'ENTERPRISE' {
    const normalized = plan.trim().toUpperCase();

    switch (normalized) {
      case 'FREE':
      case 'FREEMIUM':
        return 'FREEMIUM';
      case 'BASIC':
      case 'STANDARD':
      case 'STARTER':
        return 'STARTER';
      case 'PRO':
      case 'GROWTH':
        return 'GROWTH';
      case 'ENTERPRISE':
        return 'ENTERPRISE';
      default:
        return 'STARTER';
    }
  }

  private planLabel(plan: 'FREEMIUM' | 'STARTER' | 'GROWTH' | 'ENTERPRISE'): string {
    switch (plan) {
      case 'FREEMIUM':
        return 'Freemium';
      case 'STARTER':
        return 'Starter';
      case 'GROWTH':
        return 'Growth';
      case 'ENTERPRISE':
        return 'Enterprise';
    }
  }

  private nextRenewalDate(createdAt: Date): Date {
    const next = new Date(createdAt);
    next.setMonth(next.getMonth() + 1);
    while (next.getTime() <= Date.now()) {
      next.setMonth(next.getMonth() + 1);
    }

    return next;
  }

  private toPaymentOverviewRow(
    tenant: {
      id: number;
      name: string;
      companyCode: string | null;
      plan: string;
      status: 'ACTIVE' | 'SUSPENDED';
      seats: number;
      createdAt: Date;
      _count: { employees: number };
    },
    billingConfig?: Awaited<ReturnType<TenantConfigurationService['getPlatformBillingConfig']>>,
  ) {
    const normalizedPlan = this.normalizePlan(tenant.plan);
    const billing = this.tenantConfigurationService.computeTenantBilling({
      plan: tenant.plan,
      seats: tenant.seats,
      activeEmployees: tenant._count.employees,
      billingConfig,
    });

    return {
      tenantId: tenant.id,
      companyName: tenant.name,
      companyCode: tenant.companyCode,
      plan: this.planLabel(normalizedPlan),
      planKey: normalizedPlan,
      status: tenant.status,
      billingStatus:
        tenant.status === 'SUSPENDED'
          ? 'OVERDUE'
          : billing.overageSeats > 0
            ? 'ACTION_REQUIRED'
            : 'CURRENT',
      includedSeats: billing.includedSeats,
      activeEmployees: billing.activeEmployees,
      overageSeats: billing.overageSeats,
      monthlyPlanPrice: billing.monthlyPlanPrice,
      overageSeatPrice: billing.overageSeatPrice,
      isCustomPricing: billing.isCustomPricing,
      seatPrice: billing.overageSeatPrice,
      currency: 'LKR',
      subtotal: billing.subtotal,
      tax: billing.tax,
      totalDue: billing.isCustomPricing && billing.overageSeats === 0 ? null : billing.totalDue,
      renewalDate: this.nextRenewalDate(tenant.createdAt),
      createdAt: tenant.createdAt,
    };
  }

  findOne(id: number) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async create(dto: CreateTenantDto) {
    const companyCode = await this.resolveCompanyCode(dto.companyCode, dto.name);

    return this.prisma.tenant.create({
      data: {
        ...dto,
        companyCode,
      },
    });
  }

  async createCompanyWithAdminInvite(dto: CreateCompanyWithAdminDto) {
    const normalizedEmail = dto.adminEmail.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('A user with this admin email address already exists.');
    }

    const [firstName, ...lastNameParts] = dto.adminName.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Admin';
    const pendingPasswordHash = await bcrypt.hash(randomBytes(12).toString('hex'), 10);

    const companyAdminRole = await this.prisma.role.findFirst({
      where: {
        name: 'COMPANY_ADMIN',
        tenantId: null,
      },
      select: { id: true },
    });

    if (!companyAdminRole) {
      throw new Error('COMPANY_ADMIN role is not configured.');
    }

    const companyCode = await this.resolveCompanyCode(dto.companyCode, dto.companyName);
    const normalizedPlan = normalizePlan(dto.subscriptionPlan);
    const enabledModules = dto.enabledModules?.length
      ? dto.enabledModules.map((key) => key.trim().toLowerCase())
      : modulesForPlan(normalizedPlan);
    const moduleFeatures = this.tenantConfigurationService.buildDefaultModuleFeatures(
      enabledModules,
      dto.moduleFeatures,
    );
    const leadDetails = (dto.config as Record<string, unknown> | undefined)?.['leadDetails'];
    const tenantConfig: Record<string, unknown> = {
      locale: dto.config?.locale ?? DEFAULT_TENANT_CONFIG.locale,
      currency: dto.config?.currency ?? DEFAULT_TENANT_CONFIG.currency,
      fiscalYearStartMonth:
        dto.config?.fiscalYearStartMonth ?? DEFAULT_TENANT_CONFIG.fiscalYearStartMonth,
      payslipTemplateKey:
        (dto.config as Record<string, unknown> | undefined)?.['payslipTemplateKey'] ??
        DEFAULT_TENANT_CONFIG.payslipTemplateKey ??
        DEFAULT_PAYSLIP_TEMPLATE_KEY,
      leaveSetup:
        (dto.config as Record<string, unknown> | undefined)?.['leaveSetup'] ??
        DEFAULT_TENANT_CONFIG.leaveSetup,
    };
    const normalizedProfile = normalizeCompanyProfile(dto.companyProfile);
    if (normalizedProfile) {
      tenantConfig.companyProfile = normalizedProfile;
    }
    if (leadDetails) {
      tenantConfig.leadDetails = leadDetails;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          companyCode,
          plan: normalizedPlan,
          status: 'SUSPENDED',
          leadStatus: 'PENDING',
          seats: resolveSeatsForPlan(normalizedPlan, dto.seats),
          config: tenantConfig as Prisma.InputJsonValue,
        },
      });

      await this.tenantConfigurationService.persistModuleSettings(tx, tenant.id, enabledModules);
      await this.tenantConfigurationService.persistFieldSettings(
        tx,
        tenant.id,
        moduleFeatures,
        enabledModules,
      );

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: pendingPasswordHash,
          firstName: firstName || 'Company',
          lastName,
          status: 'PENDING',
          tenantId: tenant.id,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: companyAdminRole.id,
        },
      });

      await this.ensureBusinessModuleAccess(tx, tenant.id, user.id, enabledModules);
      await this.ensureCompanyAdminEmployeeProfile(tx, tenant.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      const recipientEmails = this.normalizeRecipientEmails(dto.billingContactEmails) ?? [];
      await tx.tenantBillingSettings.create({
        data: {
          tenantId: tenant.id,
          reminderDaysCsv: (this.normalizeReminderDays(dto.billingReminderDays) ?? this.defaultReminderDays).join(','),
          recipientEmailsCsv: recipientEmails.join(',') || null,
        },
      });

      return { tenant, user };
    });

    if (enabledModules.includes('leave')) {
      await this.leaveService.seedPoliciesForTenant(
        result.tenant.id,
        tenantConfig.leaveSetup as LeaveSetupConfig,
        { onlyIfEmpty: true },
      );
    }

    const setupToken = await this.createPasswordSetupToken(result.user.id);

    await this.emailService.sendOnboardingEmail({
      to: result.user.email,
      fullName: `${result.user.firstName} ${result.user.lastName}`.trim(),
      companyName: result.tenant.name,
      activationUrl: this.onboardingUrl(setupToken.token),
      loginUrl: this.loginUrl(),
    });

    return {
      tenant: result.tenant,
      adminUser: {
        id: result.user.id,
        email: result.user.email,
        status: result.user.status,
      },
      onboardingUrl: this.onboardingUrl(setupToken.token),
      requiresApproval: true,
    };
  }

  async approve(id: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          leadStatus: 'CONVERTED',
        },
      });

      const adminUsers = await tx.user.findMany({
        where: {
          tenantId: id,
          roles: {
            some: {
              role: {
                name: 'COMPANY_ADMIN',
              },
            },
          },
        },
        select: {
          id: true,
          email: true,
          status: true,
          firstName: true,
          lastName: true,
        },
      });

      if (adminUsers.length > 0) {
        const adminActivationRecipients: Array<{ email: string; fullName: string }> = [];

        await tx.user.updateMany({
          where: {
            id: { in: adminUsers.map((user) => user.id) },
            status: { not: 'INACTIVE' },
          },
          data: {
            status: 'ACTIVE',
          },
        });

        for (const admin of adminUsers) {
          await this.ensureBusinessModuleAccess(tx, id, admin.id);
          await this.ensureCompanyAdminEmployeeProfile(tx, id, {
            id: admin.id,
            firstName: admin.firstName,
            lastName: admin.lastName,
          });

          adminActivationRecipients.push({
            email: admin.email,
            fullName: `${admin.firstName} ${admin.lastName}`.trim(),
          });
        }

        return { tenant, adminActivationRecipients, adminUsers };
      }

      return {
        tenant,
        adminActivationRecipients: [] as Array<{ email: string; fullName: string }>,
        adminUsers,
        approvedAdmins: adminUsers.map((admin) => ({
          id: admin.id,
          email: admin.email,
        })),
      };
    });

    for (const admin of result.adminActivationRecipients) {
      try {
        await this.emailService.sendAccountActivationEmail({
          to: admin.email,
          fullName: admin.fullName,
          companyName: result.tenant.name,
          loginUrl: this.loginUrl(),
          supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
        });
      } catch (error) {
        this.logger.warn(
          `Activation email could not be sent to ${admin.email}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const leaveModule = await this.prisma.tenantModuleSetting.findUnique({
      where: { tenantId_moduleKey: { tenantId: id, moduleKey: 'leave' } },
      select: { enabled: true },
    });

    if (leaveModule?.enabled) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        select: { config: true },
      });
      const config = (tenant?.config ?? {}) as Record<string, unknown>;
      await this.leaveService.seedPoliciesForTenant(
        id,
        config.leaveSetup as LeaveSetupConfig,
        { onlyIfEmpty: true },
      );
    }

    return {
      tenant: result.tenant,
      approvedAdmins: result.adminUsers.map((admin) => ({
        id: admin.id,
        email: admin.email,
      })),
    };
  }

  async update(id: number, dto: UpdateTenantDto) {
    const { companyProfile, ...tenantFields } = dto;
    let companyCode = tenantFields.companyCode;

    if (tenantFields.companyCode || tenantFields.name) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        select: { name: true },
      });

      if (!tenant) {
        throw new BadRequestException('Tenant not found.');
      }

      companyCode = await this.resolveCompanyCode(tenantFields.companyCode, tenantFields.name ?? tenant.name, id);
    }

    const data: Prisma.TenantUpdateInput = { ...tenantFields };
    if (companyCode) {
      data.companyCode = companyCode;
    }

    if (tenantFields.plan && tenantFields.seats === undefined) {
      data.seats = resolveSeatsForPlan(tenantFields.plan);
    }

    if (tenantFields.plan) {
      data.plan = normalizePlan(tenantFields.plan);
    }

    if (companyProfile) {
      const existing = await this.prisma.tenant.findUnique({
        where: { id },
        select: { config: true },
      });

      if (!existing) {
        throw new BadRequestException('Tenant not found.');
      }

      const existingConfig =
        existing.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
          ? (existing.config as Record<string, unknown>)
          : {};

      data.config = {
        ...existingConfig,
        companyProfile: {
          ...(readCompanyProfile(existing.config) ?? {}),
          ...(normalizeCompanyProfile(companyProfile) ?? {}),
        },
      } as Prisma.InputJsonValue;
    }

    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }

  remove(id: number) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        leadStatus: 'DELETED',
      },
    });
  }

  async deactivateForPayment(id: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, status: true, leadStatus: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found.');
    }

    if (tenant.status === 'SUSPENDED') {
      throw new BadRequestException('Tenant is already suspended.');
    }

    if (tenant.leadStatus === 'PENDING') {
      throw new BadRequestException('Approve the tenant before suspending for payment.');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        leadStatus: 'CONVERTED',
      },
    });
  }

  async reactivate(id: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found.');
    }

    if (tenant.status === 'ACTIVE') {
      throw new BadRequestException('Tenant is already active.');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        leadStatus: 'CONVERTED',
      },
    });
  }
}
