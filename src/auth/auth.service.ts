import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly tenantsService: TenantsService,
  ) {}

  private normalizeCompanyCode(code: string): string {
    return code.trim().toLowerCase();
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resetExpiryHours(): number {
    return Number(this.config.get<string>('PASSWORD_RESET_EXPIRY_HOURS', '24'));
  }

  private appUrl(): string {
    return this.config.get<string>('APP_URL', 'http://localhost:4200');
  }

  private resetUrl(token: string): string {
    return `${this.appUrl()}/reset-password?token=${token}`;
  }

  private async createPasswordResetToken(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.resetExpiryHours() * 60 * 60 * 1000);
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.tokenHash(token);

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId,
        usedAt: null,
      },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        tenant: {
          select: { name: true, status: true, companyCode: true, leadStatus: true },
        },
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is pending activation. Please contact your super admin.');
    }

    if (user.tenantId && user.tenant && user.tenant.status !== 'ACTIVE') {
      if (user.tenant.leadStatus === 'PENDING') {
        throw new UnauthorizedException('Your workspace is pending super admin approval. Please wait for activation.');
      }

      throw new UnauthorizedException(
        'Your workspace is temporarily suspended due to payment status. Please contact support or your super admin.',
      );
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const roles = (
      user.roles as Array<{
        role: {
          name: string;
          rolePermissions: Array<{ permission: { permission: string } }>;
        };
      }>
    ).map((r) => r.role.name);

    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    if (!isSuperAdmin) {
      if (!dto.companyCode?.trim()) {
        throw new UnauthorizedException('companyCode is required for tenant login.');
      }

      if (!user.tenantId || !user.tenant) {
        throw new UnauthorizedException('Invalid tenant context for this user.');
      }

      if (!user.tenant.companyCode?.trim()) {
        throw new UnauthorizedException('Tenant company code is not configured.');
      }

      const expectedCode = this.normalizeCompanyCode(user.tenant.companyCode);
      const providedCode = this.normalizeCompanyCode(dto.companyCode);

      if (providedCode !== expectedCode) {
        throw new UnauthorizedException('Tenant login context mismatch.');
      }
    }

    const tenantCode = user.tenant?.companyCode ?? null;

    const permissions = Array.from(
      new Set(
        (
          user.roles as Array<{
            role: {
              name: string;
              tenantId: number | null;
              rolePermissions: Array<{ permission: { permission: string } }>;
            };
          }>
        ).flatMap((entry) => {
          const role = entry.role;
          const permissionKeys = role.rolePermissions.map((rp) => rp.permission.permission);

          // Super admin keeps full platform permissions.
          if (role.name === 'SUPER_ADMIN') {
            return permissionKeys;
          }

          // Company admin owns tenant configuration and full operational access.
          if (role.name === 'COMPANY_ADMIN' && role.tenantId === null) {
            return permissionKeys;
          }

          // HR manager must not manage tenant roles or module configuration.
          if (role.name === 'HR_MANAGER' && role.tenantId === null) {
            return permissionKeys.filter((permission) => permission !== 'configuration.manage');
          }

          // Shared employee base role should not auto-grant business module access.
          if (role.name === 'EMPLOYEE' && role.tenantId === null) {
            return [];
          }

          // Tenant module roles grant permissions; configuration is company-admin only.
          if (role.tenantId !== null && role.name === 'CONFIGURATION') {
            return roles.includes('COMPANY_ADMIN') ? permissionKeys : [];
          }

          return permissionKeys;
        }),
      ),
    );
    const payload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      tenantId: user.tenantId ?? null,
      tenantCode,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name ?? null,
        tenantCode,
        roles,
        permissions,
      },
    };
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        tenant: { select: { name: true } },
      },
    });

    if (!user) {
      return { message: 'If the email exists, a reset link has been sent.' };
    }

    const { token } = await this.createPasswordResetToken(user.id);
    const resetUrl = this.resetUrl(token);

    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      resetUrl,
      expiresHours: this.resetExpiryHours(),
    });

    return { message: 'If the email exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hashedToken = this.tokenHash(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: { include: { tenant: true } } },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Reset link is invalid or expired.');
    }

    if (resetToken.usedAt) {
      throw new UnauthorizedException('Reset link has already been used.');
    }

    if (resetToken.expiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      throw new UnauthorizedException('Reset link is invalid or expired.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const previousStatus = resetToken.user.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          status: 'ACTIVE',
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
    });

    if (previousStatus === 'PENDING') {
      try {
        await this.emailService.sendAccountActivationEmail({
          to: resetToken.user.email,
          fullName: `${resetToken.user.firstName} ${resetToken.user.lastName}`.trim(),
          companyName: resetToken.user.tenant?.name ?? 'FlowHR',
          loginUrl: `${this.appUrl()}/login`,
          supportEmail: this.config.get<string>('MAIL_SUPPORT_EMAIL') ?? undefined,
        });
      } catch (error) {
        this.logger.warn(
          `Activation email could not be sent for ${resetToken.user.email}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return { message: 'Password updated successfully.' };
  }

  async signup(dto: SignupDto) {
    const result = await this.tenantsService.createCompanyWithAdminInvite({
      companyName: dto.companyName,
      companyCode: dto.companyCode,
      adminName: dto.adminName,
      adminEmail: dto.adminEmail,
      subscriptionPlan: 'FREEMIUM',
      seats: 25,
    });

    return {
      message:
        'Signup submitted successfully. Your workspace is queued for lead review and super admin approval.',
      companyCode: result.tenant.companyCode,
      requiresApproval: true,
    };
  }
}
