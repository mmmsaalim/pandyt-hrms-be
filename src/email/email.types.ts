export type EmailProviderName = 'resend' | 'brevo' | 'smtp';

export type EmailRecipient = {
  email: string;
  name?: string;
};

export type EmailSendResult = {
  provider: EmailProviderName;
  messageId?: string;
};

export type EmailTemplateInput = {
  to: string;
  fullName?: string;
  companyName?: string;
  role?: string;
  actionUrl: string;
  secondaryUrl?: string;
  expiresHours?: number;
};

export type SendOnboardingEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  activationUrl: string;
  loginUrl: string;
};

export type SendInvitationEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  role: string;
  acceptUrl: string;
  expiresHours: number;
};

export type SendPasswordResetEmailInput = {
  to: string;
  fullName: string;
  resetUrl: string;
  expiresHours: number;
};

export type SendAccountActivationEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  loginUrl: string;
  supportEmail?: string;
};

export type SendOverduePaymentReminderEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  totalDueLkr: number;
  renewalDate: string;
  loginUrl: string;
  supportEmail?: string;
};

export type SendBillingReminderEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  totalDueLkr: number;
  renewalDate: string;
  loginUrl: string;
  daysLeft: number;
  subjectTemplate?: string;
  bodyTemplate?: string;
  supportEmail?: string;
};
