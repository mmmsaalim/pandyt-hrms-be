import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_JOB_ROLE_PERMISSIONS,
  JOB_ROLE_NAMES,
  JobRoleName,
  isJobGovernedPermission,
} from './rbac.constants';

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

        // Fetch this module's access-tier permissions from the platform catalog.
        // Job-governed actions (e.g. leave.manage) are excluded here — they are
        // granted only via tenant job roles so they stay per-role configurable.
        const modulePermissions = (
          await tx.permission.findMany({
            where: { module: moduleKey },
          })
        ).filter((permission) => !isJobGovernedPermission(permission.permission));

        if (modulePermissions.length === 0) {
          this.logger.warn(`No access-tier permissions found for module ${moduleKey}`);
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
   * Ensure the tenant has its own editable job roles (HR_MANAGER, TEAM_LEAD,
   * EMPLOYEE). These carry the action permissions (e.g. leave.manage) and are
   * configured per tenant in Access Configuration.
   *
   * Default permissions are seeded ONLY when a role is first created, so a
   * Company Admin's later edits are never overwritten by a re-sync/invite.
   *
   * @returns map of job role name → tenant-scoped role id
   */
  async syncJobRoles(tenantId: number): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    await this.prisma.$transaction(async (tx) => {
      for (const roleName of JOB_ROLE_NAMES) {
        const existing = await tx.role.findFirst({
          where: { tenantId, name: roleName },
          select: { id: true },
        });

        if (existing) {
          result[roleName] = existing.id;
          continue;
        }

        const role = await tx.role.create({
          data: {
            name: roleName,
            tenantId,
            description: `Tenant ${roleName} role — configurable in Access Configuration`,
          },
          select: { id: true },
        });
        result[roleName] = role.id;
        this.logger.log(`Created job role ${roleName} for tenant ${tenantId}`);

        const defaults = DEFAULT_JOB_ROLE_PERMISSIONS[roleName as JobRoleName] ?? [];
        if (defaults.length > 0) {
          const permissions = await tx.permission.findMany({
            where: { permission: { in: defaults } },
            select: { id: true },
          });
          if (permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: permissions.map((permission) => ({
                roleId: role.id,
                permissionId: permission.id,
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    });

    return result;
  }

  /**
   * Get exclusion rules (for testing or documentation)
   */
  getExcludedModules(): string[] {
    return Array.from(this.EXCLUDED_MODULES);
  }
}
