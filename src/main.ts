import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { TenantContext } from './common/tenant-context';
import { validateSecurityConfig } from './common/security/validate-security-config';

async function bootstrap() {
  validateSecurityConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://127.0.0.1:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const rawHeader = req.headers?.['x-tenant-id'];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const parsedTenantId = headerValue ? Number(headerValue) : null;
    const tenantId = Number.isFinite(parsedTenantId) ? parsedTenantId : null;

    TenantContext.run(tenantId, next);
  });

  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

bootstrap();
