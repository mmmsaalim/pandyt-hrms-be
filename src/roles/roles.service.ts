import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllRoles() {
    return this.prisma.role.findMany();
  }

  createRole(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  assignRole(dto: AssignUserRoleDto) {
    return this.prisma.userRole.create({ data: dto });
  }

  listUserRoles(userId: string) {
    return this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }
}
