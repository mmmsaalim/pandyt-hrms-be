import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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

    return this.prisma.location.delete({ where: { id } });
  }

  // --- Departments CRUD ---
  async findAllDepartments(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.department.findMany({
      where: { tenantId },
      include: { location: true },
    });
  }

  async createDepartment(dto: { name: string; locationId?: number; managerId?: number }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.department.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async updateDepartment(id: number, dto: { name?: string; locationId?: number; managerId?: number }, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Department not found.');

    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  async deleteDepartment(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Department not found.');

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

    return this.prisma.team.delete({ where: { id } });
  }

  // --- Organisation Tree API ---
  async getTree(user: RequestUser) {
    const tenantId = this.requireTenant(user);

    // Fetch all locations, departments, teams, and active employees
    const [departments, teams, employees] = await Promise.all([
      this.prisma.department.findMany({
        where: { tenantId },
        include: { location: true },
      }),
      this.prisma.team.findMany({
        where: { tenantId },
      }),
      this.prisma.employee.findMany({
        where: { tenantId, deletedAt: null },
        include: { user: true },
      }),
    ]);

    // Construct hierarchy
    const tree = departments.map((dept) => {
      const deptTeams = teams
        .filter((t) => t.departmentId === dept.id)
        .map((team) => {
          const teamEmployees = employees
            .filter((emp) => emp.teamId === team.id)
            .map((emp) => ({
              id: emp.id,
              name: `${emp.user.firstName} ${emp.user.lastName}`,
              designation: emp.designation,
              employeeCode: emp.employeeCode,
            }));

          return {
            id: team.id,
            name: team.name,
            employees: teamEmployees,
          };
        });

      const deptEmployeesWithoutTeam = employees
        .filter((emp) => emp.departmentId === dept.id && !emp.teamId)
        .map((emp) => ({
          id: emp.id,
          name: `${emp.user.firstName} ${emp.user.lastName}`,
          designation: emp.designation,
          employeeCode: emp.employeeCode,
        }));

      return {
        id: dept.id,
        name: dept.name,
        location: dept.location ? { id: dept.location.id, name: dept.location.name } : null,
        teams: deptTeams,
        employeesWithoutTeam: deptEmployeesWithoutTeam,
      };
    });

    return tree;
  }
}
