import { PrismaClient } from '@prisma/client';

export type SeedPrisma = PrismaClient;

export type RoleIds = {
  superAdminRoleId: number;
  companyAdminRoleId: number;
  hrManagerRoleId: number;
  teamLeadRoleId: number;
  employeeRoleId: number;
};

export type TenantSeedContext = {
  demoTenantId: number;
  demoEmployeeId: number;
  secondTenantId: number;
};
