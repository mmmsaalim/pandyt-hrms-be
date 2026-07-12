import { Global, Module } from '@nestjs/common';
import { AuditLogService } from '../common/audit-log.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimitService } from '../common/security/rate-limit.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AuditLogService, RateLimitService, RateLimitGuard],
  exports: [PrismaService, AuditLogService, RateLimitService, RateLimitGuard],
})
export class PrismaModule {}
