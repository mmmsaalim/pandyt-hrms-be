import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { ResolveInvitationDto } from './dto/resolve-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ResendInvitationDto } from './dto/resend-invitation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // Public endpoints — no auth required
  @Get('resolve')
  resolve(@Query() query: ResolveInvitationDto) {
    return this.invitationsService.resolveByToken(query.token);
  }

  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(dto.token, dto.password);
  }

  // Protected endpoints
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  @Get()
  list(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.invitationsService.listInvitations(req.user!);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  @Post('resend')
  resend(
    @Body() dto: ResendInvitationDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.invitationsService.resendInvitation(dto.email, req.user!);
  }
}