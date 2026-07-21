import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared utility for tenant-scoped resource ownership validation.
 * Eliminates 40+ hand-rolled `findFirst({id, tenantId}) or throw` checks.
 * Single source of truth for tenant-ownership verification.
 */
@Injectable()
export class TenantScopedRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load a tenant-scoped resource or throw NotFoundException.
   * This is the canonical method for verifying a resource belongs to a tenant before operations.
   *
   * @param model - Prisma model name (lowercase: 'employee', 'department', 'team', 'location', 'jobPost', etc.)
   * @param id - Resource ID
   * @param tenantId - Expected tenant ID (from JWT/header)
   * @param notFoundMessage - Optional custom error message
   * @returns The resource (type: any, cast at call site if needed)
   * @throws NotFoundException if resource not found or doesn't belong to tenant
   *
   * @example
   * const dept = await this.tenantRepo.requireTenantOwned('department', deptId, tenantId);
   * // Replaces: const dept = await prisma.department.findFirst({ where: { id: deptId, tenantId } });
   *             if (!dept) throw new NotFoundException('Department not found');
   */
  async requireTenantOwned(
    model: string,
    id: number | string,
    tenantId: number,
    notFoundMessage?: string,
  ): Promise<any> {
    // Cast model name to Prisma client property (e.g. 'employee' -> prisma.employee)
    const modelClient = this.prisma[model as keyof PrismaService];

    if (!modelClient) {
      throw new Error(`Invalid model: ${model}`);
    }

    // Query with both id and tenantId
    // @ts-ignore: Dynamic model access
    const resource = await modelClient.findFirst({
      where: {
        id: typeof id === 'string' ? parseInt(id, 10) : id,
        tenantId,
      },
    });

    if (!resource) {
      throw new NotFoundException(
        notFoundMessage || `${model} not found or does not belong to this tenant.`,
      );
    }

    return resource;
  }

  /**
   * Batch load multiple tenant-scoped resources.
   * Useful for checking ownership of multiple records before bulk operations.
   *
   * @param model - Prisma model name
   * @param ids - Array of resource IDs
   * @param tenantId - Expected tenant ID
   * @returns Array of resources (in any order)
   * @throws NotFoundException if any resource not found or doesn't belong to tenant
   */
  async requireTenantOwnedBatch(
    model: string,
    ids: (number | string)[],
    tenantId: number,
  ): Promise<any[]> {
    const modelClient = this.prisma[model as keyof PrismaService];

    if (!modelClient) {
      throw new Error(`Invalid model: ${model}`);
    }

    const numIds = ids.map((id) => (typeof id === 'string' ? parseInt(id, 10) : id));

    // @ts-ignore: Dynamic model access
    const resources = await modelClient.findMany({
      where: {
        id: { in: numIds },
        tenantId,
      },
    });

    if (resources.length !== numIds.length) {
      throw new NotFoundException(
        `Expected ${numIds.length} resources but found ${resources.length}. Some may not belong to this tenant.`,
      );
    }

    return resources;
  }
}
