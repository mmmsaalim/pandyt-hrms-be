import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogData {
  userId: number;
  action: string;
  entity: string;
  entityId: number;
  tenantId?: number;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  statusCode?: number;
}

/**
 * Audit Log Service for compliance and security tracking
 * Logs all sensitive HR operations: salary changes, terminations, approvals, data exports
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a sensitive operation
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      // Sensitive operations that MUST be logged
      const sensitiveActions = [
        'employee.terminate',
        'employee.anonymize',
        'employee.export_data',
        'payroll.run',
        'payroll.process',
        'salary.view',
        'salary.update',
        'leave.approve',
        'leave.reject',
        'role.assign',
        'role.revoke',
        'user.login',
        'user.logout',
        'data_export',
      ];

      // Only log sensitive operations
      if (!sensitiveActions.includes(data.action)) {
        return;
      }

      // Insert audit log (create table if it doesn't exist yet)
      try {
        await this.prisma.$executeRawUnsafe(
          `
          INSERT INTO audit_logs (user_id, action, entity, entity_id, tenant_id, old_value, new_value, ip_address, status_code, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          `,
          data.userId || 0,
          data.action,
          data.entity,
          data.entityId || 0,
          data.tenantId || null,
          data.oldValue || null,
          data.newValue || null,
          data.ipAddress || 'unknown',
          data.statusCode || 200,
        );
      } catch (err) {
        // Log table may not exist in early phase; fail silently to not break app
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Audit log insert failed: ${errMsg}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Audit logging error: ${errMsg}`);
    }
  }

  /**
   * Retrieve audit logs for compliance review
   */
  async findByEntity(entity: string, entityId: number, limit = 100) {
    try {
      const logs = await this.prisma.$queryRawUnsafe(
        `
        SELECT * FROM audit_logs
        WHERE entity = $1 AND entity_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        entity,
        entityId,
        limit,
      );
      return logs;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Audit log query failed: ${errMsg}`);
      return [];
    }
  }

  /**
   * Retrieve audit logs for a tenant (admin compliance view)
   */
  async findByTenant(tenantId: number, action?: string, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let query = `
        SELECT * FROM audit_logs
        WHERE tenant_id = $1 AND created_at >= $2
      `;
      const params: any[] = [tenantId, startDate];

      if (action) {
        query += ` AND action = $3`;
        params.push(action);
      }

      query += ` ORDER BY created_at DESC LIMIT 1000`;

      const logs = await this.prisma.$queryRawUnsafe(query, ...params);
      return logs;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Audit log tenant query failed: ${errMsg}`);
      return [];
    }
  }
}

/**
 * Middleware to capture HTTP details for audit logging
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  constructor(private readonly auditService: AuditLogService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const originalSend = res.send;
    const auditService = this.auditService;

    res.send = function (data: any) {
      // Log response status for sensitive paths
      const sensitivePatterns = [
        '/auth/login',
        '/auth/logout',
        '/employees',
        '/payroll',
        '/leave',
        '/salary',
      ];

      const isSensitivePath = sensitivePatterns.some((p) => req.path.includes(p));
      if (isSensitivePath) {
        const userId = (req as any).user?.sub || 0;
        const ipAddress = req.ip || req.connection.remoteAddress;

        // Log only if not 200/404 (ignore normal reads)
        if (res.statusCode >= 400 || req.method !== 'GET') {
          auditService.log({
            userId,
            action: `http.${req.method.toLowerCase()}`,
            entity: 'http_request',
            entityId: 0,
            tenantId: (req as any).tenantId,
            statusCode: res.statusCode,
            ipAddress,
          });
        }
      }

      return originalSend.call(this, data);
    };

    next();
  }
}
