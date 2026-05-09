import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { TenantsModule } from './tenants/tenants.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PayrollModule } from './payroll/payroll.module';
import { PayslipsModule } from './payslips/payslips.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { InvitationsModule } from './invitations/invitations.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    TenantsModule,
    EmployeesModule,
    LeaveModule,
    AttendanceModule,
    PayrollModule,
    PayslipsModule,
    RecruitmentModule,
    ReportsModule,
    DashboardModule,
    NotificationsModule,
    InvitationsModule,
  ],
  providers: [],
})
export class AppModule {}
