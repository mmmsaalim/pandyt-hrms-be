import { BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RequestUser = { sub: number; roles?: string[]; tenantId?: number | null } | undefined;

@Injectable()
export class OrganisationService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: RequestUser): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    return tenantId;
  }

  // --- Locations CRUD ---
  async findAllLocations(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.location.findMany({
      where: { tenantId },
    });
  }

  async createLocation(dto: { name: string; address?: string }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.location.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async updateLocation(id: number, dto: { name?: string; address?: string }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.location.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Location not found.');

    return this.prisma.location.update({
      where: { id },
      data: dto,
    });
  }

  async deleteLocation(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.location.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Location not found.');

    const [departmentCount, employeeCount] = await Promise.all([
      this.prisma.department.count({ where: { tenantId, locationId: id } }),
      this.prisma.employee.count({ where: { tenantId, locationId: id, deletedAt: null } }),
    ]);

    if (departmentCount > 0 || employeeCount > 0) {
      throw new BadRequestException(
        'Cannot delete location while departments or employees are still assigned to it.',
      );
    }

    return this.prisma.location.delete({ where: { id } });
  }

  private async validateManager(tenantId: number, managerId: number | undefined | null) {
    if (!managerId) return;
    const manager = await this.prisma.employee.findFirst({
      where: { id: managerId, tenantId, deletedAt: null },
    });
    if (!manager) throw new NotFoundException('Manager employee not found in this tenant.');
  }

  // --- Departments CRUD ---
  async findAllDepartments(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.department.findMany({
      where: { tenantId },
      include: {
        location: true,
        manager: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async createDepartment(
    dto: { name: string; locationId?: number; managerId?: number | null },
    user: RequestUser,
  ) {
    const tenantId = this.requireTenant(user);

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: dto.locationId, tenantId } });
      if (!location) throw new NotFoundException('Location not found in this tenant.');
    }

    await this.validateManager(tenantId, dto.managerId ?? undefined);

    return this.prisma.department.create({
      data: { ...dto, tenantId },
      include: {
        location: true,
        manager: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async updateDepartment(
    id: number,
    dto: { name?: string; locationId?: number | null; managerId?: number | null },
    user: RequestUser,
  ) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Department not found.');

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({ where: { id: dto.locationId, tenantId } });
      if (!location) throw new NotFoundException('Location not found in this tenant.');
    }

    await this.validateManager(tenantId, dto.managerId ?? undefined);

    return this.prisma.department.update({
      where: { id },
      data: dto,
      include: {
        location: true,
        manager: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async deleteDepartment(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Department not found.');

    const employeeCount = await this.prisma.employee.count({
      where: { tenantId, departmentId: id, deletedAt: null },
    });

    if (employeeCount > 0) {
      throw new BadRequestException('Cannot delete department while employees are still assigned to it.');
    }

    return this.prisma.department.delete({ where: { id } });
  }

  // --- Teams CRUD ---
  async findAllTeams(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.team.findMany({
      where: { tenantId },
      include: { department: true },
    });
  }

  async createTeam(dto: { name: string; departmentId: number }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    // verify department belongs to tenant
    const dept = await this.prisma.department.findFirst({ where: { id: dto.departmentId, tenantId } });
    if (!dept) throw new NotFoundException('Department not found in this tenant.');

    return this.prisma.team.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async updateTeam(id: number, dto: { name?: string; departmentId?: number }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.team.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Team not found.');

    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({ where: { id: dto.departmentId, tenantId } });
      if (!dept) throw new NotFoundException('Department not found in this tenant.');
    }

    return this.prisma.team.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTeam(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.team.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Team not found.');

    const employeeCount = await this.prisma.employee.count({
      where: { tenantId, teamId: id, deletedAt: null },
    });

    if (employeeCount > 0) {
      throw new BadRequestException('Cannot delete team while employees are still assigned to it.');
    }

    return this.prisma.team.delete({ where: { id } });
  }

  // --- Organisation Tree API ---
  // BRD 6.3: Location > Department > Team (location-centric for FE tree tab)
  async getTree(user: RequestUser) {
    const tenantId = this.requireTenant(user);

    const [locations, departments, teams, employees] = await Promise.all([
      this.prisma.location.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.department.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: {
          manager: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.team.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          employeeCode: true,
          departmentId: true,
          teamId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    const mapEmployee = (employee: (typeof employees)[number]) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.user?.firstName ?? ''} ${employee.user?.lastName ?? ''}`.trim(),
      email: employee.user?.email,
    });

    const buildDepartmentNode = (dept: (typeof departments)[number]) => ({
      id: dept.id,
      name: dept.name,
      managerId: dept.managerId,
      managerName: dept.manager
        ? `${dept.manager.user?.firstName ?? ''} ${dept.manager.user?.lastName ?? ''}`.trim()
        : null,
      _count: {
        employees: employees.filter((emp) => emp.departmentId === dept.id).length,
      },
      employees: employees
        .filter((emp) => emp.departmentId === dept.id && !emp.teamId)
        .map(mapEmployee),
      teams: teams
        .filter((t) => t.departmentId === dept.id)
        .map((team) => ({
          id: team.id,
          name: team.name,
          _count: {
            employees: employees.filter((emp) => emp.teamId === team.id).length,
          },
          employees: employees.filter((emp) => emp.teamId === team.id).map(mapEmployee),
        })),
    });

    const locationNodes = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      departments: departments
        .filter((d) => d.locationId === loc.id)
        .map(buildDepartmentNode),
    }));

    const unassignedDepartments = departments.filter((d) => !d.locationId);
    if (unassignedDepartments.length > 0) {
      locationNodes.push({
        id: 0,
        name: 'Unassigned Location',
        departments: unassignedDepartments.map(buildDepartmentNode),
      });
    }

    return locationNodes;
  }
}
