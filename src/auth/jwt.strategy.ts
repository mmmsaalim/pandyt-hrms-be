import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub: number;
  email: string;
  roles: string[];
  tenantId?: number | null;
  tenantCode?: string | null;
};

const cookieExtractor = (req: { headers?: { cookie?: string; authorization?: string } }): string | null => {
  const cookieHeader = req?.headers?.cookie;
  if (cookieHeader) {
    const tokenCookie = cookieHeader
      .split(';')
      .map((x) => x.trim())
      .find((entry) => entry.startsWith('flowhr_access_token='));

    if (tokenCookie) {
      return decodeURIComponent(tokenCookie.split('=').slice(1).join('='));
    }
  }

  const authHeader = req?.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      passReqToCallback: true,
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  validate(
    req: { headers?: { 'x-tenant-id'?: string } },
    payload: JwtPayload,
  ) {
    const roles = payload.roles ?? [];
    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    if (!isSuperAdmin) {
      const tenantHeader = req?.headers?.['x-tenant-id']?.trim();
      const expected = payload.tenantId ? String(payload.tenantId) : null;

      if (!tenantHeader || !expected || tenantHeader !== expected) {
        throw new UnauthorizedException('Tenant header mismatch for this token.');
      }
    }

    return payload;
  }
}
