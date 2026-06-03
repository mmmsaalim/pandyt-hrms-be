import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  Response,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { PayslipsService } from './payslips.service';
import { PayslipsPdfService } from './payslips-pdf.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(
    private readonly payslipsService: PayslipsService,
    private readonly pdfService: PayslipsPdfService,
  ) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  findAll(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.payslipsService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreatePayslipDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.payslipsService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayslipDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.payslipsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.payslipsService.remove(id, req.user);
  }

  @Get(':id/pdf')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
    @Response() res: ExpressResponse,
  ) {
    const htmlContent = await this.pdfService.generatePayslipPdf(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${id}.html"`);
    res.send(htmlContent);
  }
}
