import { APP_BRAND_NAME } from '../common/constants/app.constant';
import {
  SendAccountActivationEmailInput,
  SendBillingReminderEmailInput,
  SendInvitationEmailInput,
  SendOffboardingEmailInput,
  SendOnboardingEmailInput,
  SendOverduePaymentReminderEmailInput,
  SendPasswordResetEmailInput,
  SendTenantMessageEmailInput,
} from './email.types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseLayout(title: string, body: string): string {
  return `
    <div style="margin:0;background:#fff4eb;padding:32px 16px;font-family:Arial,sans-serif;color:#2a2623;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #f1d9c6;box-shadow:0 18px 48px rgba(92,48,16,0.16);">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#f89a55,#f47421);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.9;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${APP_BRAND_NAME}</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${title}</h1>
        </div>
        <div style="padding:32px;line-height:1.7;font-size:15px;color:#4d3c30;">${body}</div>
        <div style="padding:20px 32px;border-top:1px solid #f3e3d8;font-size:12px;color:#8f7563;">
          You received this message because your account is managed by ${APP_BRAND_NAME}. If you did not expect it, contact support.
        </div>
      </div>
    </div>
  `;
}

function button(url: string, label: string): string {
  return `
    <a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#f89a55,#f47421);color:#ffffff;text-decoration:none;font-weight:700;">
      ${label}
    </a>
  `;
}

export function buildOnboardingEmail(input: SendOnboardingEmailInput) {
  const subject = `Welcome to ${APP_BRAND_NAME} - complete your admin setup`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">Your company <strong>${input.companyName}</strong> has been created in ${APP_BRAND_NAME}. Set your password to activate the admin account and finish onboarding.</p>
      <div style="margin:24px 0;">${button(input.activationUrl, 'Set password')}</div>
      <p style="margin:0 0 8px;">Direct link:</p>
      <p style="margin:0 0 16px;word-break:break-all;"><a href="${input.activationUrl}">${input.activationUrl}</a></p>
      <p style="margin:0;">Once approval is completed, you can sign in here:</p>
      <p style="margin:8px 0 0;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Your company ${input.companyName} has been created in ${APP_BRAND_NAME}.`,
    `Set your password: ${input.activationUrl}`,
    `Login: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildInvitationEmail(input: SendInvitationEmailInput) {
  const subject = `Invitation to join ${input.companyName} on ${APP_BRAND_NAME}`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">You have been invited to join <strong>${input.companyName}</strong> as <strong>${input.role}</strong>.</p>
      <div style="margin:24px 0;">${button(input.acceptUrl, 'Accept invitation')}</div>
      <p style="margin:0 0 8px;">This link expires in ${input.expiresHours} hours and can be used only once.</p>
      <p style="margin:0;word-break:break-all;"><a href="${input.acceptUrl}">${input.acceptUrl}</a></p>
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `You have been invited to join ${input.companyName} as ${input.role}.`,
    `Accept invitation: ${input.acceptUrl}`,
    `Expires in ${input.expiresHours} hours.`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildPasswordResetEmail(input: SendPasswordResetEmailInput) {
  const subject = `Reset your ${APP_BRAND_NAME} password`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">We received a request to reset your password for your ${APP_BRAND_NAME} company workspace. Use the button below to choose a new password.</p>
      <div style="margin:24px 0;">${button(input.resetUrl, 'Reset password')}</div>
      <p style="margin:0 0 8px;">This link expires in ${input.expiresHours} hours.</p>
      <p style="margin:0;word-break:break-all;"><a href="${input.resetUrl}">${input.resetUrl}</a></p>
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Reset your password here: ${input.resetUrl}`,
    `Expires in ${input.expiresHours} hours.`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildAccountActivationEmail(input: SendAccountActivationEmailInput) {
  const subject = `${APP_BRAND_NAME} account activated for ${input.companyName}`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">Your account for <strong>${input.companyName}</strong> is now active.</p>
      <div style="margin:24px 0;">${button(input.loginUrl, 'Sign in')}</div>
      <p style="margin:0;">Login link:</p>
      <p style="margin:8px 0 0;word-break:break-all;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
      ${input.supportEmail ? `<p style="margin:16px 0 0;">Need help? Contact <a href="mailto:${input.supportEmail}">${input.supportEmail}</a>.</p>` : ''}
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Your account for ${input.companyName} is now active.`,
    `Login: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildOverduePaymentReminderEmail(input: SendOverduePaymentReminderEmailInput) {
  const amount = `LKR ${Math.round(input.totalDueLkr).toLocaleString('en-US')}`;
  const subject = `Payment reminder: ${input.companyName} account is overdue`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">Your company workspace <strong>${input.companyName}</strong> currently has an overdue payment.</p>
      <p style="margin:0 0 8px;"><strong>Amount due:</strong> ${amount}</p>
      <p style="margin:0 0 16px;"><strong>Renewal date:</strong> ${input.renewalDate}</p>
      <div style="margin:24px 0;">${button(input.loginUrl, 'Open billing dashboard')}</div>
      <p style="margin:0;">Sign in link:</p>
      <p style="margin:8px 0 0;word-break:break-all;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
      ${input.supportEmail ? `<p style="margin:16px 0 0;">Need help? Contact <a href="mailto:${input.supportEmail}">${input.supportEmail}</a>.</p>` : ''}
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `${input.companyName} currently has an overdue payment.`,
    `Amount due: ${amount}`,
    `Renewal date: ${input.renewalDate}`,
    `Sign in: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildBillingReminderEmail(input: SendBillingReminderEmailInput) {
  const amount = `LKR ${Math.round(input.totalDueLkr).toLocaleString('en-US')}`;
  const defaultSubject =
    input.daysLeft > 0
      ? `Billing reminder: ${input.companyName} payment due in ${input.daysLeft} day(s)`
      : `Billing reminder: ${input.companyName} payment is due today`;

  const replacementMap: Record<string, string> = {
    companyName: input.companyName,
    fullName: input.fullName,
    totalDue: amount,
    renewalDate: input.renewalDate,
    loginUrl: input.loginUrl,
    daysLeft: String(input.daysLeft),
  };

  const applyTemplate = (value: string) =>
    value.replace(/{{\s*(companyName|fullName|totalDue|renewalDate|loginUrl|daysLeft)\s*}}/g, (_, key) => {
      return replacementMap[key] ?? '';
    });

  const subject = input.subjectTemplate?.trim() ? applyTemplate(input.subjectTemplate) : defaultSubject;

  const bodyOverride = input.bodyTemplate?.trim() ? applyTemplate(input.bodyTemplate) : '';
  const defaultBody = `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">This is a reminder that your company workspace <strong>${input.companyName}</strong> has a billing payment due.</p>
      <p style="margin:0 0 8px;"><strong>Amount due:</strong> ${amount}</p>
      <p style="margin:0 0 16px;"><strong>Due date:</strong> ${input.renewalDate}</p>
      <div style="margin:24px 0;">${button(input.loginUrl, 'Open billing dashboard')}</div>
      <p style="margin:0;">Sign in link:</p>
      <p style="margin:8px 0 0;word-break:break-all;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
      ${input.supportEmail ? `<p style="margin:16px 0 0;">Need help? Contact <a href="mailto:${input.supportEmail}">${input.supportEmail}</a>.</p>` : ''}
    `;

  const html = baseLayout(subject, bodyOverride || defaultBody);
  const text = [
    `Hello ${input.fullName},`,
    `Billing reminder for ${input.companyName}.`,
    `Amount due: ${amount}`,
    `Due date: ${input.renewalDate}`,
    `Days left: ${input.daysLeft}`,
    `Sign in: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildTenantMessageEmail(input: SendTenantMessageEmailInput) {
  const subject = input.subject;
  const messageHtml = escapeHtml(input.message).replace(/\n/g, '<br />');
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">You have a new message from the ${APP_BRAND_NAME} team regarding <strong>${input.companyName}</strong>:</p>
      <div style="margin:0 0 20px;padding:14px 16px;background:#fff9f4;border-radius:10px;border:1px solid #f1d9c6;">${messageHtml}</div>
      <div style="margin:24px 0;">${button(input.loginUrl, 'Open your workspace')}</div>
      <p style="margin:0;">Sign in link:</p>
      <p style="margin:8px 0 0;word-break:break-all;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
      ${input.supportEmail ? `<p style="margin:16px 0 0;">Need help? Contact <a href="mailto:${input.supportEmail}">${input.supportEmail}</a>.</p>` : ''}
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Message regarding ${input.companyName}:`,
    input.message,
    `Sign in: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildOffboardingEmail(input: SendOffboardingEmailInput) {
  const subject = `Your ${input.companyName} HR account has been offboarded`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">Your employment with <strong>${input.companyName}</strong> has ended and your HR system login has been disabled.</p>
      <p style="margin:0 0 8px;"><strong>Reason provided:</strong></p>
      <p style="margin:0 0 16px;padding:12px 14px;background:#fff9f4;border-radius:10px;border:1px solid #f1d9c6;">${input.reason}</p>
      <p style="margin:0;">You will no longer receive payslips or be included in payroll runs. If you believe this is a mistake, contact your company HR team.</p>
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Your employment with ${input.companyName} has ended and your login has been disabled.`,
    `Reason: ${input.reason}`,
  ].join('\n\n');

  return { subject, html, text };
}
