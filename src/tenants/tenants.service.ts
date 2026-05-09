import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateCompanyWithAdminDto } from './dto/create-company-with-admin.dto';
import { InvitationsService } from '../invitations/invitations.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
  ) {}

  findAll() {
    return this.prisma.tenant.findMany();
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

  findOne(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: dto });
  }

  async createCompanyWithAdminInvite(dto: CreateCompanyWithAdminDto) {
    const [firstName, ...lastNameParts] = dto.adminName.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Admin';
    const pendingPassword = randomBytes(48).toString('hex');
    const pendingPasswordHash = await bcrypt.hash(pendingPassword, 10);

    const companyAdminRole = await this.prisma.role.findUnique({
      where: { name: 'COMPANY_ADMIN' },
      select: { id: true },
    });

    if (!companyAdminRole) {
      throw new Error('COMPANY_ADMIN role is not configured.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          plan: dto.subscriptionPlan,
          status: 'ACTIVE',
          seats: dto.seats ?? 25,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.adminEmail,
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

      return { tenant, user };
    });

    const invitation = await this.invitationsService.createAndSendInvitation({
      tenantId: result.tenant.id,
      userId: result.user.id,
      email: result.user.email,
      role: 'COMPANY_ADMIN',
      fullName: dto.adminName,
      companyName: result.tenant.name,
    });

    return {
      tenant: result.tenant,
      adminUser: {
        id: result.user.id,
        email: result.user.email,
        status: result.user.status,
      },
      invitation,
    };
  }

  update(id: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.tenant.delete({ where: { id } });
  }
}
