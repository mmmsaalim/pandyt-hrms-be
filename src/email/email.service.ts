import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { APP_BRAND_NAME, APP_BRAND_EMAIL_DOMAIN } from '../common/constants/app.constant';
import {
  buildAccountActivationEmail,
  buildBillingReminderEmail,
  buildInvitationEmail,
  buildOnboardingEmail,
  buildOverduePaymentReminderEmail,
  buildPasswordResetEmail,
  buildOffboardingEmail,
} from './email.templates';
import {
  EmailProviderName,
  SendAccountActivationEmailInput,
  SendBillingReminderEmailInput,
  SendInvitationEmailInput,
  SendOffboardingEmailInput,
  SendOnboardingEmailInput,
  SendOverduePaymentReminderEmailInput,
  SendPasswordResetEmailInput,
} from './email.types';

type BrevoPayload = {
  sender: { email: string; name: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend?: Resend;
  private readonly smtpTransport?: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const resendKey = this.config.get<string>('RESEND_API_KEY');
    if (resendKey) {
      this.resend = new Resend(resendKey);
    }

    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = Number(this.config.get<string>('SMTP_PORT', '587'));
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass && Number.isFinite(smtpPort)) {
      this.smtpTransport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    }
  }

  private fromEmail(): string {
    return this.config.get<string>('MAIL_FROM')
      ?? this.config.get<string>('EMAIL_FROM')
      ?? `no-reply@${APP_BRAND_EMAIL_DOMAIN}`;
  }

  private fromName(): string {
    return this.config.get<string>('MAIL_FROM_NAME') ?? APP_BRAND_NAME;
  }

  private configuredProvider(): EmailProviderName | 'auto' {
    const configured = this.config.get<string>('EMAIL_PROVIDER', 'auto').toLowerCase();
    if (configured === 'smtp') {
      return 'smtp';
    }

    if (configured === 'brevo') {
      return 'brevo';
    }

    if (configured === 'resend') {
      return 'resend';
    }

    return 'auto';
  }

  private resolveProvider(): EmailProviderName | null {
    const configured = this.configuredProvider();

    if (configured === 'resend') {
      if (this.supportsProvider('resend')) {
        return 'resend';
      }

      if (this.supportsProvider('brevo')) {
        return 'brevo';
      }

      return this.supportsProvider('smtp') ? 'smtp' : null;
    }

    if (configured === 'brevo') {
      if (this.supportsProvider('brevo')) {
        return 'brevo';
      }

      if (this.supportsProvider('resend')) {
        return 'resend';
      }

      return this.supportsProvider('smtp') ? 'smtp' : null;
    }

    if (configured === 'smtp') {
      if (this.supportsProvider('smtp')) {
        return 'smtp';
      }

      if (this.supportsProvider('resend')) {
        return 'resend';
      }

      return this.supportsProvider('brevo') ? 'brevo' : null;
    }

    if (this.supportsProvider('resend')) {
      return 'resend';
    }

    if (this.supportsProvider('brevo')) {
      return 'brevo';
    }

    if (this.supportsProvider('smtp')) {
      return 'smtp';
    }

    return null;
  }

  private supportsProvider(provider: EmailProviderName): boolean {
    if (provider === 'resend') {
      return !!this.config.get<string>('RESEND_API_KEY');
    }

    if (provider === 'brevo') {
      return !!this.config.get<string>('BREVO_API_KEY');
    }

    return !!this.smtpTransport;
  }

  private shouldFailFast(): boolean {
    return this.config.get<string>('EMAIL_FAIL_FAST', 'true') !== 'false';
  }

  private async sendViaResend(to: string, subject: string, html: string, text?: string) {
    if (!this.resend) {
      throw new Error('Resend is not configured.');
    }

    const response = await this.resend.emails.send({
      from: `${this.fromName()} <${this.fromEmail()}>`,
      to,
      subject,
      html,
      text,
    });

    return { provider: 'resend' as const, messageId: response.data?.id };
  }

  private async sendViaBrevo(to: string, subject: string, html: string, text?: string) {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('Brevo is not configured.');
    }

    const payload: BrevoPayload = {
      sender: { email: this.fromEmail(), name: this.fromName() },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo send failed with status ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { messageId?: string };
    return { provider: 'brevo' as const, messageId: data.messageId };
  }

  private async sendViaSmtp(to: string, subject: string, html: string, text?: string) {
    if (!this.smtpTransport) {
      throw new Error('SMTP is not configured.');
    }

    const info = await this.smtpTransport.sendMail({
      from: `${this.fromName()} <${this.fromEmail()}>`,
      to,
      subject,
      html,
      text,
    });

    return { provider: 'smtp' as const, messageId: info.messageId };
  }

  private async dispatchEmail(subject: string, html: string, text: string | undefined, to: string) {
    const provider = this.resolveProvider();
    if (!provider) {
      const message = 'No email provider is configured.';
      if (this.shouldFailFast()) {
        throw new Error(message);
      }

      this.logger.warn(`${message} Skipping email to ${to}.`);
      return { provider: 'smtp' as const };
    }

    try {
      const result = provider === 'resend'
        ? await this.sendViaResend(to, subject, html, text)
        : provider === 'brevo'
          ? await this.sendViaBrevo(to, subject, html, text)
          : await this.sendViaSmtp(to, subject, html, text);

      this.logger.log(`Email sent via ${result.provider} to ${to}${result.messageId ? ` messageId=${result.messageId}` : ''}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email failure.';
      if (!this.shouldFailFast()) {
        this.logger.warn(`Email delivery failed for ${to}: ${message}. Continuing because EMAIL_FAIL_FAST=false.`);
        return { provider };
      }

      this.logger.error(`Email delivery failed for ${to}: ${message}`);
      throw new BadGatewayException('Unable to send email right now.');
    }
  }

  async sendOnboardingEmail(input: SendOnboardingEmailInput) {
    const template = buildOnboardingEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendInvitationEmail(input: SendInvitationEmailInput) {
    const template = buildInvitationEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput) {
    const template = buildPasswordResetEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendAccountActivationEmail(input: SendAccountActivationEmailInput) {
    const template = buildAccountActivationEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendOverduePaymentReminderEmail(input: SendOverduePaymentReminderEmailInput) {
    const template = buildOverduePaymentReminderEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendBillingReminderEmail(input: SendBillingReminderEmailInput) {
    const template = buildBillingReminderEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }

  async sendOffboardingEmail(input: SendOffboardingEmailInput) {
    const template = buildOffboardingEmail(input);
    return this.dispatchEmail(template.subject, template.html, template.text, input.to);
  }
}
