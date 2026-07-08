import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { EmailModule } from './email/email.module';
import { OrganisationModule } from './organisation/organisation.module';
import { CrossTenantReportsModule } from './cross-tenant-reports/cross-tenant-reports.module';
import { TenantConfigurationModule } from './tenant-configuration/tenant-configuration.module';
import { CanteenModule } from './canteen/canteen.module';
import { LettersModule } from './letters/letters.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    TenantsModule,
    TenantConfigurationModule,
    EmployeesModule,
    LeaveModule,
    AttendanceModule,
    PayrollModule,
    PayslipsModule,
    RecruitmentModule,
    ReportsModule,
    DashboardModule,
    EmailModule,
    InvitationsModule,
    OrganisationModule,
    CanteenModule,
    LettersModule,
    FeedbackModule,
    CrossTenantReportsModule,
  ],
  providers: [],
})
export class AppModule {}
