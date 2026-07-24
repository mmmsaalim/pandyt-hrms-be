import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateTenantRoleDto } from './dto/create-tenant-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { AssignScopedUserRoleDto } from './dto/assign-scoped-user-role.dto';
import { UnassignScopedUserRoleDto } from './dto/unassign-scoped-user-role.dto';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';
import {
  ALL_BUSINESS_MODULE_KEYS,
  permissionToModule,
} from '../tenant-configuration/tenant-configuration.constants';
import { RoleBootstrapService } from './role-bootstrap.service';
import { isJobGovernedPermission } from './rbac.constants';

type RequestUser = { sub: number; roles?: string[]; tenantId?: number | null } | undefined;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantConfigurationService: TenantConfigurationService,
    private readonly roleBootstrapService: RoleBootstrapService,
  ) {}

  private async resolveActor(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: { roles: { include: { role: true } } },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found.');
    }

    const roleNames = (dbUser.roles as Array<{ role: { name: string } }>).map(
      (x: { role: { name: string } }) => x.role.name,
    );

    return {
      id: dbUser.id,
      tenantId: dbUser.tenantId,
      roles: user.roles?.length ? user.roles : roleNames,
    };
  }

  private ensureSuperAdmin(actor: { roles: string[] }) {
    if (!actor.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only super admin can perform this action.');
    }
  }

  private ensureCompanyAdmin(actor: { roles: string[]; tenantId: number | null }) {
    if (!actor.roles.includes('COMPANY_ADMIN')) {
      throw new ForbiddenException('Only company admin can perform this action.');
    }

    if (!actor.tenantId) {
      throw new ForbiddenException('Company admin tenant scope is missing.');
    }
  }

  findAllRoles() {
    return this.prisma.role.findMany();
  }

  createRole(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  assignRole(dto: AssignUserRoleDto) {
    return this.prisma.userRole.create({ data: dto });
  }

  listUserRoles(userId: number) {
    return this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  async getConfiguration(user: RequestUser) {
    const actor = await this.resolveActor(user);
    const isSuper = actor.roles.includes('SUPER_ADMIN');
    const isCompany = actor.roles.includes('COMPANY_ADMIN');

    if (!isSuper && !isCompany) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    const roleWhere = isSuper
      ? undefined
      : {
          OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
        };

    const [permissions, roles, users] = await Promise.all([
      this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { permission: 'asc' }] }),
      this.prisma.role.findMany({
        where: roleWhere,
        include: {
          rolePermissions: {
            include: { permission: true },
            orderBy: { permission: { permission: 'asc' } },
          },
        },
        orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
      }),
      isCompany
        ? this.prisma.user.findMany({
            where: { tenantId: actor.tenantId ?? undefined },
            include: {
              roles: {
                include: {
                  role: {
                    select: { id: true, name: true, tenantId: true },
                  },
                },
              },
            },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    let filteredPermissions = permissions;
    let filteredRoles = roles;

    if (isCompany && actor.tenantId) {
      const enabledModules = await this.tenantConfigurationService.getEnabledModuleKeys(actor.tenantId);
      const enabledSet = new Set([...enabledModules, 'configuration']);

      filteredPermissions = permissions.filter((permission) =>
        enabledSet.has(permissionToModule(permission.module)),
      );

      const businessModuleKeys = new Set<string>(ALL_BUSINESS_MODULE_KEYS);
      filteredRoles = roles.filter((role) => {
        if (role.tenantId === null) {
          return true;
        }

        const key = role.name.toLowerCase();
        // A module (access) role is named after a module — hide it only when that
        // module is disabled. Job roles (TEAM_LEAD, HR_MANAGER, EMPLOYEE) and custom
        // roles are not module names, so they are always shown/configurable.
        if (businessModuleKeys.has(key)) {
          return enabledSet.has(key);
        }
        return true;
      });
    }

    return {
      managedTenantId: actor.tenantId,
      permissions: filteredPermissions,
      roles: filteredRoles,
      users,
    };
  }

  async createPermission(dto: CreatePermissionDto, user: RequestUser) {
    const actor = await this.resolveActor(user);
    this.ensureSuperAdmin(actor);

    return this.prisma.permission.upsert({
      where: { permission: dto.permission },
      update: {
        module: dto.module,
        description: dto.description,
      },
      create: {
        permission: dto.permission,
        module: dto.module,
        description: dto.description,
      },
    });
  }

  async createTenantRole(dto: CreateTenantRoleDto, user: RequestUser) {
    const actor = await this.resolveActor(user);
    this.ensureCompanyAdmin(actor);

    const existing = await this.prisma.role.findFirst({
      where: {
        tenantId: actor.tenantId,
        name: dto.role,
      },
    });

    if (existing) {
      throw new ForbiddenException('Role already exists for this tenant.');
    }

    return this.prisma.role.create({
      data: {
        name: dto.role,
        description: dto.description,
        tenantId: actor.tenantId,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
  }

  async bootstrapTenantModuleRoles(user: RequestUser) {
    const actor = await this.resolveActor(user);
    this.ensureCompanyAdmin(actor);

    const enabledModules = await this.tenantConfigurationService.getEnabledModuleKeys(actor.tenantId!);

    const permissions = await this.prisma.permission.findMany({
      where: {
        module: { in: enabledModules },
      },
      orderBy: [{ module: 'asc' }, { permission: 'asc' }],
    });

    const grouped = new Map<string, number[]>();
    for (const permission of permissions) {
      if (permission.module === 'configuration') {
        continue;
      }

      // Job-governed actions (e.g. leave.manage) live on tenant job roles, not
      // module roles — keep module roles access-tier only.
      if (isJobGovernedPermission(permission.permission)) {
        continue;
      }

      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission.id]);
    }

    const created: string[] = [];
    const existing: string[] = [];

    for (const [module, permissionIds] of grouped.entries()) {
      const roleName = module.toUpperCase();
      const found = await this.prisma.role.findFirst({
        where: {
          tenantId: actor.tenantId,
          name: roleName,
        },
      });

      const role =
        found ??
        (await this.prisma.role.create({
          data: {
            name: roleName,
            description: `${module} module access role`,
            tenantId: actor.tenantId,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        }));

      if (found) {
        existing.push(roleName);
      } else {
        created.push(roleName);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (permissionIds.length) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({
              roleId: role.id,
              permissionId,
              createdBy: actor.id,
            })),
          });
        }
      });
    }

    // Also provision the tenant's editable job roles (HR_MANAGER, TEAM_LEAD,
    // EMPLOYEE) so their action permissions are configurable in Access Configuration.
    await this.roleBootstrapService.syncJobRoles(actor.tenantId!);

    return {
      success: true,
      created,
      existing,
    };
  }

  async listRolePermissions(roleId: number, user: RequestUser) {
    const actor = await this.resolveActor(user);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (actor.roles.includes('COMPANY_ADMIN') && role.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Cannot view role from another tenant.');
    }

    return this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
      orderBy: { permission: { permission: 'asc' } },
    });
  }

  async setRolePermissions(roleId: number, dto: SetRolePermissionsDto, user: RequestUser) {
    const actor = await this.resolveActor(user);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (actor.roles.includes('COMPANY_ADMIN')) {
      if (role.tenantId !== actor.tenantId) {
        throw new ForbiddenException('Cannot edit permissions for another tenant role.');
      }

      if (role.tenantId === null) {
        throw new ForbiddenException('Common roles cannot be edited by company admin.');
      }
    }

    if (!actor.roles.includes('COMPANY_ADMIN') && !actor.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });

      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
            createdBy: actor.id,
          })),
        });
      }
    });

    return this.listRolePermissions(roleId, user);
  }

  async assignScopedRole(dto: AssignScopedUserRoleDto, user: RequestUser) {
    const actor = await this.resolveActor(user);

    if (!actor.roles.includes('SUPER_ADMIN') && !actor.roles.includes('COMPANY_ADMIN')) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    const [targetUser, targetRole] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, tenantId: true },
      }),
      this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { id: true, tenantId: true, name: true },
      }),
    ]);

    if (!targetUser || !targetRole) {
      throw new NotFoundException('User or role not found.');
    }

    if (actor.roles.includes('COMPANY_ADMIN')) {
      if (targetUser.tenantId !== actor.tenantId) {
        throw new ForbiddenException('Cannot assign roles to another tenant user.');
      }

      if (targetRole.tenantId !== null && targetRole.tenantId !== actor.tenantId) {
        throw new ForbiddenException('Company admin can assign only shared or tenant roles.');
      }
    }

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: dto.userId,
          roleId: dto.roleId,
        },
      },
      update: {
        updatedBy: actor.id,
      },
      create: {
        userId: dto.userId,
        roleId: dto.roleId,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
  }

  async unassignScopedRole(dto: UnassignScopedUserRoleDto, user: RequestUser) {
    const actor = await this.resolveActor(user);

    if (!actor.roles.includes('SUPER_ADMIN') && !actor.roles.includes('COMPANY_ADMIN')) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    const [targetUser, targetRole] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, tenantId: true },
      }),
      this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { id: true, tenantId: true, name: true },
      }),
    ]);

    if (!targetUser || !targetRole) {
      throw new NotFoundException('User or role not found.');
    }

    if (actor.roles.includes('COMPANY_ADMIN')) {
      if (targetUser.tenantId !== actor.tenantId) {
        throw new ForbiddenException('Cannot unassign roles for another tenant user.');
      }

      if (targetRole.tenantId !== null && targetRole.tenantId !== actor.tenantId) {
        throw new ForbiddenException('Company admin can unassign only shared or tenant roles.');
      }
    }

    const deleted = await this.prisma.userRole.deleteMany({
      where: {
        userId: dto.userId,
        roleId: dto.roleId,
      },
    });

    return {
      success: true,
      removed: deleted.count,
    };
  }
}
