import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateLetterDto, SendLetterEmailDto, UpdateLetterDto } from './dto/create-letter.dto';
import { LettersService } from './letters.service';

type LetterRequestUser = {
  sub?: number;
  tenantId?: number | null;
  roles?: string[];
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('letters')
export class LettersController {
  constructor(private readonly lettersService: LettersService) {}

  private tenantId(req: { user?: LetterRequestUser }): number {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return tenantId;
  }

  private access(req: { user?: LetterRequestUser }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new ForbiddenException('User context required');
    }

    return {
      userId,
      roles: req.user?.roles ?? [],
    };
  }

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  list(@Req() req: { user?: LetterRequestUser }) {
    return this.lettersService.list(this.tenantId(req), this.access(req));
  }

  @Get(':id/print')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  printPayload(@Req() req: { user?: LetterRequestUser }, @Param('id') id: string) {
    return this.lettersService.getPrintPayload(this.tenantId(req), Number(id), this.access(req));
  }

  @Get(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  getOne(@Req() req: { user?: LetterRequestUser }, @Param('id') id: string) {
    return this.lettersService.getOne(this.tenantId(req), Number(id), this.access(req));
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  create(@Req() req: { user?: LetterRequestUser }, @Body() dto: CreateLetterDto) {
    return this.lettersService.create(this.tenantId(req), this.access(req).userId, dto);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  update(
    @Req() req: { user?: LetterRequestUser },
    @Param('id') id: string,
    @Body() dto: UpdateLetterDto,
  ) {
    return this.lettersService.update(this.tenantId(req), Number(id), dto, this.access(req));
  }

  @Post(':id/send')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  send(
    @Req() req: { user?: LetterRequestUser },
    @Param('id') id: string,
    @Body() dto: SendLetterEmailDto,
  ) {
    return this.lettersService.sendByEmail(this.tenantId(req), Number(id), dto, this.access(req));
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  remove(@Req() req: { user?: LetterRequestUser }, @Param('id') id: string) {
    return this.lettersService.remove(this.tenantId(req), Number(id), this.access(req));
  }
}
