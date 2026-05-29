import { IsInt } from 'class-validator';

export class AssignUserRoleDto {
  @IsInt()
  userId!: number;

  @IsInt()
  roleId!: number;
}
