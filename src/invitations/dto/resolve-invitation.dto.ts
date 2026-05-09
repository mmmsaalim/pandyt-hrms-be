import { IsString } from 'class-validator';

export class ResolveInvitationDto {
  @IsString()
  token!: string;
}