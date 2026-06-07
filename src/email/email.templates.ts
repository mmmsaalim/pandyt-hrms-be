import {
  SendAccountActivationEmailInput,
  SendInvitationEmailInput,
  SendOnboardingEmailInput,
  SendPasswordResetEmailInput,
} from './email.types';

const brand = 'FlowHR';

function baseLayout(title: string, body: string): string {
  return `
    <div style="margin:0;background:#0f172a;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 18px 50px rgba(15,23,42,0.18);">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.8;">${brand}</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${title}</h1>
        </div>
        <div style="padding:32px;line-height:1.7;font-size:15px;color:#334155;">${body}</div>
        <div style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">
          You received this message because your account is managed by ${brand}. If you did not expect it, contact support.
        </div>
      </div>
    </div>
  `;
}

function button(url: string, label: string): string {
  return `
    <a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
      ${label}
    </a>
  `;
}

export function buildOnboardingEmail(input: SendOnboardingEmailInput) {
  const subject = `Welcome to ${brand} - complete your admin setup`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">Your company <strong>${input.companyName}</strong> has been created in ${brand}. Set your password to activate the admin account and finish onboarding.</p>
      <div style="margin:24px 0;">${button(input.activationUrl, 'Set password')}</div>
      <p style="margin:0 0 8px;">Direct link:</p>
      <p style="margin:0 0 16px;word-break:break-all;"><a href="${input.activationUrl}">${input.activationUrl}</a></p>
      <p style="margin:0;">Once approval is completed, you can sign in here:</p>
      <p style="margin:8px 0 0;"><a href="${input.loginUrl}">${input.loginUrl}</a></p>
    `,
  );

  const text = [
    `Hello ${input.fullName},`,
    `Your company ${input.companyName} has been created in ${brand}.`,
    `Set your password: ${input.activationUrl}`,
    `Login: ${input.loginUrl}`,
  ].join('\n\n');

  return { subject, html, text };
}

export function buildInvitationEmail(input: SendInvitationEmailInput) {
  const subject = `Invitation to join ${input.companyName} on ${brand}`;
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
  const subject = `Reset your ${brand} password`;
  const html = baseLayout(
    subject,
    `
      <p style="margin:0 0 16px;">Hello ${input.fullName},</p>
      <p style="margin:0 0 16px;">We received a request to reset your password. Use the button below to choose a new password.</p>
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
  const subject = `${brand} account activated for ${input.companyName}`;
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
