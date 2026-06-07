import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantLeadStatusEnum } from './dto/create-tenant.dto';
import { CreateCompanyWithAdminDto } from './dto/create-company-with-admin.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
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

    await tx.employee.upsert({
      where: { userId: user.id },
      update: {
        tenantId,
        employeeCode,
        department: 'Administration',
        designation: 'Company Admin',
        employmentStatus: 'ACTIVE',
      },
      create: {
        tenantId,
        userId: user.id,
        employeeCode,
        department: 'Administration',
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
  ) {
    const permissions = await tx.permission.findMany({
      where: {
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

  async findAll() {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
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
    });

    return rows.map((row) => ({
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
    }));
  }

  async findLeads(status?: TenantLeadStatusEnum) {
    const rows = await this.prisma.tenant.findMany({
      where: status ? { leadStatus: status } : undefined,
      orderBy: { createdAt: 'desc' },
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
    });

    return rows.map((row) => {
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
        latestAdminInvitation,
        pendingAdminInvitations,
      };
    });
  }

  async paymentsOverview() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            employees: true,
          },
        },
      },
    });

    return tenants.map((tenant) => {
      const normalizedPlan = tenant.plan.trim().toUpperCase();
      const planSeatPrice = this.planSeatPrice(normalizedPlan);
      const activeEmployees = tenant._count.employees;
      const includedSeats = tenant.seats;
      const overageSeats = Math.max(activeEmployees - includedSeats, 0);
      const baseAmount = includedSeats * planSeatPrice;
      const overageAmount = overageSeats * Math.round(planSeatPrice * 1.25);
      const subtotal = baseAmount + overageAmount;
      const tax = Number((subtotal * 0.1).toFixed(2));
      const totalDue = Number((subtotal + tax).toFixed(2));

      return {
        tenantId: tenant.id,
        companyName: tenant.name,
        companyCode: tenant.companyCode,
        plan: normalizedPlan,
        status: tenant.status,
        billingStatus:
          tenant.status === 'SUSPENDED'
            ? 'OVERDUE'
            : overageSeats > 0
              ? 'ACTION_REQUIRED'
              : 'CURRENT',
        includedSeats,
        activeEmployees,
        overageSeats,
        seatPrice: planSeatPrice,
        currency: 'USD',
        subtotal,
        tax,
        totalDue,
        renewalDate: this.nextRenewalDate(tenant.createdAt),
        createdAt: tenant.createdAt,
      };
    });
  }

  private planSeatPrice(plan: string): number {
    switch (plan) {
      case 'BASIC':
        return 15;
      case 'STANDARD':
        return 24;
      case 'PRO':
        return 32;
      case 'ENTERPRISE':
        return 45;
      default:
        return 20;
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

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          companyCode,
          plan: dto.subscriptionPlan,
          status: 'SUSPENDED',
          leadStatus: 'PENDING',
          seats: dto.seats ?? 25,
        },
      });

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

      await this.ensureBusinessModuleAccess(tx, tenant.id, user.id);
      await this.ensureCompanyAdminEmployeeProfile(tx, tenant.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      return { tenant, user };
    });

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

    return {
      tenant: result.tenant,
      approvedAdmins: result.adminUsers.map((admin) => ({
        id: admin.id,
        email: admin.email,
      })),
    };
  }

  async update(id: number, dto: UpdateTenantDto) {
    let companyCode = dto.companyCode;

    if (dto.companyCode || dto.name) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        select: { name: true },
      });

      if (!tenant) {
        throw new BadRequestException('Tenant not found.');
      }

      companyCode = await this.resolveCompanyCode(dto.companyCode, dto.name ?? tenant.name, id);
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...dto,
        ...(companyCode ? { companyCode } : {}),
      },
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
}
