import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

type RequestUser = {
  roles?: string[];
  permissions?: string[];
  effectivePermissions?: string[];
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user) {
      throw new ForbiddenException('Unauthorized permission access.');
    }

    if (user.roles?.includes('SUPER_ADMIN')) {
      return true;
    }

    const activePermissions = user.effectivePermissions?.length
      ? user.effectivePermissions
      : user.permissions ?? [];

    const allowed = requiredPermissions.some((permission) => activePermissions.includes(permission));

    if (!allowed) {
      throw new ForbiddenException('Insufficient permission.');
    }

    return true;
  }
}
