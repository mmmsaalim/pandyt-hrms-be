import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export type RateLimitOptions = {
  limit: number;
  ttlSeconds: number;
};

export const RateLimit = (limit: number, ttlSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, ttlSeconds } satisfies RateLimitOptions);
