const WEAK_SECRETS = new Set(['dev-secret', 'secret', 'jwt-secret', 'changeme', 'replace_with_strong_secret']);

export function validateSecurityConfig(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const secret = process.env.JWT_SECRET?.trim() ?? '';

  if (!secret || secret.length < 32 || WEAK_SECRETS.has(secret.toLowerCase())) {
    const message =
      'JWT_SECRET must be a unique random string with at least 32 characters. Update .env before production.';

    if (nodeEnv === 'production') {
      throw new Error(message);
    }

    console.warn(`[security] ${message}`);
  }

  if (nodeEnv === 'production' && !process.env.APP_URL?.startsWith('https://')) {
    console.warn('[security] APP_URL should use HTTPS in production.');
  }
}
