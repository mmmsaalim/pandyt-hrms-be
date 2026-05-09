import { IsEmail } from 'class-validator';

export class ResendInvitationDto {
  @IsEmail()
  email!: string;
}
