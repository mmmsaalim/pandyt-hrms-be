import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CanteenMealTypeConfig,
  DEFAULT_CANTEEN_MEAL_TYPES,
  DEFAULT_MEAL_COUNTS,
  MealBreakdown,
} from './canteen.constants';

type RequestUser = { sub?: number; roles?: string[]; tenantId?: number } | undefined;

@Injectable()
export class CanteenService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: RequestUser): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    return tenantId;
  }

  private normalizeMealTypes(raw: unknown): CanteenMealTypeConfig[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      return DEFAULT_CANTEEN_MEAL_TYPES;
    }

    return raw
      .filter((row): row is CanteenMealTypeConfig => {
        return (
          typeof row === 'object' &&
          row !== null &&
          typeof (row as CanteenMealTypeConfig).key === 'string' &&
          typeof (row as CanteenMealTypeConfig).label === 'string'
        );
      })
      .map((row) => ({
        key: row.key.trim(),
        label: row.label.trim(),
        defaultCost: Number(row.defaultCost ?? 0),
        enabled: row.enabled !== false,
      }));
  }

  private normalizeDefaultCounts(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_MEAL_COUNTS };
    }

    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value)))])
        .filter(([, count]) => Number.isFinite(count)),
    );
  }

  private summarizeBreakdown(
    breakdown: MealBreakdown,
    deductFromSalary: boolean,
  ): { mealCount: number; mealCost: number; totalCost: number } {
    let mealCount = 0;
    let totalCost = 0;

    for (const item of Object.values(breakdown)) {
      const count = Math.max(0, Math.floor(Number(item.count ?? 0)));
      const cost = Math.max(0, Number(item.cost ?? 0));
      mealCount += count;
      if (deductFromSalary) {
        totalCost += count * cost;
      }
    }

    const mealCost = mealCount > 0 ? Math.round((totalCost / mealCount) * 100) / 100 : 0;
    return {
      mealCount,
      mealCost,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  }

  private buildDefaultBreakdown(
    mealTypes: CanteenMealTypeConfig[],
    defaultCounts: Record<string, number>,
  ): MealBreakdown {
    const breakdown: MealBreakdown = {};
    for (const mealType of mealTypes.filter((row) => row.enabled)) {
      const count = Math.max(0, Math.floor(Number(defaultCounts[mealType.key] ?? 0)));
      if (count > 0) {
        breakdown[mealType.key] = { count, cost: mealType.defaultCost };
      }
    }
    return breakdown;
  }

  private mapSettingsRow(settings: {
    enabled: boolean;
    defaultMealCost: number;
    salaryDeduct: boolean;
    autoAssignFromAttendance: boolean;
    mealTypes: unknown;
    defaultMealCounts: unknown;
    notes: string | null;
  }) {
    const mealTypes = this.normalizeMealTypes(settings.mealTypes);
    const defaultMealCounts = this.normalizeDefaultCounts(settings.defaultMealCounts);

    return {
      enabled: settings.enabled,
      defaultMealCost: settings.defaultMealCost,
      salaryDeduct: settings.salaryDeduct,
      autoAssignFromAttendance: settings.autoAssignFromAttendance,
      mealTypes,
      defaultMealCounts,
      notes: settings.notes ?? '',
    };
  }

  async getSettings(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const settings = await this.prisma.canteenSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      const created = await this.prisma.canteenSettings.create({
        data: {
          tenantId,
          defaultMealCost: 0,
          salaryDeduct: false,
          mealTypes: DEFAULT_CANTEEN_MEAL_TYPES as unknown as Prisma.InputJsonValue,
          defaultMealCounts: DEFAULT_MEAL_COUNTS as unknown as Prisma.InputJsonValue,
        },
      });
      return this.mapSettingsRow(created);
    }

    const rawMealTypes = settings.mealTypes;
    const needsMealTypeSeed =
      !Array.isArray(rawMealTypes) ||
      rawMealTypes.length === 0 ||
      this.normalizeMealTypes(rawMealTypes).length === 0;

    if (needsMealTypeSeed) {
      const updated = await this.prisma.canteenSettings.update({
        where: { tenantId },
        data: {
          mealTypes: DEFAULT_CANTEEN_MEAL_TYPES as unknown as Prisma.InputJsonValue,
          defaultMealCounts:
            (settings.defaultMealCounts as Prisma.InputJsonValue) ??
            (DEFAULT_MEAL_COUNTS as unknown as Prisma.InputJsonValue),
        },
      });
      return this.mapSettingsRow(updated);
    }

    return this.mapSettingsRow(settings);
  }

  saveSettings(
    dto: {
      defaultMealCost?: number;
      salaryDeduct?: boolean;
      enabled?: boolean;
      notes?: string;
      autoAssignFromAttendance?: boolean;
      mealTypes?: CanteenMealTypeConfig[];
      defaultMealCounts?: Record<string, number>;
    },
    user: RequestUser,
  ) {
    const tenantId = this.requireTenant(user);
    const mealTypes = dto.mealTypes?.length
      ? dto.mealTypes
      : DEFAULT_CANTEEN_MEAL_TYPES;
    const defaultMealCounts = dto.defaultMealCounts ?? DEFAULT_MEAL_COUNTS;

    return this.prisma.canteenSettings
      .upsert({
        where: { tenantId },
        update: {
          defaultMealCost: dto.defaultMealCost ?? 0,
          salaryDeduct: dto.salaryDeduct ?? false,
          enabled: dto.enabled ?? true,
          autoAssignFromAttendance: dto.autoAssignFromAttendance ?? false,
          mealTypes: mealTypes as unknown as Prisma.InputJsonValue,
          defaultMealCounts: defaultMealCounts as unknown as Prisma.InputJsonValue,
          notes: dto.notes?.trim() || null,
        },
        create: {
          tenantId,
          defaultMealCost: dto.defaultMealCost ?? 0,
          salaryDeduct: dto.salaryDeduct ?? false,
          enabled: dto.enabled ?? true,
          autoAssignFromAttendance: dto.autoAssignFromAttendance ?? false,
          mealTypes: mealTypes as unknown as Prisma.InputJsonValue,
          defaultMealCounts: defaultMealCounts as unknown as Prisma.InputJsonValue,
          notes: dto.notes?.trim() || null,
        },
      })
      .then((row) => this.mapSettingsRow(row));
  }

  private dayRange(date: string): { start: Date; end: Date } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  async listEligibleEmployees(date: string | undefined, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    if (!date) {
      throw new BadRequestException('Date is required.');
    }

    const { start, end } = this.dayRange(date);
    const attendanceRows = await this.prisma.attendance.findMany({
      where: {
        employee: {
          tenantId,
          deletedAt: null,
          employmentStatus: { not: 'INACTIVE' },
        },
        date: { gte: start, lt: end },
        clockIn: { not: null },
      },
      select: {
        employeeId: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            department: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { employeeId: 'asc' },
    });

    const seen = new Set<number>();
    return attendanceRows
      .filter((row) => {
        if (seen.has(row.employeeId)) {
          return false;
        }
        seen.add(row.employeeId);
        return true;
      })
      .map((row) => row.employee);
  }

  list(date: string | undefined, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const whereDate = date ? this.dayRange(date).start : undefined;

    return this.prisma.canteenMealEntry.findMany({
      where: {
        tenantId,
        employee: { deletedAt: null },
        ...(whereDate ? { date: whereDate } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      include: {
        employee: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async upsertEntry(
    dto: {
      employeeId: number;
      date: string;
      mealCount?: number;
      mealCost?: number;
      mealBreakdown?: MealBreakdown;
      deductFromSalary?: boolean;
      notes?: string;
    },
    user: RequestUser,
  ) {
    const tenantId = this.requireTenant(user);
    const [employee, settings] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
        select: { tenantId: true, deletedAt: true, employmentStatus: true },
      }),
      this.getSettings(user),
    ]);

    if (
      !employee ||
      employee.tenantId !== tenantId ||
      employee.deletedAt ||
      employee.employmentStatus === 'INACTIVE'
    ) {
      throw new NotFoundException('Active employee not found in this tenant.');
    }

    const { start, end } = this.dayRange(dto.date);
    const attended = await this.prisma.attendance.findFirst({
      where: {
        employeeId: dto.employeeId,
        date: { gte: start, lt: end },
        clockIn: { not: null },
      },
      select: { id: true },
    });

    if (!attended) {
      throw new BadRequestException('This employee has no attendance record for the selected date.');
    }

    const deductFromSalary = dto.deductFromSalary ?? settings.salaryDeduct;
    let breakdown: MealBreakdown = dto.mealBreakdown ?? {};

    if (!Object.keys(breakdown).length) {
      const mealCount = Math.max(0, Math.floor(Number(dto.mealCount ?? 1)));
      const mealCost = Number(dto.mealCost ?? settings.defaultMealCost ?? 0);
      breakdown = { lunch: { count: mealCount, cost: mealCost } };
    }

    const summary = this.summarizeBreakdown(breakdown, deductFromSalary);
    const date = start;

    return this.prisma.canteenMealEntry.upsert({
      where: {
        employeeId_date: {
          employeeId: dto.employeeId,
          date,
        },
      },
      update: {
        mealCount: summary.mealCount,
        mealCost: summary.mealCost,
        mealBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        deductFromSalary,
        totalCost: summary.totalCost,
        notes: dto.notes?.trim() || null,
      },
      create: {
        tenantId,
        employeeId: dto.employeeId,
        date,
        mealCount: summary.mealCount,
        mealCost: summary.mealCost,
        mealBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        deductFromSalary,
        totalCost: summary.totalCost,
        notes: dto.notes?.trim() || null,
      },
      include: {
        employee: { include: { user: true } },
      },
    });
  }

  async autoGenerateEntries(date: string | undefined, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    if (!date) {
      throw new BadRequestException('Date is required.');
    }

    const settings = await this.getSettings(user);
    if (!settings.enabled) {
      throw new BadRequestException('Canteen tracking is disabled for this tenant.');
    }

    const eligible = await this.listEligibleEmployees(date, user);
    const breakdown = this.buildDefaultBreakdown(settings.mealTypes, settings.defaultMealCounts);
    if (!Object.keys(breakdown).length) {
      throw new BadRequestException('Configure at least one default meal count in canteen settings.');
    }

    const summary = this.summarizeBreakdown(breakdown, settings.salaryDeduct);
    const day = this.dayRange(date).start;
    let created = 0;
    let updated = 0;

    for (const employee of eligible) {
      const existing = await this.prisma.canteenMealEntry.findUnique({
        where: {
          employeeId_date: {
            employeeId: employee.id,
            date: day,
          },
        },
      });

      if (existing) {
        updated += 1;
        continue;
      }

      await this.prisma.canteenMealEntry.create({
        data: {
          tenantId,
          employeeId: employee.id,
          date: day,
          mealCount: summary.mealCount,
          mealCost: summary.mealCost,
          mealBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          deductFromSalary: settings.salaryDeduct,
          totalCost: summary.totalCost,
        },
      });
      created += 1;
    }

    return {
      date,
      eligibleCount: eligible.length,
      created,
      skippedExisting: updated,
    };
  }
}
