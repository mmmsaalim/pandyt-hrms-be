import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class CrossTenantReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaveSummary(tenantIds?: number[]) {
    const numericTenantIds = tenantIds?.map(id => Number(id)).filter(id => !isNaN(id));
    const employeeFilter = numericTenantIds?.length ? { tenantId: { in: numericTenantIds } } : {};
    const leaveRequests = await this.prisma.leaveRequest.findMany({
      where: { employee: employeeFilter },
      include: { employee: { select: { tenantId: true } } }
    });
    const tenants = await this.prisma.tenant.findMany({
      where: numericTenantIds?.length ? { id: { in: numericTenantIds } } : {},
      select: { id: true, name: true, companyCode: true },
    });
    const tenantMap = new Map(tenants.map(t => [t.id, t]));
    const result: { [key: number]: any } = {};
    for (const leave of leaveRequests) {
      const tId = leave.employee.tenantId;
      const tenantInfo = tenantMap.get(tId);
      if (!tenantInfo) continue;
      if (!result[tId]) {
        result[tId] = { 
            name: tenantInfo.name, 
            companyCode: tenantInfo.companyCode, 
            totalRequests: 0, 
            totalDays: 0, 
            statusBreakdown: { PENDING: 0, APPROVED: 0, REJECTED: 0 } 
        };
      }
      result[tId].totalRequests += 1;
      result[tId].totalDays += leave.days;
      result[tId].statusBreakdown[leave.status] = (result[tId].statusBreakdown[leave.status] || 0) + 1;
    }
    return Object.values(result);
  }

  async getAttendanceSummary(tenantIds?: number[]) {
    const numericTenantIds = tenantIds?.map(id => Number(id)).filter(id => !isNaN(id));
    const employeeFilter = numericTenantIds?.length ? { tenantId: { in: numericTenantIds } } : {};
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { employee: employeeFilter },
      include: { employee: { select: { tenantId: true } } }
    });
    const tenants = await this.prisma.tenant.findMany({
      where: numericTenantIds?.length ? { id: { in: numericTenantIds } } : {},
      select: { id: true, name: true, companyCode: true },
    });
    const tenantMap = new Map(tenants.map(t => [t.id, t]));
    const result: { [key: number]: any } = {};
    for (const record of attendanceRecords) {
      const tId = record.employee.tenantId;
      const tenantInfo = tenantMap.get(tId);
      if (!tenantInfo) continue;
      if (!result[tId]) {
        result[tId] = { name: tenantInfo.name, companyCode: tenantInfo.companyCode, totalEmployeesWithAttendance: new Set(), totalAttendanceRecords: 0, totalHours: 0 };
      }
      result[tId].totalEmployeesWithAttendance.add(record.employeeId);
      result[tId].totalAttendanceRecords += 1;
      result[tId].totalHours += record.hours;
    }
    return Object.values(result).map(r => ({ ...r, totalEmployeesWithAttendance: r.totalEmployeesWithAttendance.size }));
  }

  async getPayrollSummary(tenantIds?: number[]) {
    const numericTenantIds = tenantIds?.map(id => Number(id)).filter(id => !isNaN(id));
    const payrollSummary = await this.prisma.payrollRun.groupBy({
      by: ['tenantId'],
      where: numericTenantIds?.length ? { tenantId: { in: numericTenantIds } } : {},
      _count: { id: true },
      _sum: { grossAmount: true, netAmount: true },
    });
    const tenants = await this.prisma.tenant.findMany({
      where: numericTenantIds?.length ? { id: { in: numericTenantIds } } : {},
      select: { id: true, name: true, companyCode: true },
    });
    const tenantMap = new Map(tenants.map(t => [t.id, t]));
    return payrollSummary.map(summary => ({
      name: tenantMap.get(summary.tenantId)?.name || 'Unknown',
      companyCode: tenantMap.get(summary.tenantId)?.companyCode || 'N/A',
      totalPayrollRuns: summary._count.id,
      totalGrossAmount: summary._sum.grossAmount || 0,
      totalNetAmount: summary._sum.netAmount || 0,
    }));
  }

  // --- EXCEL LOGIC ---
  // Using 'any' cast to resolve the Buffer/ArrayBufferLike conflict
  private async workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as any);
  }

  async generateLeaveSummaryExcel(tenantIds?: number[]): Promise<Buffer> {
    const data = await this.getLeaveSummary(tenantIds);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leave Summary');
    worksheet.columns = [
      { header: 'Company Name', key: 'name', width: 25 },
      { header: 'Company Code', key: 'companyCode', width: 15 },
      { header: 'Requests', key: 'totalRequests', width: 15 },
      { header: 'Total Days', key: 'totalDays', width: 15 },
      { header: 'Pending', key: 'pending', width: 10 },
      { header: 'Approved', key: 'approved', width: 10 },
      { header: 'Rejected', key: 'rejected', width: 10 },
    ];
    data.forEach(item => {
      worksheet.addRow({
        ...item,
        pending: item.statusBreakdown.PENDING,
        approved: item.statusBreakdown.APPROVED,
        rejected: item.statusBreakdown.REJECTED
      });
    });
    return this.workbookToBuffer(workbook);
  }

  async generateAttendanceSummaryExcel(tenantIds?: number[]): Promise<Buffer> {
    const data = await this.getAttendanceSummary(tenantIds);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Summary');
    worksheet.columns = [
      { header: 'Company Name', key: 'name', width: 25 },
      { header: 'Company Code', key: 'companyCode', width: 15 },
      { header: 'Employees Count', key: 'totalEmployeesWithAttendance', width: 20 },
      { header: 'Records', key: 'totalAttendanceRecords', width: 15 },
      { header: 'Total Hours', key: 'totalHours', width: 15 },
    ];
    data.forEach(item => worksheet.addRow(item));
    return this.workbookToBuffer(workbook);
  }

  async generatePayrollSummaryExcel(tenantIds?: number[]): Promise<Buffer> {
    const data = await this.getPayrollSummary(tenantIds);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payroll Summary');
    worksheet.columns = [
      { header: 'Company Name', key: 'name', width: 25 },
      { header: 'Company Code', key: 'companyCode', width: 15 },
      { header: 'Runs', key: 'totalPayrollRuns', width: 15 },
      { header: 'Gross Amount', key: 'totalGrossAmount', width: 20 },
      { header: 'Net Amount', key: 'totalNetAmount', width: 20 },
    ];
    data.forEach(item => worksheet.addRow(item));
    return this.workbookToBuffer(workbook);
  }
}