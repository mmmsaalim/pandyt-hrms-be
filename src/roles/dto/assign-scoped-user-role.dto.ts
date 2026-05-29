import { IsInt } from 'class-validator';

export class AssignScopedUserRoleDto {
  @IsInt()
  userId!: number;

  @IsInt()
  roleId!: number;
}
