import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RateLimitService } from '../security/rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    // Rate limiting is on in production by default and off elsewhere so local
    // testing (repeated logins across roles) is not blocked. Override with the
    // RATE_LIMIT_ENABLED env var ('true' / 'false') in any environment.
    if (!RateLimitGuard.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const key = `${ip}:${request.method}:${request.path}`;

    this.rateLimitService.consume(key, options.limit, options.ttlSeconds);
    return true;
  }

  private static isEnabled(): boolean {
    const flag = process.env.RATE_LIMIT_ENABLED;
    if (flag !== undefined) {
      return flag.trim().toLowerCase() === 'true';
    }
    return process.env.NODE_ENV === 'production';
  }
}
