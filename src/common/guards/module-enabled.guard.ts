import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { TenantConfigurationService } from '../../tenant-configuration/tenant-configuration.service';

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantConfigurationService: TenantConfigurationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { sub: number; roles?: string[]; tenantId?: number | null; enabledModules?: string[] }
      | undefined;

    if (!user) {
      throw new ForbiddenException('Unauthorized module access.');
    }

    if (user.roles?.includes('SUPER_ADMIN')) {
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }

    let enabledModules = user.enabledModules;
    if (!enabledModules?.length) {
      enabledModules = await this.tenantConfigurationService.getEnabledModuleKeys(user.tenantId);
    }

    if (!enabledModules.includes(requiredModule)) {
      throw new ForbiddenException(`Module "${requiredModule}" is disabled for this tenant.`);
    }

    return true;
  }
}
