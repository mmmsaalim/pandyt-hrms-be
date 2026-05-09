import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  findAll(@Req() req: { user?: { sub: string; roles?: string[] } }) {
    return this.payslipsService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreatePayslipDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.payslipsService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayslipDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.payslipsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.payslipsService.remove(id, req.user);
  }
}
