import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type InvitationEmailInput = {
  to: string;
  fullName: string;
  companyName: string;
  role: string;
  acceptUrl: string;
  expiresHours: number;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
    const brevoApiKey = this.config.get<string>('BREVO_API_KEY');
    const fromEmail = this.config.get<string>('MAIL_FROM', 'no-reply@flowhr.local');
    const fromName = this.config.get<string>('MAIL_FROM_NAME', 'FlowHR');

    if (!brevoApiKey) {
      this.logger.log(
        `Invitation email fallback (no provider configured): to=${input.to}, link=${input.acceptUrl}`,
      );
      return;
    }

    const htmlContent = `
      <p>Hello ${input.fullName},</p>
      <p>You have been invited to join <strong>${input.companyName}</strong> as <strong>${input.role}</strong>.</p>
      <p>Your invitation link:</p>
      <p><a href="${input.acceptUrl}">${input.acceptUrl}</a></p>
      <p>This link expires in ${input.expiresHours} hours and can be used only once.</p>
    `;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: input.to, name: input.fullName }],
        subject: `FlowHR invitation for ${input.companyName}`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Brevo send failed: status=${response.status}, body=${body}`);
      throw new Error('Failed to send invitation email.');
    }
  }
}