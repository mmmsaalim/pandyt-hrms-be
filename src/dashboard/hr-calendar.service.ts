import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpcomingBirthday {
  employeeId: number;
  name: string;
  date: string;
  daysUntil: number;
}

export interface UpcomingHoliday {
  name: string;
  date: string;
  daysUntil: number;
}

interface BirthdayCandidate {
  id: number;
  dateOfBirth: Date | null;
  user: { firstName: string | null; lastName: string | null } | null;
}

/**
 * Central place for "what's coming up on the calendar" queries (birthdays, public
 * holidays) so dashboard/leave/attendance features share one implementation
 * instead of each re-deriving next-occurrence date math.
 */
@Injectable()
export class HrCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getUpcomingBirthdays(
    tenantId: number,
    options: { excludeEmployeeId?: number; employeeIds?: number[]; daysAhead?: number } = {},
  ): Promise<UpcomingBirthday[]> {
    const { excludeEmployeeId, employeeIds, daysAhead = 30 } = options;

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dateOfBirth: { not: null },
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        dateOfBirth: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return this.buildUpcomingBirthdays(employees, daysAhead);
  }

  private buildUpcomingBirthdays(
    employees: BirthdayCandidate[],
    daysAhead: number,
    today: Date = new Date(),
  ): UpcomingBirthday[] {
    const referenceDate = new Date(today);
    referenceDate.setHours(0, 0, 0, 0);

    const upcoming: UpcomingBirthday[] = [];

    for (const employee of employees) {
      if (!employee.dateOfBirth) continue;

      const dob = new Date(employee.dateOfBirth);
      const nextBirthday = new Date(referenceDate.getFullYear(), dob.getMonth(), dob.getDate());

      if (nextBirthday < referenceDate) {
        nextBirthday.setFullYear(referenceDate.getFullYear() + 1);
      }

      const daysUntil = this.daysBetween(referenceDate, nextBirthday);
      if (daysUntil > daysAhead) continue;

      const name =
        `${employee.user?.firstName ?? ''} ${employee.user?.lastName ?? ''}`.trim() ||
        `Employee #${employee.id}`;

      upcoming.push({
        employeeId: employee.id,
        name,
        date: nextBirthday.toISOString().split('T')[0],
        daysUntil,
      });
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Upcoming public holidays for a tenant, read from the tenant-maintained
   * CompanyHoliday calendar (Attendance → Working calendar) — the same source
   * leave and payroll use, so there is a single source of truth. Recurring
   * holidays repeat by month/day each year; one-off holidays only show on their
   * exact future date. Admins update these in the UI, so no yearly code change.
   */
  async getUpcomingHolidays(
    tenantId: number,
    from: Date = new Date(),
    take = 5,
  ): Promise<UpcomingHoliday[]> {
    const referenceDate = new Date(from);
    referenceDate.setHours(0, 0, 0, 0);
    const year = referenceDate.getFullYear();

    const rows = await this.prisma.companyHoliday.findMany({
      where: { tenantId },
      select: { name: true, date: true, isRecurring: true },
    });

    const holidays = rows.map((holiday) => {
      const source = new Date(holiday.date);

      let occurrence: Date;
      if (holiday.isRecurring) {
        occurrence = new Date(year, source.getMonth(), source.getDate());
        if (occurrence < referenceDate) {
          occurrence = new Date(year + 1, source.getMonth(), source.getDate());
        }
      } else {
        occurrence = new Date(source);
        occurrence.setHours(0, 0, 0, 0);
      }

      return {
        name: holiday.name,
        date: occurrence.toISOString().split('T')[0],
        daysUntil: this.daysBetween(referenceDate, occurrence),
      };
    });

    return holidays
      .filter((holiday) => holiday.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, take);
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }
}
