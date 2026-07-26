import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService, PrismaTxClient } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { InvitationsService } from '../invitations/invitations.service';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';
import { EmailService } from '../email/email.service';
import { OffboardEmployeeDto } from './dto/offboard-employee.dto';
import {
  DEFAULT_JOB_ROLE_PERMISSIONS,
  DEFAULT_MODULE_GROUPS,
  JobRoleName,
  isJobGovernedPermission,
  isJobRoleName,
} from '../roles/rbac.constants';

type RequestUser =
  | { sub: number; roles?: string[]; permissions?: string[]; effectivePermissions?: string[] }
  | undefined;
type TxClient = PrismaTxClient;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
    private readonly tenantConfigurationService: TenantConfigurationService,
    private readonly emailService: EmailService,
  ) {}

  private isManualOnlyEmail(email?: string | null): boolean {
    return Boolean(email?.trim().toLowerCase().endsWith('@no-email.flowhr.local'));
  }

  private async mapEmployeeResponse<T extends { tenantId: number; customFields?: unknown; user?: { email?: string; status?: string } }>(
    employee: T,
  ) {
    const runtimeConfig = await this.tenantConfigurationService.getTenantRuntimeConfig(employee.tenantId);
    const isManualOnly = this.isManualOnlyEmail(employee.user?.email);
    return {
      ...employee,
      isManualOnly,
      loginEnabled: !isManualOnly && employee.user?.status === 'ACTIVE',
      invitationPending: !isManualOnly && employee.user?.status === 'PENDING',
      customFields: this.tenantConfigurationService.filterCustomFieldsForRead(
        runtimeConfig,
        'employees',
        employee.customFields,
      ),
    };
  }

  private buildTenantCodePrefix(
    companyCode: string | null | undefined,
    tenantName: string,
    tenantId: number,
  ): string {
    const fromCode = (companyCode ?? '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();
    if (fromCode) {
      return fromCode;
    }

    const fromName = tenantName
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase();
    if (fromName) {
      return fromName;
    }

    return `T${tenantId}`;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private async resolveManagerId(
    tenantId: number,
    managerId: number | null | undefined,
    employeeId?: number,
  ): Promise<number | null | undefined> {
    if (managerId === undefined) {
      return undefined;
    }

    if (managerId === null) {
      return null;
    }

    const manager = await this.prisma.employee.findFirst({
      where: { id: managerId, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!manager) {
      throw new NotFoundException('Reporting manager not found in this tenant.');
    }

    if (employeeId && managerId === employeeId) {
      throw new BadRequestException('An employee cannot be their own manager.');
    }

    return managerId;
  }

  private async resolveShiftId(tenantId: number, shiftId: number | null | undefined): Promise<number | null | undefined> {
    if (shiftId === undefined) {
      return undefined;
    }

    if (shiftId === null) {
      return null;
    }

    const shift = await this.prisma.workShift.findFirst({
      where: { id: shiftId, tenantId, isActive: true },
      select: { id: true },
    });

    if (!shift) {
      throw new NotFoundException('Work shift not found in this tenant.');
    }

    return shiftId;
  }

  private async resolveOrgAssignment(
    tenantId: number,
    input: {
      department?: string;
      departmentId?: number;
      teamId?: number | null;
      locationId?: number | null;
    },
    options: { requireDepartment: boolean },
  ) {
    let departmentName = input.department?.trim() ?? '';
    let departmentId = input.departmentId ?? null;
    let teamId = input.teamId === undefined ? undefined : input.teamId;
    let locationId = input.locationId === undefined ? undefined : input.locationId;

    if (departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { id: true, name: true, locationId: true },
      });

      if (!department) {
        throw new NotFoundException('Department not found in this tenant.');
      }

      departmentName = department.name;
      if (locationId === undefined && department.locationId) {
        locationId = department.locationId;
      }
    }

    if (teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: teamId, tenantId },
        select: { id: true, departmentId: true },
      });

      if (!team) {
        throw new NotFoundException('Team not found in this tenant.');
      }

      if (departmentId && team.departmentId !== departmentId) {
        throw new BadRequestException('Selected team does not belong to the selected department.');
      }

      departmentId = departmentId ?? team.departmentId;

      if (!departmentName) {
        const department = await this.prisma.department.findFirst({
          where: { id: team.departmentId, tenantId },
          select: { name: true, locationId: true },
        });

        if (department) {
          departmentName = department.name;
          if (locationId === undefined && department.locationId) {
            locationId = department.locationId;
          }
        }
      }
    }

    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true },
      });

      if (!location) {
        throw new NotFoundException('Location not found in this tenant.');
      }
    }

    if (options.requireDepartment && !departmentName) {
      throw new BadRequestException('Department is required.');
    }

    return {
      department: departmentName,
      departmentId: departmentId ?? undefined,
      teamId,
      locationId,
    };
  }

  private async getEmployeeContext(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
  }

  /**
   * Ensure the tenant has its own editable job role (HR_MANAGER / TEAM_LEAD /
   * EMPLOYEE) and return its id. Default action permissions are seeded only when
   * the role is first created, so Access Configuration edits are never clobbered.
   */
  private async ensureTenantJobRole(tx: TxClient, tenantId: number, roleName: string): Promise<number> {
    const existing = await tx.role.findFirst({
      where: { tenantId, name: roleName },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const role = await tx.role.create({
      data: {
        tenantId,
        name: roleName,
        description: `Tenant ${roleName} role — configurable in Access Configuration`,
      },
      select: { id: true },
    });

    // Seed = the role's job-governed actions PLUS the access-tier permissions of
    // its default modules. Persisting the module tier here (instead of deriving
    // it in the UI) is what lets Access Configuration pre-tick a role's existing
    // access as real, saved data — so unticking it actually persists instead of
    // being re-applied by a display-time overlay on the next page load.
    const actionDefaults = DEFAULT_JOB_ROLE_PERMISSIONS[roleName as JobRoleName] ?? [];
    const defaultModules = DEFAULT_MODULE_GROUPS[roleName] ?? [];

    const [actionPermissions, modulePermissions] = await Promise.all([
      actionDefaults.length
        ? tx.permission.findMany({ where: { permission: { in: actionDefaults } }, select: { id: true } })
        : Promise.resolve([] as Array<{ id: number }>),
      defaultModules.length
        ? tx.permission.findMany({
            where: { module: { in: defaultModules } },
            select: { id: true, permission: true },
          })
        : Promise.resolve([] as Array<{ id: number; permission: string }>),
    ]);

    // Job-governed actions are excluded from the module tier on purpose: e.g. the
    // EMPLOYEE role's default modules include 'leave', but an employee must not
    // inherit leave.manage from it.
    const permissionIds = new Set<number>(actionPermissions.map((p) => p.id));
    for (const permission of modulePermissions) {
      if (!isJobGovernedPermission(permission.permission)) {
        permissionIds.add(permission.id);
      }
    }

    if (permissionIds.size > 0) {
      await tx.rolePermission.createMany({
        data: [...permissionIds].map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }

    return role.id;
  }

  private async ensureModuleAccess(
    tx: TxClient,
    tenantId: number,
    userId: number,
    modules: string[],
  ) {
    // Access-tier permissions only — job-governed actions (e.g. leave.manage)
    // live on tenant job roles, not module roles.
    const permissions = (
      await tx.permission.findMany({
        where: { module: { in: modules } },
        orderBy: [{ module: 'asc' }, { permission: 'asc' }],
      })
    ).filter((permission) => !isJobGovernedPermission(permission.permission));

    const grouped = new Map<string, number[]>();
    for (const permission of permissions) {
      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission.id]);
    }

    for (const [module, permissionIds] of grouped.entries()) {
      const roleName = module.toUpperCase();
      const existingRole = await tx.role.findFirst({
        where: { tenantId, name: roleName },
        select: { id: true },
      });

      const role =
        existingRole ??
        (await tx.role.create({
          data: {
            tenantId,
            name: roleName,
            description: `${module} module access role`,
          },
          select: { id: true },
        }));

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: role.id,
        },
      });
    }
  }

  async findAll(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const where: Prisma.EmployeeWhereInput = {
      tenantId: adminContext.tenantId,
      deletedAt: null,
      ...(this.hasRole(user, 'TEAM_LEAD') && !this.hasRole(user, 'COMPANY_ADMIN') && !this.hasRole(user, 'HR_MANAGER')
        ? { managerId: adminContext.id }
        : {}),
    };

    const rows = await this.prisma.employee.findMany({
      where,
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  select: { name: true },
                },
              },
            },
          },
        },
        tenant: true,
        departmentRelation: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        manager: { select: { id: true, employeeCode: true, user: { select: { firstName: true, lastName: true } } } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { joinedDate: 'desc' },
    });

    return Promise.all(rows.map((row) => this.mapEmployeeResponse(row)));
  }

  async findMe(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const context = await this.getEmployeeContext(user.sub);
    if (!context) {
      throw new NotFoundException('Employee profile not found for this user.');
    }

    return this.findOne(context.id, user);
  }

  async updateMe(dto: UpdateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const context = await this.getEmployeeContext(user.sub);
    if (!context) {
      throw new NotFoundException('Employee profile not found for this user.');
    }

    const selfUpdate: UpdateEmployeeDto = {
      customFields: dto.customFields,
    };

    if (this.hasRole(user, 'COMPANY_ADMIN') || this.hasRole(user, 'HR_MANAGER')) {
      if (dto.designation !== undefined) selfUpdate.designation = dto.designation;
      if (dto.employmentStatus !== undefined) selfUpdate.employmentStatus = dto.employmentStatus;
    }

    return this.update(context.id, selfUpdate, user);
  }

  async findOne(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: true,
        tenant: true,
        departmentRelation: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        manager: { select: { id: true, employeeCode: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!employee || employee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      const ownContext = await this.getEmployeeContext(user.sub);
      if (!ownContext || ownContext.id !== employee.id) {
        throw new ForbiddenException('Cannot access another employee profile.');
      }

      return this.mapEmployeeResponse(employee);
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext || adminContext.tenantId !== employee.tenantId) {
      throw new ForbiddenException('Cannot access employee from another tenant.');
    }

    return this.mapEmployeeResponse(employee);
  }

  async create(dto: CreateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (dto.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot create employee for another tenant.');
    }

    return this.prisma.employee.create({
      data: {
        ...dto,
        joinedDate: new Date(dto.joinedDate),
      },
    });
  }

  private async resolveEmployeeCode(
    tx: TxClient,
    tenantId: number,
    _name: string,
    requestedCode?: string,
  ): Promise<string> {
    const manualCode = requestedCode?.trim();
    if (manualCode) {
      const existing = await tx.employee.findUnique({
        where: { employeeCode: manualCode },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Employee code already exists. Please use a different code.');
      }

      return manualCode;
    }

    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { companyCode: true, name: true },
    });
    const prefix = this.buildTenantCodePrefix(tenant?.companyCode, tenant?.name ?? '', tenantId);
    const employees = await tx.employee.findMany({
      where: {
        tenantId,
        employeeCode: { startsWith: `${prefix}-` },
      },
      select: { employeeCode: true },
    });

    let maxSequence = 0;
    const pattern = new RegExp(`^${this.escapeRegex(prefix)}-(\\d+)$`);
    for (const row of employees) {
      const match = row.employeeCode.match(pattern);
      if (match) {
        maxSequence = Math.max(maxSequence, Number(match[1]));
      }
    }

    for (let offset = 1; offset <= 20; offset += 1) {
      const generated = `${prefix}-${String(maxSequence + offset).padStart(3, '0')}`;
      const existing = await tx.employee.findUnique({
        where: { employeeCode: generated },
        select: { id: true },
      });
      if (!existing) {
        return generated;
      }
    }

    throw new ConflictException('Failed to generate a unique employee code. Please retry.');
  }

  async inviteEmployee(dto: InviteEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const isCompanyAdmin = this.hasRole(user, 'COMPANY_ADMIN');
    const isHRManager = this.hasRole(user, 'HR_MANAGER');
    // Access Configuration can grant the employees.invite permission to any tenant
    // module role (e.g. a team lead), so honour the permission — not only the two
    // built-in admin roles. Company Admin / HR Manager already carry this permission.
    const grantedPermissions = user?.effectivePermissions ?? user?.permissions ?? [];
    const hasInvitePermission = grantedPermissions.includes('employees.invite');

    if (!isCompanyAdmin && !isHRManager && !hasInvitePermission) {
      throw new ForbiddenException('You do not have permission to invite employees.');
    }

    // HR manager is restricted to operational roles inside tenant.
    if (isHRManager && !isCompanyAdmin) {
      const restrictedRoles = ['HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE'];
      if (!restrictedRoles.includes(dto.role)) {
        throw new ForbiddenException('HR_MANAGER can only create HR_MANAGER, TEAM_LEAD, or EMPLOYEE roles.');
      }
    }

    // A delegated inviter (has employees.invite but is not COMPANY_ADMIN / HR_MANAGER)
    // may only onboard base EMPLOYEE accounts — they cannot mint elevated roles.
    if (!isCompanyAdmin && !isHRManager && dto.role !== 'EMPLOYEE') {
      throw new ForbiddenException('You can only invite users with the EMPLOYEE role.');
    }

    // Validate requested role
    const validRoles = ['EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD', 'COMPANY_ADMIN'];
    if (!validRoles.includes(dto.role)) {
      throw new ForbiddenException(`Invalid role: ${dto.role}`);
    }

    const onboardingMode = dto.onboardingMode ?? 'EMAIL_INVITE';
    const normalizedEmail =
      onboardingMode === 'MANUAL_ONLY'
        ? ''
        : dto.workEmail?.trim().toLowerCase() ?? '';

    if (onboardingMode !== 'MANUAL_ONLY' && !normalizedEmail) {
      throw new BadRequestException('Work email is required for email invite onboarding.');
    }

    const existingUser = normalizedEmail
      ? await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        })
      : null;

    if (existingUser) {
      throw new ConflictException('A user with this work email address already exists.');
    }

    const requestedRole = dto.role;

    // Shared (tenantId=null) role acts as the template; job roles are assigned as
    // their tenant-scoped, editable copy (created below inside the transaction).
    const sharedRole = await this.prisma.role.findFirst({
      where: {
        name: requestedRole,
        tenantId: null,
      },
      select: { id: true },
    });

    if (!sharedRole) {
      throw new NotFoundException(`${requestedRole} role is not configured.`);
    }

    const [firstName, ...lastNameParts] = dto.name.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'User';
    const temporaryPassword = randomBytes(12).toString('hex');
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: adminContext.tenantId },
      select: { name: true, seats: true, plan: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found for company admin.');
    }

    const activeEmployeeCount = await this.prisma.employee.count({
      where: {
        tenantId: adminContext.tenantId,
        deletedAt: null,
        employmentStatus: { not: 'INACTIVE' },
      },
    });

    if (activeEmployeeCount >= tenant.seats) {
      throw new BadRequestException(
        `Seat limit reached (${tenant.seats} included on ${tenant.plan} plan). Upgrade your subscription to add more employees.`,
      );
    }

    const enabledModules = await this.tenantConfigurationService.getEnabledModuleKeys(adminContext.tenantId);
    const runtimeConfig = await this.tenantConfigurationService.getTenantRuntimeConfig(adminContext.tenantId);
    const validatedCustomFields = this.tenantConfigurationService.validateCustomFields(
      runtimeConfig,
      'employees',
      dto.customFields,
    );

    // Default module (access) groups per role — centralized in rbac.constants.
    const modulesForRole = (DEFAULT_MODULE_GROUPS[requestedRole] || DEFAULT_MODULE_GROUPS.EMPLOYEE).filter(
      (module) => enabledModules.includes(module),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const employeeCode = await this.resolveEmployeeCode(
        tx,
        adminContext.tenantId,
        dto.name,
        dto.employeeCode,
      );
      const userEmail =
        onboardingMode === 'MANUAL_ONLY'
          ? `manual-${adminContext.tenantId}-${employeeCode.toLowerCase()}@no-email.flowhr.local`
          : normalizedEmail;

      const createdUser = await tx.user.create({
        data: {
          email: userEmail,
          passwordHash: temporaryPasswordHash,
          firstName: firstName || 'Employee',
          lastName,
          status: onboardingMode === 'MANUAL_ONLY' ? 'INACTIVE' : 'PENDING',
          tenantId: adminContext.tenantId,
        },
      });

      // Job roles (HR_MANAGER/TEAM_LEAD/EMPLOYEE) are assigned as the tenant's
      // own editable copy so the Company Admin can configure their actions per
      // tenant. Other roles (e.g. COMPANY_ADMIN) use the shared template role.
      const assignedRoleId = isJobRoleName(requestedRole)
        ? await this.ensureTenantJobRole(tx, adminContext.tenantId, requestedRole)
        : sharedRole.id;

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: assignedRoleId,
        },
      });

      // Assign module-based access for the role
      await this.ensureModuleAccess(tx, adminContext.tenantId, createdUser.id, modulesForRole);

      const orgAssignment = await this.resolveOrgAssignment(
        adminContext.tenantId,
        {
          department: dto.department,
          departmentId: dto.departmentId,
          teamId: dto.teamId,
          locationId: dto.locationId,
        },
        { requireDepartment: true },
      );

      const managerId = await this.resolveManagerId(adminContext.tenantId, dto.managerId);

      const employee = await tx.employee.create({
        data: {
          tenantId: adminContext.tenantId,
          userId: createdUser.id,
          employeeCode,
          department: orgAssignment.department,
          departmentId: orgAssignment.departmentId,
          teamId: orgAssignment.teamId ?? undefined,
          locationId: orgAssignment.locationId ?? undefined,
          designation: dto.designation,
          joinedDate: new Date(),
          employmentStatus: 'ACTIVE',
          customFields: validatedCustomFields as Prisma.InputJsonValue,
          ...(managerId !== undefined ? { managerId } : {}),
        },
        include: { user: true, tenant: true },
      });

      return { createdUser, employee };
    });

    const invitation =
      onboardingMode === 'MANUAL_ONLY'
        ? null
        : await this.invitationsService.createAndSendInvitation({
            tenantId: adminContext.tenantId,
            userId: result.createdUser.id,
            email: result.createdUser.email,
            role: requestedRole,
            fullName: dto.name,
            companyName: tenant.name,
          });

    return {
      employee: result.employee,
      invitation,
      onboardingMode,
      employeeCode: result.employee.employeeCode,
      temporaryPassword: onboardingMode === 'MANUAL_ONLY' ? undefined : temporaryPassword,
    };
  }

  async enableEmployeeLogin(id: number, workEmail: string, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const isCompanyAdmin = this.hasRole(user, 'COMPANY_ADMIN');
    const isHRManager = this.hasRole(user, 'HR_MANAGER');
    if (!isCompanyAdmin && !isHRManager) {
      throw new ForbiddenException('Only COMPANY_ADMIN or HR_MANAGER can enable employee login.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const normalizedEmail = workEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Work email is required.');
    }

    const targetEmployee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: { select: { name: true } },
              },
            },
          },
        },
        tenant: { select: { id: true, name: true } },
      },
    });

    if (!targetEmployee || targetEmployee.deletedAt) {
      throw new NotFoundException('Employee not found.');
    }

    if (targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot update employee from another tenant.');
    }

    if (!this.isManualOnlyEmail(targetEmployee.user.email)) {
      throw new BadRequestException('This employee already has a real login email.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== targetEmployee.userId) {
      throw new ConflictException('A user with this work email already exists.');
    }

    const identityRole =
      targetEmployee.user.roles.find((entry) => entry.role.name !== 'CONFIGURATION')?.role.name ?? 'EMPLOYEE';

    await this.prisma.user.update({
      where: { id: targetEmployee.userId },
      data: {
        email: normalizedEmail,
        status: 'PENDING',
      },
    });

    const invitation = await this.invitationsService.createAndSendInvitation({
      tenantId: targetEmployee.tenantId,
      userId: targetEmployee.userId,
      email: normalizedEmail,
      role: identityRole,
      fullName: `${targetEmployee.user.firstName} ${targetEmployee.user.lastName}`.trim(),
      companyName: targetEmployee.tenant.name,
    });

    const refreshed = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            roles: { include: { role: { select: { name: true } } } },
          },
        },
        tenant: true,
      },
    });

    return {
      employee: refreshed ? await this.mapEmployeeResponse(refreshed) : null,
      invitation,
      message: 'Login enabled. Invitation email sent so the employee can set a password.',
    };
  }

  async update(id: number, dto: UpdateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, select: { tenantId: true, deletedAt: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot update employee from another tenant.');
    }

    const hasOrgFields =
      dto.department !== undefined ||
      dto.departmentId !== undefined ||
      dto.teamId !== undefined ||
      dto.locationId !== undefined;

    const updateData: Prisma.EmployeeUncheckedUpdateInput = {};

    if (dto.designation !== undefined) updateData.designation = dto.designation;
    if (dto.employmentStatus !== undefined) updateData.employmentStatus = dto.employmentStatus;
    if (dto.salary !== undefined) updateData.salary = dto.salary;
    if (dto.joinedDate) updateData.joinedDate = new Date(dto.joinedDate);
    if (dto.dateOfBirth !== undefined) updateData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;

    if (hasOrgFields) {
      const current = await this.prisma.employee.findUnique({
        where: { id },
        select: {
          department: true,
          departmentId: true,
          teamId: true,
          locationId: true,
        },
      });

      const orgAssignment = await this.resolveOrgAssignment(
        adminContext.tenantId,
        {
          department: dto.department ?? current?.department,
          departmentId: dto.departmentId ?? current?.departmentId ?? undefined,
          teamId: dto.teamId !== undefined ? dto.teamId : current?.teamId,
          locationId: dto.locationId !== undefined ? dto.locationId : current?.locationId,
        },
        { requireDepartment: true },
      );

      updateData.department = orgAssignment.department;
      updateData.departmentId = orgAssignment.departmentId ?? null;
      updateData.teamId = orgAssignment.teamId ?? null;
      updateData.locationId = orgAssignment.locationId ?? null;
    }

    if (dto.customFields !== undefined) {
      const runtimeConfig = await this.tenantConfigurationService.getTenantRuntimeConfig(adminContext.tenantId);
      updateData.customFields = this.tenantConfigurationService.validateCustomFields(
        runtimeConfig,
        'employees',
        dto.customFields,
      ) as Prisma.InputJsonValue;
    }

    if (dto.managerId !== undefined) {
      updateData.managerId = await this.resolveManagerId(adminContext.tenantId, dto.managerId, id);
    }

    if (dto.shiftId !== undefined) {
      updateData.shiftId = await this.resolveShiftId(adminContext.tenantId, dto.shiftId);
    }

    const updated = await this.prisma.employee.update({ where: { id }, data: updateData });
    return this.mapEmployeeResponse(updated);
  }

  async remove(id: number, user: RequestUser) {
    return this.offboard(id, user, { reason: 'Offboarded by administrator.' });
  }

  async offboard(id: number, user: RequestUser, dto: OffboardEmployeeDto) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Offboarding reason is required.');
    }

    const isSuperAdmin = this.hasRole(user, 'SUPER_ADMIN');
    const [adminContext, targetEmployee] = await Promise.all([
      isSuperAdmin ? Promise.resolve(null) : this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({
        where: { id },
        select: {
          tenantId: true,
          userId: true,
          deletedAt: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              roles: {
                include: {
                  role: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          tenant: {
            select: { name: true },
          },
        },
      }),
    ]);

    if (!isSuperAdmin && !adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (!isSuperAdmin && targetEmployee.tenantId !== adminContext!.tenantId) {
      throw new ForbiddenException('Cannot remove employee from another tenant.');
    }

    const targetRoles = (targetEmployee.user?.roles ?? []).map((entry) => entry.role.name);
    const targetIsCompanyAdmin = targetRoles.includes('COMPANY_ADMIN');

    if (!isSuperAdmin && targetIsCompanyAdmin) {
      throw new ForbiddenException('Only SUPER_ADMIN can remove a COMPANY_ADMIN user.');
    }

    const updatedEmp = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          offboardedAt: new Date(),
          offboardingReason: reason,
          employmentStatus: 'INACTIVE',
          salary: 0,
        },
      });

      await tx.user.update({
        where: { id: targetEmployee.userId },
        data: { status: 'INACTIVE' },
      });

      return updated;
    });

    const email = targetEmployee.user?.email?.trim();
    if (email && !email.endsWith('@no-email.flowhr.local')) {
      try {
        await this.emailService.sendOffboardingEmail({
          to: email,
          fullName: `${targetEmployee.user?.firstName ?? ''} ${targetEmployee.user?.lastName ?? ''}`.trim() || 'Employee',
          companyName: targetEmployee.tenant?.name ?? 'Your company',
          reason,
        });
      } catch {
        // Offboarding should succeed even if email delivery fails.
      }
    }

    return updatedEmp;
  }

  async anonymize(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, include: { user: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot anonymize employee from another tenant.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedEmp = await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          employmentStatus: 'INACTIVE',
          customFields: {},
        },
      });

      await tx.user.update({
        where: { id: targetEmployee.userId },
        data: {
          firstName: 'Anonymized',
          lastName: 'User',
          email: `deleted_${id}@null.com`,
          passwordHash: await bcrypt.hash(randomBytes(12).toString('hex'), 10),
          status: 'INACTIVE',
        },
      });

      return updatedEmp;
    });
  }

  async exportData(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            companyCode: true,
          },
        },
        leaveRequests: true,
        attendance: true,
        payslips: true,
      },
    });

    if (!employee || employee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      const ownContext = await this.getEmployeeContext(user.sub);
      if (!ownContext || ownContext.id !== employee.id) {
        throw new ForbiddenException('Cannot export another employee profile.');
      }
    } else {
      const adminContext = await this.getEmployeeContext(user.sub);
      if (!adminContext || adminContext.tenantId !== employee.tenantId) {
        throw new ForbiddenException('Cannot export employee from another tenant.');
      }
    }

    return employee;
  }
}
