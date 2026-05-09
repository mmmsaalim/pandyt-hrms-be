import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub: string; roles?: string[] } | undefined;

    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    let roleNames = user.roles ?? [];

    if (roleNames.length === 0) {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId: user.sub },
        include: { role: true },
      });

      roleNames = (userRoles as Array<{ role: { name: string } }>).map(
        (x: { role: { name: string } }) => x.role.name,
      );
    }

    const allowed = requiredRoles.some((role) => roleNames.includes(role));

    if (!allowed) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    return true;
  }
}
