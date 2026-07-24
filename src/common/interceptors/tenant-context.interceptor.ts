import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from '../tenant-context';

type AuthedRequest = { user?: { tenantId?: number | null } };

/**
 * Establishes the AsyncLocalStorage tenant context consumed by
 * `prismaTenantExtension` strictly from the JWT-verified `request.user.tenantId`
 * (set by JwtStrategy/JwtAuthGuard), which runs before interceptors in the Nest
 * pipeline. Never derived from a client-supplied header — a request cannot
 * influence which tenant its own queries are scoped to.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const tenantId = request.user?.tenantId ?? null;

    return new Observable((subscriber) => {
      TenantContext.run(tenantId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
