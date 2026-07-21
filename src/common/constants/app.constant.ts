/**
 * Application-wide constants for Pandyt HRMS branding and configuration.
 * Single source of truth for product name and branding across all modules.
 */

export const APP_BRAND_NAME = 'Pandyt HRMS';
export const APP_BRAND_EMAIL_DOMAIN = 'pandyt.local';
export const APP_BRAND_SUPPORT_EMAIL = process.env.MAIL_SUPPORT_EMAIL || 'support@pandyt.local';
