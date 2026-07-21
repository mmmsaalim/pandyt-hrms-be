import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single source of truth for tenant module-role bootstrap.
 * Eliminates 3× duplication (tenants, roles, employees services).
 * Called during: tenant onboarding, role service updates, employee invite.
 */
@Injectable()
export class RoleBootstrapService {
  private readonly logger = new Logger(RoleBootstrapService.name);

  /**
   * Modules excluded from automatic bootstrap (no module role created).
   * configuration: reserved for Super Admin RBAC configuration (not a billable module)
   * tenants: Super Admin only (not available to tenant users)
   */
  private readonly EXCLUDED_MODULES = new Set(['configuration', 'tenants']);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sync tenant module roles with enabled modules.
   * One transaction, one exclusion rule set — single source of truth.
   *
   * @param tenantId - Tenant ID
   * @param enabledModules - List of module keys that are enabled for this tenant
   */
  async syncModuleRoles(tenantId: number, enabledModules: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const moduleKey of enabledModules) {
        // Skip excluded modules (configuration, tenants)
        if (this.EXCLUDED_MODULES.has(moduleKey)) {
          this.logger.debug(`Skipping excluded module: ${moduleKey} for tenant ${tenantId}`);
          continue;
        }

        const roleName = moduleKey.toUpperCase();

        // Find or create module role for this tenant
        let role = await tx.role.findFirst({
          where: {
            tenantId,
            name: roleName,
          },
        });

        if (!role) {
          role = await tx.role.create({
            data: {
              name: roleName,
              tenantId,
              description: `Auto-generated role for ${moduleKey} module`,
            },
          });
          this.logger.log(`Created module role ${roleName} for tenant ${tenantId}`);
        }

        // Fetch all permissions for this module from the platform catalog
        const modulePermissions = await tx.permission.findMany({
          where: { module: moduleKey },
        });

        if (modulePermissions.length === 0) {
          this.logger.warn(`No permissions found for module ${moduleKey}`);
          continue;
        }

        // Get existing role-permission mappings
        const existingMappings = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        });
        const existingPermIds = new Set(existingMappings.map((m) => m.permissionId));

        // Sync: remove stale, add new
        for (const mapping of existingMappings) {
          if (!modulePermissions.some((p) => p.id === mapping.permissionId)) {
            await tx.rolePermission.delete({
              where: {
                roleId_permissionId: {
                  roleId: role.id,
                  permissionId: mapping.permissionId,
                },
              },
            });
          }
        }

        for (const perm of modulePermissions) {
          if (!existingPermIds.has(perm.id)) {
            await tx.rolePermission.create({
              data: {
                roleId: role.id,
                permissionId: perm.id,
              },
            });
          }
        }

        this.logger.debug(`Synced ${modulePermissions.length} permissions for role ${roleName}`);
      }
    });
  }

  /**
   * Get exclusion rules (for testing or documentation)
   */
  getExcludedModules(): string[] {
    return Array.from(this.EXCLUDED_MODULES);
  }
}
