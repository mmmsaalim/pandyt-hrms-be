import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

type CreateInvitationInput = {
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  fullName: string;
  companyName: string;
};

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private expiryHours(): number {
    return Number(this.config.get<string>('INVITATION_EXPIRY_HOURS', '24'));
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private acceptUrl(token: string): string {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
    return `${appUrl}/accept-invitation?token=${token}`;
  }

  async createAndSendInvitation(input: CreateInvitationInput) {
    const expiresHours = this.expiryHours();
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.tokenHash(rawToken);

    await this.prisma.invitation.updateMany({
      where: { userId: input.userId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });

    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        email: input.email,
        role: input.role,
        tokenHash: hashedToken,
        expiresAt,
      },
    });

    await this.emailService.sendInvitationEmail({
      to: input.email,
      fullName: input.fullName,
      companyName: input.companyName,
      role: input.role,
      acceptUrl: this.acceptUrl(rawToken),
      expiresHours,
    });

    return {
      invitationId: invitation.id,
      invitedAt: invitation.invitedAt,
      expiresAt: invitation.expiresAt,
      acceptUrl: this.acceptUrl(rawToken),
    };
  }

  async resolveByToken(token: string) {
    const hashedToken = this.tokenHash(token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashedToken },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    const expired = invitation.expiresAt.getTime() < Date.now();
    if (invitation.status === 'PENDING' && expired) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
    }

    return {
      email: invitation.email,
      role: invitation.role,
      status: expired ? 'EXPIRED' : invitation.status,
      invitedAt: invitation.invitedAt,
      expiresAt: invitation.expiresAt,
      company: invitation.tenant,
      name: `${invitation.user.firstName} ${invitation.user.lastName}`.trim(),
    };
  }

  async acceptInvitation(token: string, password: string) {
    const hashedToken = this.tokenHash(token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation has already been used or revoked.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          status: 'ACTIVE',
          tenantId: invitation.tenantId,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      }),
    ]);

    return { message: 'Account activated successfully. Please log in.' };
  }

  async listInvitations(requestingUser: {
    sub: string;
    roles?: string[];
    tenantId?: string;
  }) {
    const isSuper = requestingUser.roles?.includes('SUPER_ADMIN');

    const where = isSuper
      ? {}
      : { tenantId: requestingUser.tenantId ?? '__none__' };

    const rows = await this.prisma.invitation.findMany({
      where,
      orderBy: { invitedAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      invitedAt: r.invitedAt,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      company: r.tenant ? { id: r.tenant.id, name: r.tenant.name } : null,
      name: `${r.user.firstName} ${r.user.lastName}`.trim(),
    }));
  }

  async resendInvitation(
    email: string,
    requestingUser: { sub: string; roles?: string[]; tenantId?: string },
  ) {
    const isSuper = requestingUser.roles?.includes('SUPER_ADMIN');
    const tenantFilter = isSuper ? {} : { tenantId: requestingUser.tenantId ?? '__none__' };

    const invitation = await this.prisma.invitation.findFirst({
      where: { email, status: 'PENDING', ...tenantFilter },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('No pending invitation found for this email.');
    }

    const expiresHours = this.expiryHours();
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.tokenHash(rawToken);

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hashedToken, expiresAt },
    });

    const fullName = `${invitation.user.firstName} ${invitation.user.lastName}`.trim();
    await this.emailService.sendInvitationEmail({
      to: invitation.email,
      fullName,
      companyName: invitation.tenant?.name ?? 'FlowHR',
      role: invitation.role,
      acceptUrl: this.acceptUrl(rawToken),
      expiresHours,
    });

    return {
      message: 'Invitation resent successfully.',
      expiresAt,
    };
  }
}