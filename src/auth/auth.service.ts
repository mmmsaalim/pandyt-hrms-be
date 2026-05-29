import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizeCompanyCode(code: string): string {
    return code.trim().toLowerCase();
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        tenant: {
          select: { name: true, status: true, companyCode: true },
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
      throw new UnauthorizedException('Tenant is not approved yet. Please contact your super admin.');
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

          // Super admin keeps full platform permissions.
          if (role.name === 'SUPER_ADMIN') {
            return role.rolePermissions.map((rp) => rp.permission.permission);
          }

          // Company admin keeps only configuration access from the shared base role.
          // Business modules are controlled by tenant module roles (EMPLOYEES, LEAVE, etc.).
          if (role.name === 'COMPANY_ADMIN' && role.tenantId === null) {
            return role.rolePermissions
              .map((rp) => rp.permission.permission)
              .filter((permission) => permission === 'configuration.manage');
          }

          // Shared employee base role should not auto-grant business module access.
          if (role.name === 'EMPLOYEE' && role.tenantId === null) {
            return [];
          }

          // Tenant roles are module roles and should grant their mapped permissions.
          return role.rolePermissions.map((rp) => rp.permission.permission);
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
}
