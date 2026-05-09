import { IsString } from 'class-validator';

export class AssignUserRoleDto {
  @IsString()
  userId!: string;

  @IsString()
  roleId!: string;
}
