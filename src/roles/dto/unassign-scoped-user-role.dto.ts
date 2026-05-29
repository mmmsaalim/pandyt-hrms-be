import { IsInt } from 'class-validator';

export class UnassignScopedUserRoleDto {
  @IsInt()
  userId!: number;

  @IsInt()
  roleId!: number;
}