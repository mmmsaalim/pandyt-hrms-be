import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SL_STATUTORY_LABELS } from '../payroll/sri-lanka-statutory.constants';

@Injectable()
export class PayslipsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate payslip PDF as HTML or PDF bytes
   * In production, integrate with pdfkit or puppeteer
   */
  async generatePayslipPdf(payslipId: number) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        employee: {
          include: {
            user: true,
            tenant: true,
          },
        },
        payrollRun: true,
      },
    });

    if (!payslip) {
      throw new Error('Payslip not found');
    }

    const { employee, payrollRun } = payslip;
    const company = employee.tenant;

    // Simple HTML template for PDF generation
    const htmlContent = this.buildPayslipHtml({
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      department: employee.department,
      designation: employee.designation,
      payPeriod: payrollRun.period,
      basicPay: payslip.basicPay,
      allowances: payslip.allowances,
      grossPay: payslip.grossPay,
      epfEmployee: payslip.epfEmployee,
      payeTax: payslip.payeTax,
      deductions: payslip.deductions,
      netPay: payslip.netPay,
      epfEmployer: payslip.epfEmployer,
      etfEmployer: payslip.etfEmployer,
      companyName: company.name,
    });

    return htmlContent;
  }

  private buildPayslipHtml(data: {
    employeeName: string;
    employeeCode: string;
    department: string;
    designation: string;
    payPeriod: string;
    basicPay: number;
    allowances: number;
    grossPay: number;
    epfEmployee: number;
    payeTax: number;
    deductions: number;
    netPay: number;
    epfEmployer: number;
    etfEmployer: number;
    companyName: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payslip - ${data.employeeCode}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; }
    .payslip-period { font-size: 14px; color: #666; margin-top: 10px; }
    .employee-info { margin-bottom: 20px; }
    .employee-info div { margin: 5px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
    th { background-color: #f5f5f5; font-weight: bold; }
    .label { text-align: left; }
    .section-header { background-color: #e8e8e8; font-weight: bold; }
    .total-row { background-color: #f0f0f0; font-weight: bold; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${data.companyName}</div>
    <div class="payslip-period">Payslip for ${data.payPeriod}</div>
  </div>

  <div class="employee-info">
    <div><strong>Employee:</strong> ${data.employeeName}</div>
    <div><strong>ID:</strong> ${data.employeeCode}</div>
    <div><strong>Department:</strong> ${data.department}</div>
    <div><strong>Designation:</strong> ${data.designation}</div>
  </div>

  <table>
    <tr class="section-header">
      <td class="label">EARNINGS</td>
      <td>Amount (LKR)</td>
    </tr>
    <tr>
      <td class="label">Basic Pay</td>
      <td>${data.basicPay.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="label">Allowances</td>
      <td>${data.allowances.toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td class="label">Gross Pay</td>
      <td>${data.grossPay.toFixed(2)}</td>
    </tr>

    <tr class="section-header">
      <td class="label">${SL_STATUTORY_LABELS.employeeDeductions.toUpperCase()}</td>
      <td>Amount (LKR)</td>
    </tr>
    <tr>
      <td class="label">${SL_STATUTORY_LABELS.epfEmployee}</td>
      <td>${data.epfEmployee.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="label">PAYE Tax</td>
      <td>${data.payeTax.toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td class="label">Total Deductions</td>
      <td>${data.deductions.toFixed(2)}</td>
    </tr>

    <tr class="total-row">
      <td class="label">NET PAY</td>
      <td>${data.netPay.toFixed(2)}</td>
    </tr>
  </table>

  <table>
    <tr class="section-header">
      <td class="label">${SL_STATUTORY_LABELS.employerContributions}</td>
      <td>Amount (LKR)</td>
    </tr>
    <tr>
      <td class="label">${SL_STATUTORY_LABELS.epfEmployer}</td>
      <td>${data.epfEmployer.toFixed(2)}</td>
    </tr>
    <tr>
      <td class="label">${SL_STATUTORY_LABELS.etfEmployer}</td>
      <td>${data.etfEmployer.toFixed(2)}</td>
    </tr>
  </table>

  <div class="footer">
    <p>This is a system-generated payslip. No signature required.</p>
  </div>
</body>
</html>
    `;
  }
}
