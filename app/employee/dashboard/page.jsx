// app/employee/dashboard/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Modal from "@/components/ui/Modal";
import EmployeeProfileEdit from "@/components/employees/EmployeeProfileEdit";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/components/ui/AutoLogoutWarning";

// Convert number to words (for amount in words)
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  if (num < 20) return ones[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 100000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    return numberToWords(thousand) + ' Thousand' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 10000000) {
    const lakh = Math.floor(num / 100000);
    const remainder = num % 100000;
    return numberToWords(lakh) + ' Lakh' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  const crore = Math.floor(num / 10000000);
  const remainder = num % 10000000;
  return numberToWords(crore) + ' Crore' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
}


// Salary Slip Component
function SalarySlipModal({ isOpen, onClose, employeeData, month, loading }) {
  const { colors, theme } = useTheme();
  if (!isOpen) return null;
  
  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '40px',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '16px', color: '#374151', marginBottom: '10px' }}>
            Loading Salary Slip...
          </div>
        </div>
      </div>
    );
  }

  if (!employeeData) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '40px',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <div style={{ fontSize: '16px', color: '#dc2626', marginBottom: '20px' }}>
            Salary slip data not available for this month.
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getMonthName = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  const handlePrint = async () => {
    try {
      // Dynamically import html2pdf.js for PDF generation
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      
      // Get the slip content
      const slipContent = document.querySelector('.salary-slip-container');
      if (!slipContent) {
        alert('Salary slip content not found');
        return;
      }

      // Hide action buttons temporarily
      const actions = slipContent.querySelector('.salary-slip-actions');
      const originalDisplay = actions ? actions.style.display : '';
      if (actions) {
        actions.style.display = 'none';
      }

      // Wait a bit for DOM to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get employee name for filename (sanitize for filename - replace spaces and special chars)
      const employeeName = (employeeData.name || 'Employee').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const monthName = getMonthName(month);
      const year = month?.split('-')[0];
      const filename = `Salary_Slip_${employeeName}_${monthName}_${year}.pdf`;

      // Configure PDF options
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { 
          unit: 'cm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // Generate and download PDF directly from the visible container
      await html2pdf().set(opt).from(slipContent).save();
      
      // Restore action buttons
      if (actions) {
        actions.style.display = originalDisplay || '';
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      // Restore action buttons in case of error
      const actions = document.querySelector('.salary-slip-actions');
      if (actions) {
        actions.style.display = '';
      }
      // Fallback to print dialog
      alert('PDF generation failed. Opening print dialog instead.');
      window.print();
    }
  };

  const grossSalary = employeeData.monthlySalary || 0;
  const netSalary = employeeData.netSalary || 0;
  const deductionAmount = employeeData.salaryDeductAmount || 0;
  const deductionDays = employeeData.salaryDeductDays || 0;

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .salary-slip-container,
          .salary-slip-container * {
            visibility: visible;
          }
          .salary-slip-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            max-height: 100%;
            background: white;
            padding: 20px;
            overflow: visible;
            box-shadow: none;
            border-radius: 0;
          }
          .salary-slip-actions {
            display: none !important;
          }
          @page {
            margin: 0.5cm;
            size: A4;
          }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.75)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '15px',
          overflow: 'hidden',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="salary-slip-container"
          style={{
            backgroundColor: colors.background.card,
            width: '100%',
            maxWidth: 'min(90vw, 650px)',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: colors.card.shadow,
            border: `1px solid ${colors.border.default}`,
            position: 'relative',
            maxHeight: '95vh',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Actions - Compact and Responsive */}
          <div className="salary-slip-actions" style={{ 
            marginBottom: '12px', 
            display: 'flex', 
            gap: '8px', 
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                boxShadow: `0 4px 12px ${colors.primary[500]}40`,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 6px 16px ${colors.primary[500]}60`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary[500]}40`;
              }}
            >
              📄 Download PDF
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.background.tertiary,
                color: colors.text.primary,
                border: `1px solid ${colors.border.default}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.background.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.background.tertiary;
              }}
            >
              Close
            </button>
          </div>

          {/* Salary Slip Content */}
          <div style={{ fontFamily: 'Arial, sans-serif', color: colors.text.primary, backgroundColor: colors.background.card }}>
            {/* Company Header with Logo (like dashboard) - Extra Compact & Responsive */}
            <div className="header-section" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '10px 12px',
              marginBottom: '12px',
              borderRadius: '8px',
              background: colors.gradient.primary,
              color: '#f9fafb',
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <div className="header-logo" style={{
                  width: 48,
                  height: 48,
                  borderRadius: '999px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(15,23,42,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 15px rgba(15,23,42,0.6)',
                  flexShrink: 0,
                }}>
                  <img
                    src="/gds.png"
                    alt="Global Digital Solutions logo"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="header-text" style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 'clamp(13px, 2vw, 15px)',
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    marginBottom: '2px',
                  }}>
                    Global Digital Solutions
                  </div>
                  <div style={{
                    fontSize: 'clamp(9px, 1.5vw, 10px)',
                    opacity: 0.9,
                  }}>
                    Salary Slip
                  </div>
                </div>
              </div>
              <div className="payslip-title" style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  Payslip For the Month
                </div>
                <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 500, color: '#ffffff', marginTop: '2px' }}>
                  {getMonthName(month)} {month?.split('-')[0]}
                </div>
              </div>
            </div>

            {/* Employee Pay Summary - Extra Compact & Responsive */}
            <div className="pay-summary" style={{ marginBottom: '12px', padding: '10px', backgroundColor: colors.background.secondary, borderRadius: '6px', border: `1px solid ${colors.border.default}` }}>
              <h3 style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', fontWeight: 600, color: colors.text.primary, marginBottom: '8px' }}>
                Employee Pay Summary *
              </h3>
              <div className="pay-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div>
                  <div className="pay-field" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: colors.text.tertiary, display: 'block', marginBottom: '2px' }}>
                      Employee Name :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      fontWeight: 600,
                      color: colors.text.primary,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {employeeData.name || 'N/A'}
                    </div>
                  </div>
                  <div className="pay-field" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                      Pay Period :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      color: colors.text.primary,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {getMonthName(month)} {month?.split('-')[0]}
                    </div>
                  </div>
                  <div className="pay-field">
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                      Loss of Pay Days :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      fontWeight: 600,
                      color: colors.error,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {deductionDays.toFixed(3)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="pay-field" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                      Employee ID :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      fontWeight: 600,
                      color: colors.text.primary,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {employeeData.empCode || 'N/A'}
                    </div>
                  </div>
                  <div className="pay-field" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                      Paid Days :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      fontWeight: 600,
                      color: colors.success,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {(30 - deductionDays).toFixed(0)}
                    </div>
                  </div>
                  <div className="pay-field">
                    <label style={{ fontSize: 'clamp(8px, 1.2vw, 9px)', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                      Pay Date :
                    </label>
                    <div style={{ 
                      fontSize: 'clamp(9px, 1.3vw, 10px)', 
                      color: colors.text.primary,
                      paddingBottom: '2px',
                      borderBottom: `1px dashed ${colors.border.default}`
                    }}>
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Income Details Table - Extra Compact & Responsive */}
            <div style={{ marginBottom: '12px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                Income Details *
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'clamp(9px, 1.2vw, 10px)', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', minWidth: '400px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ padding: '5px', textAlign: 'left', fontWeight: 600, color: '#111827', borderRight: '1px solid #e5e7eb', width: '40%', fontSize: 'clamp(8px, 1.1vw, 9px)' }}>Earnings</th>
                    <th style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: '#111827', borderRight: '1px solid #e5e7eb', width: '20%', fontSize: 'clamp(8px, 1.1vw, 9px)' }}>Amount</th>
                    <th style={{ padding: '5px', textAlign: 'left', fontWeight: 600, color: '#111827', borderRight: '1px solid #e5e7eb', width: '40%', fontSize: 'clamp(8px, 1.1vw, 9px)' }}>Deductions</th>
                    <th style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: '#111827', width: '20%', fontSize: 'clamp(8px, 1.1vw, 9px)' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '5px', color: '#374151', borderRight: '1px solid #e5e7eb', fontSize: 'clamp(9px, 1.2vw, 10px)' }}>Basic</td>
                    <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: '#111827', borderRight: '1px solid #e5e7eb', fontSize: 'clamp(9px, 1.2vw, 10px)' }}>
                      {formatCurrency(grossSalary)}
                    </td>
                    <td style={{ padding: '5px', color: '#374151', borderRight: '1px solid #e5e7eb', fontSize: 'clamp(9px, 1.2vw, 10px)' }}>
                      Salary Deductions
                      {deductionDays > 0 && (
                        <div style={{ fontSize: 'clamp(7px, 1vw, 8px)', color: '#6b7280', marginTop: '1px' }}>
                          ({deductionDays.toFixed(3)} days)
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: '#dc2626', fontSize: 'clamp(9px, 1.2vw, 10px)' }}>
                      {formatCurrency(deductionAmount)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb' }}>
                    <td style={{ padding: '6px', fontWeight: 700, fontSize: 'clamp(10px, 1.3vw, 11px)', color: '#111827', borderRight: '1px solid #e5e7eb' }}>Gross Earnings</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontSize: 'clamp(10px, 1.3vw, 11px)', color: '#111827', borderRight: '1px solid #e5e7eb' }}>
                      {formatCurrency(grossSalary)}
                    </td>
                    <td style={{ padding: '6px', fontWeight: 700, fontSize: 'clamp(10px, 1.3vw, 11px)', color: '#111827', borderRight: '1px solid #e5e7eb' }}>Total Deductions</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontSize: 'clamp(10px, 1.3vw, 11px)', color: '#dc2626' }}>
                      {formatCurrency(deductionAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Net Payable - Extra Compact & Responsive with portal colors */}
            <div className="net-payable" style={{ 
              marginBottom: '12px', 
              padding: '12px', 
                background: colors.gradient.primary,
              borderRadius: '8px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 'clamp(11px, 1.5vw, 12px)', fontWeight: 700, color: '#ffffff', marginBottom: '3px' }}>
                    Total Net Payable
                  </h3>
                  <div style={{ fontSize: 'clamp(9px, 1.2vw, 10px)', color: '#e0e7ff', opacity: 0.9 }}>
                    Gross Earnings - Total Deductions
                  </div>
                </div>
                <div className="amount" style={{ fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 800, color: '#ffffff', flexShrink: 0 }}>
                  {formatCurrency(netSalary)}
                </div>
              </div>
              <div className="amount-words" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ fontSize: 'clamp(8px, 1.1vw, 9px)', color: '#e0e7ff', marginBottom: '2px' }}>Amount in words:</div>
                <div style={{ fontSize: 'clamp(9px, 1.2vw, 10px)', fontWeight: 600, color: '#ffffff', fontStyle: 'italic', wordBreak: 'break-word' }}>
                  {numberToWords(Math.floor(netSalary))} Rupees Only
                </div>
              </div>
            </div>

            {/* Footer - Ultra Compact */}
            <div className="footer" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '2px solid #e5e7eb', textAlign: 'center', fontSize: '9px', color: '#6b7280' }}>
              {/* <p style={{ margin: '2px 0' }}>This is a computer-generated document and does not require a signature.</p> */}
              <p style={{ margin: '2px 0' }}>For queries, please contact HR Department.</p>
              <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: '#111827', fontSize: '10px' }}>
                Global Digital Solutions - Confidential Document
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// --------- SHARED HELPERS ----------

function formatTimeShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// same style as HR monthly screen (integer → "1", decimal → "1.007")
function formatSalaryDays(value) {
  if (value == null) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(3);
}

// CLASSIFY CELL LIKE MONTHLY HR COLORS / STATUSES
function classifyDayForRow(day, colors, theme = 'dark') {
  const base = {
    bg: colors.background.table.row,
    fg: colors.text.table.cell,
    badge: undefined,
    tone: "default",
  };
  if (!day) return base;

  const isLeaveType =
    day.status === "Paid Leave" ||
    day.status === "Un Paid Leave" ||
    day.status === "Sick Leave";

  // WFH
  if (day.status === "Work From Home") {
    return { 
      bg: theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe', 
      fg: theme === 'dark' ? colors.primary[300] : colors.primary[800], 
      badge: "WFH", 
      tone: "info" 
    };
  }

  // No punches at all
  if (!day.checkIn && !day.checkOut) {
    if (day.status === "Holiday") {
      return { 
        bg: colors.background.tertiary, 
        fg: colors.text.tertiary, 
        badge: "Holiday", 
        tone: "muted" 
      };
    }
    if (isLeaveType) {
      return {
        bg: theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : '#fef9c3',
        fg: theme === 'dark' ? colors.warning : '#92400e',
        badge: day.status,
        tone: "leave",
      };
    }
    if (day.status === "Absent") {
      return {
        bg: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
        fg: theme === 'dark' ? colors.error : '#991b1b',
        badge: "Absent",
        tone: "danger",
      };
    }
    if (day.status === "New Induction") {
      return {
        bg: colors.background.table.row,
        fg: colors.text.table.cell,
        badge: "New",
        tone: "info",
      };
    }
    // generic no-punch
    return { bg: colors.background.tertiary, fg: colors.text.tertiary, tone: "muted" };
  }

  // Partial punches
  const isPartial =
    (day.checkIn && !day.checkOut) || (!day.checkIn && day.checkOut);
  if (isPartial) {
    return {
      bg: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
      fg: theme === 'dark' ? colors.error : '#991b1b',
      badge: "Partial",
      tone: "danger",
    };
  }

  // Normal punches + late/early handling
  const hasViolation = (day.late || day.earlyLeave) && !day.excused;
  if (hasViolation) {
    return {
      bg: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
      fg: theme === 'dark' ? colors.error : '#991b1b',
      badge: "Late/Early",
      tone: "danger",
    };
  }

  if (day.excused && (day.late || day.earlyLeave)) {
    return {
      bg: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
      fg: theme === 'dark' ? colors.success : '#166534',
      badge: "Excused",
      tone: "excused",
    };
  }

  // On-time
  return { 
    bg: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7', 
    fg: theme === 'dark' ? colors.success : '#166534', 
    badge: "On time", 
    tone: "ok" 
  };
}

function renderEmployeeAvatar(emp, size = 88) {
  // Handle base64 images - they need data URI prefix
  let src = "";
  if (emp?.profileImageUrl) {
    src = emp.profileImageUrl;
  } else if (emp?.profileImageBase64) {
    // If it already has data: prefix, use it as is, otherwise add it
    if (emp.profileImageBase64.startsWith('data:')) {
      src = emp.profileImageBase64;
    } else {
      // Assume JPEG format, add data URI prefix
      src = `data:image/jpeg;base64,${emp.profileImageBase64}`;
    }
  }
  
  const initials =
    (emp?.name || "")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  if (src) {
    return (
      <img
        src={src}
        alt={emp?.name || emp?.empCode || "Employee"}
        onError={(e) => {
          // If image fails to load, fallback to initials
          e.target.style.display = 'none';
          if (e.target.nextSibling) {
            e.target.nextSibling.style.display = 'flex';
          }
        }}
        style={{
          width: size,
          height: size,
          borderRadius: "999px",
          objectFit: "cover",
          border: "2px solid rgba(148,163,184,0.7)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
          display: "block",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "999px",
        background: "linear-gradient(135deg, #2563eb, #38bdf8)",
        color: "#f9fafb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
      }}
    >
      {initials}
    </div>
  );
}

function SummaryItem({ label, value, color, hint }) {
  const { colors } = useTheme();
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "10px 12px",
        backgroundColor: colors.background.card,
        border: `1px solid ${colors.border.default}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 4,
        minHeight: 72,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: colors.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: color || colors.text.primary,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: "#6b7280",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// --------------- PAGE -----------------

export default function EmployeeDashboardPage() {
  // ALL HOOKS MUST BE CALLED FIRST
  const { colors, theme } = useTheme(); // Theme colors
  const router = useRouter();
  const { data: session, status } = useSession();

  // Auto logout after 30 minutes of inactivity (with 5 minute warning)
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // 5 minutes warning
    enabled: true,
  });

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 7); // YYYY-MM
  });

  const [attendanceData, setAttendanceData] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Profile edit modal state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Leave balance state
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loadingLeaveBalance, setLoadingLeaveBalance] = useState(false);

  const empCode = session?.user?.empCode;

  // redirect if not employee
  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "EMPLOYEE") {
      router.replace("/login?role=employee");
    }
  }, [session, status, router]);

  // Load leave balance
  useEffect(() => {
    if (!empCode) return;

    async function loadLeaveBalance() {
      try {
        setLoadingLeaveBalance(true);
        const res = await fetch(`/api/employee/leaves?empCode=${encodeURIComponent(empCode)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (res.ok) {
          const response = await res.json();
          if (response.success && response.data) {
            setLeaveBalance(response.data);
          }
        }
      } catch (err) {
        console.error("Failed to load leave balance:", err);
      } finally {
        setLoadingLeaveBalance(false);
      }
    }
    loadLeaveBalance();
  }, [empCode]);

  // optional profile API
  useEffect(() => {
    if (!empCode) return;

    async function loadEmployeeProfile() {
      try {
        setLoadingEmployee(true);
        const res = await fetch(
          `/api/employee?empCode=${encodeURIComponent(empCode)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const response = await res.json();
        
        // Handle standardized API response format
        // New format: { success, message, data: { employee }, error }
        // Old format (backward compatibility): { employee } or { item } or { items }
        let item = null;
        
        if (response.success !== undefined) {
          // New standardized format
          if (!response.success) {
            console.error('Failed to load employee:', response.error || response.message);
            return;
          }
          item = response.data?.employee || response.data?.item || null;
        } else {
          // Legacy format (backward compatibility)
          item = response.employee || response.item || (Array.isArray(response.items) ? response.items[0] : null);
        }
        
        if (item) setEmployee(item);
      } catch (err) {
        console.error("loadEmployeeProfile", err);
      } finally {
        setLoadingEmployee(false);
      }
    }

    loadEmployeeProfile();
  }, [empCode]);

  // monthly attendance (same API as HR page) - LAZY LOADING
  // Only load when user interacts or after a delay
  const [attendanceDataLoaded, setAttendanceDataLoaded] = useState(false);
  
  useEffect(() => {
    if (!empCode) return;
    
    // OPTIMIZATION: Reduced delay for faster data loading (page still renders first)
    const timer = setTimeout(() => {
      setAttendanceDataLoaded(true);
    }, 200); // 200ms delay - faster perceived performance

    return () => clearTimeout(timer);
  }, [empCode]);

  useEffect(() => {
    if (!empCode || !attendanceDataLoaded) return;

    async function loadMonth() {
      try {
        setLoadingAttendance(true);
        setErrorMsg("");
        const res = await fetch(`/api/hr/monthly-attendance?month=${month}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const response = await res.json();
        
        // Handle standardized API response format
        // New format: { success, message, data: { employees, ... }, error }
        // Old format (backward compatibility): { employees, ... }
        let attendanceData = null;
        
        if (response.success !== undefined) {
          // New standardized format
          if (!response.success) {
            throw new Error(response.error || response.message || 'Failed to load monthly attendance');
          }
          attendanceData = response.data || {};
        } else {
          // Legacy format (backward compatibility)
          attendanceData = response;
        }
        
        setAttendanceData(attendanceData);
      } catch (err) {
        console.error(err);
        setErrorMsg(err.message || "Failed to load monthly attendance");
      } finally {
        setLoadingAttendance(false);
      }
    }

    loadMonth();
  }, [month, empCode, attendanceDataLoaded]);

  // Handle profile update
  async function handleProfileUpdate(formData) {
    if (!empCode) {
      setErrorMsg('Employee code not found');
      return;
    }

    setSavingProfile(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: empCode,
          name: formData.name,
          email: formData.email,
          phoneNumber: formData.phoneNumber,
          profileImageBase64: formData.profileImageBase64,
          profileImageUrl: formData.profileImageUrl,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to update profile (${res.status})`);
      }

      const data = await res.json();
      
      // Update local employee state
      setEmployee(data.employee);
      
      // Reload employee profile to get updated data
      const profileRes = await fetch(
        `/api/employee?empCode=${encodeURIComponent(empCode)}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (profileData.employee) {
          setEmployee(profileData.employee);
        }
      }

      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => {
        setShowEditProfile(false);
        setSuccessMsg('');
      }, 1500);
    } catch (err) {
      console.error('Profile update error:', err);
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  // record for current empCode from monthly data
  const myRecord = useMemo(() => {
    if (!attendanceData?.employees || !empCode) return null;
    return attendanceData.employees.find(
      (emp) => String(emp.empCode) === String(empCode)
    );
  }, [attendanceData, empCode]);

  // ---- DISPLAY FIELDS: ALWAYS TRUST myRecord FIRST ----
  const displayName =
    myRecord?.name || employee?.name || session?.user?.name || "Employee";

  const displayDept =
    myRecord?.department ||
    employee?.department ||
    session?.user?.department ||
    "Not assigned";

  const displayDesignation =
    myRecord?.designation ||
    employee?.designation ||
    session?.user?.designation ||
    "Not specified";

  const displayShift =
    myRecord?.shift || employee?.shift || session?.user?.shift || "-";

  const avatarSource = {
    name: displayName,
    empCode,
    profileImageUrl:
      myRecord?.profileImageUrl ||
      myRecord?.photoUrl ||
      employee?.profileImageUrl ||
      session?.user?.profileImageUrl,
    profileImageBase64:
      myRecord?.profileImageBase64 ||
      employee?.profileImageBase64 ||
      session?.user?.profileImageBase64,
  };

  // Monthly summary using SAME statuses as monthly route,
  // and trusting the API's isFuture flag
  const monthSummary = useMemo(() => {
    if (!myRecord?.days) return null;
    const summary = {
      present: 0,
      wfh: 0,
      holiday: 0,
      sickLeave: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      absent: 0,
    };

    myRecord.days.forEach((d) => {
      if (d.isFuture) return; // don't count future days
      const st = d.status || "";

      switch (st) {
        case "Present":
          summary.present += 1;
          break;
        case "Work From Home":
          summary.wfh += 1;
          break;
        case "Holiday":
          summary.holiday += 1;
          break;
        case "Sick Leave":
          summary.sickLeave += 1;
          break;
        case "Paid Leave":
          summary.paidLeave += 1;
          break;
        case "Un Paid Leave":
          summary.unpaidLeave += 1;
          break;
        case "Absent":
          summary.absent += 1;
          break;
        default:
          break;
      }
    });

    return summary;
  }, [myRecord]);

  // "Today" = last non-future day from the API (company timezone)
  const todayDayObj = useMemo(() => {
    if (!myRecord?.days) return null;
    const arr = myRecord.days;

    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const d = arr[i];
      if (d.isFuture) continue;
      if (!d.status && !d.checkIn && !d.checkOut) continue;
      return d;
    }
    return null;
  }, [myRecord]);

  const todayDateLabel = todayDayObj?.date
    ? String(todayDayObj.date).slice(0, 10)
    : "-";

  const loading = loadingAttendance || status === "loading";

  // Best Approach: Show salary slip button for:
  // 1. Any past/completed month (always available - users can view historical slips)
  // 2. Current month only on the 1st of next month (when previous month's slip becomes available)
  const canViewSalarySlip = useMemo(() => {
    if (!month) return false;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    
    const [selectedYear, selectedMonth] = month.split('-').map(Number);
    
    // Case 1: Past year - always available (view historical slips)
    if (selectedYear < currentYear) {
      return true;
    }
    
    // Case 2: Past month in current year - always available (view historical slips)
    if (selectedYear === currentYear && selectedMonth < currentMonth) {
      return true;
    }
    
    // Case 3: Current month - only show on the 1st (meaning previous month's slip is now available)
    if (selectedYear === currentYear && selectedMonth === currentMonth) {
      // If viewing current month on the 1st, show button for previous month's slip
      return currentDay === 1;
    }
    
    // Case 4: Future month - not available
    return false;
  }, [month]);

  // Determine which month's slip to show
  const salarySlipMonth = useMemo(() => {
    if (!month) return month;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    const [selectedYear, selectedMonth] = month.split('-').map(Number);
    
    // If viewing current month on the 1st, show previous month's slip
    if (selectedYear === currentYear && selectedMonth === currentMonth && currentDay === 1) {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = selectedYear - 1;
      }
      return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    }
    
    // For past months, show the selected month's slip
    return month;
  }, [month]);

  // Salary slip modal state
  const [showSalarySlip, setShowSalarySlip] = useState(false);
  
  // Load previous month data when opening salary slip
  const [salarySlipData, setSalarySlipData] = useState(null);
  const [loadingSalarySlip, setLoadingSalarySlip] = useState(false);

  useEffect(() => {
    if (showSalarySlip && salarySlipMonth && empCode) {
      async function loadSalarySlipData() {
        try {
          setLoadingSalarySlip(true);
          const res = await fetch(`/api/hr/monthly-attendance?month=${salarySlipMonth}`, {
            method: "GET",
            cache: "no-store",
          });
          if (res.ok) {
            const json = await res.json();
            const mySlipRecord = json.employees?.find(
              (emp) => String(emp.empCode) === String(empCode)
            );
            setSalarySlipData(mySlipRecord || null);
          }
        } catch (err) {
          console.error("Failed to load salary slip data:", err);
          setSalarySlipData(null);
        } finally {
          setLoadingSalarySlip(false);
        }
      }
      loadSalarySlipData();
    } else if (!showSalarySlip) {
      // Reset data when modal closes
      setSalarySlipData(null);
    }
  }, [showSalarySlip, salarySlipMonth, empCode]);

  // -------------- UI ------------------
  return (
    <div
      className="employee-dashboard-container"
      style={{
        minHeight: "100vh",
        padding: "26px 30px 36px",
        background: "#040d28e5", // dark background
        color: "#0f172a",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style jsx>{`
        @media (max-width: 768px) {
          .employee-dashboard-container {
            padding: 16px !important;
          }
          .employee-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            padding: 16px !important;
          }
          .employee-header-left {
            width: 100% !important;
          }
          .employee-header-logo {
            width: 60px !important;
            height: 60px !important;
          }
          .employee-header-title {
            font-size: 18px !important;
          }
          .employee-header-subtitle {
            font-size: 11px !important;
          }
          .employee-header-right {
            width: 100% !important;
            flex-direction: column !important;
            gap: 12px !important;
          }
          .employee-header-right > div {
            width: 100% !important;
          }
          .employee-header-right input {
            width: 100% !important;
            min-width: auto !important;
          }
          .employee-header-right button {
            width: 100% !important;
          }
          .employee-main-card {
            padding: 16px !important;
          }
          .employee-top-row {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .employee-profile-card {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .employee-profile-avatar {
            margin-bottom: 12px !important;
          }
          .employee-bottom-row {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .employee-summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .employee-table-wrapper {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .employee-table {
            min-width: 500px !important;
            font-size: 11px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 6px 4px !important;
            font-size: 11px !important;
          }
        }
        @media (max-width: 480px) {
          .employee-dashboard-container {
            padding: 12px !important;
          }
          .employee-header-title {
            font-size: 16px !important;
          }
          .employee-main-card {
            padding: 12px !important;
          }
          .employee-summary-grid {
            grid-template-columns: 1fr !important;
          }
          .employee-table {
            min-width: 450px !important;
            font-size: 10px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 4px 3px !important;
            font-size: 10px !important;
          }
        }
        
        /* Laptop & Desktop Responsive Styles */
        /* Desktop: full width with padding - no empty side strips */
        @media (min-width: 1024px) {
          .employee-dashboard-inner {
            max-width: 100% !important;
            width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }
        @media (min-width: 1441px) {
          .employee-dashboard-inner {
            max-width: 100% !important;
          }
        }
        @media (min-width: 1024px) and (max-width: 1366px) {
          .employee-dashboard-container {
            padding: 20px 16px !important;
          }
          .employee-header {
            padding: 16px 22px !important;
          }
          .employee-header-logo {
            width: 75px !important;
            height: 75px !important;
          }
          .employee-header-title {
            font-size: 20px !important;
          }
          .employee-header-right {
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .employee-header-right input,
          .employee-header-right select {
            min-width: 150px !important;
            font-size: 12px !important;
          }
          .employee-header-right button {
            padding: 8px 16px !important;
            font-size: 12px !important;
          }
          .employee-main-card {
            padding: 18px 22px !important;
          }
          .employee-table {
            font-size: 12px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
        }
        
        @media (min-width: 1367px) and (max-width: 1440px) {
          .employee-dashboard-container {
            padding: 22px 18px !important;
          }
          .employee-header {
            padding: 18px 24px !important;
          }
          .employee-table {
            font-size: 12.5px !important;
          }
        }
        
        @media (min-width: 1441px) and (max-width: 1920px) {
          .employee-dashboard-container {
            padding: 24px 28px !important;
          }
          .employee-table {
            font-size: 13px !important;
          }
        }
        
        @media (min-width: 1921px) {
          .employee-dashboard-container {
            padding: 28px 32px !important;
          }
          .employee-header-title {
            font-size: 24px !important;
          }
          .employee-header-logo {
            width: 100px !important;
            height: 100px !important;
          }
          .employee-table {
            font-size: 14px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 10px 8px !important;
            font-size: 14px !important;
          }
        }
      `}</style>
      <style jsx global>{`
        /* Style for Year and Month dropdown options */
        .employee-header-right select option {
          background-color: ${theme === 'dark' ? '#1e293b' : '#ffffff'};
          color: ${theme === 'dark' ? '#f1f5f9' : '#0f172a'};
          padding: 8px 12px;
        }
        .employee-header-right select:focus {
          border-color: rgba(255, 255, 255, 0.5) !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
        }
      `}</style>
      <div className="container-responsive employee-dashboard-inner" style={{ margin: "0 auto 22px auto", width: '100%' }}>
        {/* HEADER */}
        <div
          className="employee-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderRadius: 20,
            background: colors.gradient.primary,
            color: "#f9fafb",
            boxShadow: "0 20px 45px rgba(0,0,0,0.25)",
            border: `1px solid ${colors.border.hover}`,
          }}
        >
          <div className="employee-header-left" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              className="employee-header-logo"
              style={{
                width: 86,
                height: 86,
                borderRadius: "999px",
                overflow: "hidden",
                backgroundColor: "rgba(15,23,42,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 14px 32px rgba(15,23,42,0.8)",
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div>
              <div
                className="employee-header-title"
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                }}
              >
                Global Digital Solutions Attendance Portal
              </div>
              <div
                className="employee-header-subtitle"
                style={{
                  fontSize: 13,
                  opacity: 0.9,
                }}
              >
                Your profile, shift and monthly attendance overview
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  color: "#e5e7eb",
                  opacity: 0.95,
                }}
              >
                {displayName} · Code:{" "}
                <strong style={{ letterSpacing: 0.5 }}>{empCode}</strong>
              </div>
            </div>
          </div>

          <div className="employee-header-right" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <ThemeToggle />
            <select
              value={month.slice(0, 4)} // Extract year from YYYY-MM
              onChange={(e) => {
                const newYear = e.target.value;
                setMonth(`${newYear}-${month.slice(5, 7)}`); // Reconstruct YYYY-MM
              }}
              aria-label="Select Year"
              title="Select Year"
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: theme === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                minWidth: 100,
                fontSize: 12.5,
                outline: "none",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                fontWeight: 500,
                height: "36px",
              }}
            >
              {Array.from({ length: 10 }, (_, i) => {
                const y = new Date().getFullYear() - 2 + i; // 2 years back, 7 years forward
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <select
              value={month.slice(5, 7)} // Extract month from YYYY-MM
              onChange={(e) => {
                const newMonth = e.target.value;
                setMonth(`${month.slice(0, 4)}-${newMonth}`); // Reconstruct YYYY-MM
              }}
              aria-label="Select Month"
              title="Select Month"
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: theme === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                minWidth: 120,
                fontSize: 12.5,
                outline: "none",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                fontWeight: 500,
                height: "36px",
              }}
            >
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0');
                const monthName = new Date(0, i).toLocaleString('en-US', { month: 'long' });
                return <option key={m} value={m}>{monthName}</option>;
              })}
            </select>
            {canViewSalarySlip && myRecord && (
              <button
                type="button"
                onClick={() => setShowSalarySlip(true)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
                  color: colors.primary[600],
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(255, 255, 255, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                  height: "36px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 255, 255, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 255, 255, 0.3)";
                }}
              >
                💰 Salary Slip
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push('/employee/complaints')}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                height: "36px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 255, 255, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 255, 255, 0.2)";
              }}
            >
              📋 Complaints
            </button>
            <button
              type="button"
              onClick={() => router.push('/employee/productivity')}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid rgba(6, 182, 212, 0.4)",
                backgroundColor: "rgba(6, 182, 212, 0.15)",
                color: "#22d3ee",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(6, 182, 212, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                height: "36px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(6, 182, 212, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(6, 182, 212, 0.2)";
              }}
            >
              📊 My Productivity
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut({ 
                    redirect: false,
                    callbackUrl: '/login?role=employee'
                  });
                  router.push('/login?role=employee');
                } catch (error) {
                  console.error('Logout error:', error);
                  router.push('/login?role=employee');
                }
              }}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.25)",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
                backdropFilter: "blur(10px)",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                height: "36px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        className="employee-main-card container-responsive employee-dashboard-inner"
        style={{
          margin: "0 auto",
          width: '100%',
          borderRadius: 22,
          background: colors.gradient.card,
          boxShadow: colors.card.shadow,
          padding: "18px 20px 22px",
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {errorMsg && (
          <div
              style={{
                marginBottom: 12,
                padding: "9px 11px",
                borderRadius: 12,
                backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(248,113,113,0.12)',
                border: `1px solid ${colors.error}`,
                color: colors.error,
                fontSize: 12,
              }}
            >
            {errorMsg}
          </div>
        )}

        {/* TOP ROW */}
        <div
          className="employee-top-row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1.5fr)",
            gap: 16,
            marginBottom: 18,
          }}
        >
          {/* PROFILE CARD */}
          <div
            className="employee-profile-card"
              style={{
                borderRadius: 18,
                padding: "14px 16px",
                background: colors.gradient.card,
                border: `1px solid ${colors.border.default}`,
                display: "flex",
                gap: 14,
              }}
            >
            <div className="employee-profile-avatar" style={{ flexShrink: 0, position: 'relative' }}>
              {renderEmployeeAvatar(avatarSource, 88)}
              <button
                type="button"
                onClick={() => setShowEditProfile(true)}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: `2px solid ${colors.background.card}`,
                  backgroundColor: colors.primary[500],
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  boxShadow: `0 2px 8px ${colors.primary[500]}40`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primary[600];
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primary[500];
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Edit Profile"
              >
                ✏️
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    marginBottom: 4,
                    letterSpacing: 0.3,
                    color: colors.text.primary,
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: colors.text.secondary,
                    marginBottom: 6,
                  }}
                >
                  Emp Code:{" "}
                  <strong style={{ color: colors.text.primary }}>
                    {empCode || "-"}
                  </strong>
                </div>
                <div style={{ fontSize: 12.5, color: colors.text.secondary }}>
                  Dept:{" "}
                  <strong style={{ color: colors.text.primary }}>{displayDept}</strong>
                </div>
                <div style={{ fontSize: 12.5, color: colors.text.secondary }}>
                  Designation:{" "}
                  <strong style={{ color: colors.text.primary }}>
                    {displayDesignation}
                  </strong>
                </div>
                <div style={{ fontSize: 12.5, color: colors.text.secondary }}>
                  Shift:{" "}
                  <strong style={{ color: colors.text.primary }}>{displayShift}</strong>
                </div>
              {loadingEmployee && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#cbd5f5",
                    marginTop: 6,
                  }}
                >
                  Loading profile…
                </div>
              )}
            </div>
          </div>

          {/* TODAY CARD */}
          <div
              style={{
                borderRadius: 18,
                padding: "14px 16px",
                background: theme === 'dark' 
                  ? `linear-gradient(135deg, ${colors.primary[700]}, ${colors.success}, ${colors.primary[800]})`
                  : `linear-gradient(135deg, ${colors.primary[600]}, ${colors.success}, ${colors.primary[500]})`,
                border: `1px solid ${colors.success}`,
              }}
            >
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "#e5fdf4",
                marginBottom: 6,
              }}
            >
              Today&apos;s Attendance
            </div>

            {loading ? (
              <div style={{ fontSize: 12.5, color: "#ecfdf5" }}>
                Loading latest data…
              </div>
            ) : !todayDayObj ? (
              <div style={{ fontSize: 12.5, color: "#ecfdf5" }}>
                No record found for today yet.
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    marginBottom: 4,
                    color: "#ffffff",
                  }}
                >
                  {todayDayObj.status || "—"}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#e5fdf4",
                    marginBottom: 4,
                  }}
                >
                  Date: <strong>{todayDateLabel}</strong>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#e5fdf4",
                    marginBottom: 4,
                  }}
                >
                  In:{" "}
                  <strong>
                    {todayDayObj.checkIn
                      ? formatTimeShort(todayDayObj.checkIn)
                      : "-"}
                  </strong>{" "}
                  · Out:{" "}
                  <strong>
                    {todayDayObj.checkOut
                      ? formatTimeShort(todayDayObj.checkOut)
                      : "-"}
                  </strong>
                </div>
                <div style={{ fontSize: 12.5, color: "#e5fdf4" }}>
                  Late: <strong>{todayDayObj.late ? "Yes" : "No"}</strong> ·
                  Early Leave:{" "}
                  <strong>{todayDayObj.earlyLeave ? "Yes" : "No"}</strong> ·
                  Excused:{" "}
                  <strong>{todayDayObj.excused ? "Yes" : "No"}</strong>
                </div>
              </>
            )}

          </div>
        </div>

        {/* BOTTOM ROW */}
        <div
          className="employee-bottom-row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 2.1fr)",
            gap: 16,
          }}
        >
          {/* SUMMARY */}
          <div
              style={{
                borderRadius: 18,
                padding: "14px 16px",
                background: colors.gradient.card,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <div
                style={{
                  fontSize: 14.5,
                  marginBottom: 8,
                  fontWeight: 600,
                  color: colors.text.primary,
                }}
              >
                Monthly Summary
              </div>
              {loading ? (
                <div style={{ fontSize: 12.5, color: colors.text.tertiary }}>
                  Loading monthly attendance…
                </div>
              ) : !myRecord ? (
                <div style={{ fontSize: 12.5, color: colors.text.tertiary }}>
                  No data found for this month.
                </div>
              ) : (
              <>
                <div
                  className="employee-summary-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <SummaryItem
                    label="Present"
                    value={monthSummary?.present ?? 0}
                    color="#22c55e"
                  />
                  <SummaryItem
                    label="WFH"
                    value={monthSummary?.wfh ?? 0}
                    color="#38bdf8"
                  />
                  <SummaryItem
                    label="Holidays"
                    value={monthSummary?.holiday ?? 0}
                    color="#9ca3af"
                  />
                  <SummaryItem
                    label="Sick Leave"
                    value={monthSummary?.sickLeave ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Paid Leave"
                    value={monthSummary?.paidLeave ?? 0}
                    color="#a3e635"
                  />
                  <SummaryItem
                    label="Un Paid Leave"
                    value={monthSummary?.unpaidLeave ?? 0}
                    color="#fb7185"
                  />
                  <SummaryItem
                    label="Absent"
                    value={monthSummary?.absent ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Late arrivals"
                    value={myRecord?.lateCount ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Early leaves"
                    value={myRecord?.earlyCount ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Salary deduct (days)"
                    value={formatSalaryDays(myRecord?.salaryDeductDays ?? 0)}
                    color="#e5e7eb"
                    
                  />
                  
                  {/* Quarter leaves: taken and left for current quarter + full year */}
                  {leaveBalance && leaveBalance.summary && (
                    <>
                      {leaveBalance.summary.currentQuarter ? (
                        <>
                          <SummaryItem
                            label="Paid leave taken (this quarter)"
                            value={leaveBalance.summary.currentQuarter.taken ?? 0}
                            color="#a3e635"
                            hint={leaveBalance.summary.currentQuarter.label ?? "Current quarter"}
                          />
                          <SummaryItem
                            label="Paid leave left (this quarter)"
                            value={leaveBalance.summary.currentQuarter.remaining ?? leaveBalance.summary.leavesPerQuarter ?? 6}
                            color="#22c55e"
                            hint={`${leaveBalance.summary.currentQuarter.remaining ?? 0} of ${leaveBalance.summary.currentQuarter.allocated ?? 6} · no carry-forward`}
                          />
                        </>
                      ) : leaveBalance.summary?.quarters?.length > 0 ? (
                        <>
                          <SummaryItem
                            label="Paid leave taken (this quarter)"
                            value={leaveBalance.summary.quarters.find((q) => q.quarter === Math.ceil((new Date().getMonth() + 1) / 3))?.taken ?? 0}
                            color="#a3e635"
                            hint="Current quarter"
                          />
                          <SummaryItem
                            label="Paid leave left (this quarter)"
                            value={leaveBalance.summary.quarters.find((q) => q.quarter === Math.ceil((new Date().getMonth() + 1) / 3))?.remaining ?? leaveBalance.summary.leavesPerQuarter ?? 6}
                            color="#22c55e"
                            hint="Per quarter · no carry-forward"
                          />
                        </>
                      ) : (
                        <SummaryItem
                          label="Paid leave this quarter"
                          value={leaveBalance.summary.leavesPerQuarter ?? 6}
                          color="#a3e635"
                          hint="Q1–Q4 (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec)"
                        />
                      )}
                      {/* Quarter summary for the year: taken / allocated per quarter */}
                      {leaveBalance.summary.quarters?.length === 4 && (
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            marginTop: 8,
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "rgba(34, 197, 94, 0.08)",
                            border: "1px solid rgba(34, 197, 94, 0.2)",
                            fontSize: 12,
                            color: colors.text?.secondary ?? "#6b7280",
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6, color: colors.text?.primary ?? "#111827" }}>
                            Quarter leaves ({leaveBalance.year ?? new Date().getFullYear()})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px" }}>
                            {leaveBalance.summary.quarters.map((q) => (
                              <span key={q.quarter}>
                                <strong>{q.label ?? `Q${q.quarter}`}</strong>: {q.taken ?? 0} taken, {q.remaining ?? 0} left (of {q.allocated ?? 6})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  Salary deduction & statuses are calculated using the same
                  rules as the HR monthly screen. Future days are shown as{" "}
                  <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                    &quot;Upcoming&quot;
                  </span>{" "}
                  and are not counted yet.
                </div>
              </>
            )}
          </div>

          {/* DAY-BY-DAY ROW */}
          <div>
            <div
                style={{
                  borderRadius: 18,
                  padding: "12px 14px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.border.default}`,
                }}
              >
                <div
                  style={{
                    fontSize: 14.5,
                    marginBottom: 8,
                    fontWeight: 600,
                    color: colors.text.primary,
                  }}
                >
                  Day-by-day attendance
                </div>
                <div
                  className="employee-table-wrapper"
                  style={{
                    maxHeight: "440px",
                    overflowY: "auto",
                    overflowX: "auto",
                    borderRadius: 12,
                    border: `1px solid ${colors.border.table}`,
                    backgroundColor: colors.background.table.row,
                  }}
                >
                  <table
                  className="employee-table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11.5,
                    minWidth: 500,
                    backgroundColor: colors.background.table.row,
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: colors.background.table.header }}>
                      <th
                        style={{
                          padding: "7px 8px",
                          textAlign: "left",
                          borderBottom: `1px solid ${colors.border.table}`,
                          fontWeight: 600,
                          color: colors.text.table.header,
                        }}
                      >
                        Day
                      </th>
                      <th
                        style={{
                          padding: "7px 8px",
                          textAlign: "left",
                          borderBottom: `1px solid ${colors.border.table}`,
                          fontWeight: 600,
                          color: colors.text.table.header,
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          padding: "7px 8px",
                          textAlign: "left",
                          borderBottom: `1px solid ${colors.border.table}`,
                          fontWeight: 600,
                          color: colors.text.table.header,
                        }}
                      >
                        In / Out
                      </th>
                      <th
                        style={{
                          padding: "7px 8px",
                          textAlign: "left",
                          borderBottom: `1px solid ${colors.border.table}`,
                          fontWeight: 600,
                          color: colors.text.table.header,
                        }}
                      >
                        Flags
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {!myRecord?.days || myRecord.days.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            padding: "9px 10px",
                            textAlign: "center",
                            color: colors.text.tertiary,
                          }}
                        >
                          No attendance records found.
                        </td>
                      </tr>
                    ) : (
                      myRecord.days.map((d, idx) => {
                        const dayNo = idx + 1;
                        const isFuture = !!d.isFuture;
                        const isToday =
                          todayDayObj && d.date === todayDayObj.date;

                        const classInfo = classifyDayForRow(d, colors, theme);

                        let statusLabel = d.status || "—";
                        let inTime = d.checkIn
                          ? formatTimeShort(d.checkIn)
                          : "-";
                        let outTime = d.checkOut
                          ? formatTimeShort(d.checkOut)
                          : "-";
                        let inOutLabel = `${inTime} / ${outTime}`;
                        const isPartial =
                          (d.checkIn && !d.checkOut) ||
                          (!d.checkIn && d.checkOut);

                        // match monthly rules for in/out text
                        if (!d.checkIn && !d.checkOut) {
                          if (d.status === "Holiday") inOutLabel = "- / -";
                          else if (
                            d.status === "Paid Leave" ||
                            d.status === "Un Paid Leave" ||
                            d.status === "Sick Leave"
                          )
                            inOutLabel = d.status;
                          else if (d.status === "Absent")
                            inOutLabel = "No punch";
                          else if (d.status === "Work From Home")
                            inOutLabel = "WFH";
                          else if (d.status === "New Induction")
                            inOutLabel = "New Induction";
                        } else if (d.checkIn && !d.checkOut) {
                          inOutLabel = `${formatTimeShort(
                            d.checkIn
                          )} / Missing Check-Out`;
                        } else if (!d.checkIn && d.checkOut) {
                          inOutLabel = `Missing Check-In / ${formatTimeShort(
                            d.checkOut
                          )}`;
                        }

                        if (isFuture) {
                          statusLabel = "Upcoming";
                          inOutLabel = "- / -";
                        }

                        const flags = [];
                        if (!isFuture) {
                          if (d.late) flags.push("Late");
                          if (d.earlyLeave || isPartial) flags.push("Early");
                          if (d.excused) flags.push("Excused");
                        }

                        return (
                          <tr
                            key={d.date || idx}
                            style={{
                              backgroundColor: isFuture
                                ? colors.background.primary
                                : classInfo.bg,
                            }}
                          >
                            <td
                              style={{
                                padding: "6px 8px",
                                borderBottom: `1px solid ${colors.border.table}`,
                                color: isToday ? colors.success : colors.text.table.cell,
                                fontWeight: isToday ? 700 : 500,
                              }}
                            >
                              {dayNo}
                            </td>
                            <td
                              style={{
                                padding: "6px 8px",
                                borderBottom: `1px solid ${colors.border.table}`,
                                color: isFuture ? colors.warning : classInfo.fg,
                                fontStyle: isFuture ? "italic" : "normal",
                              }}
                            >
                              {statusLabel}
                            </td>
                            <td
                              style={{
                                padding: "6px 8px",
                                borderBottom: `1px solid ${colors.border.table}`,
                                color: colors.text.tertiary,
                              }}
                            >
                              {inOutLabel}
                            </td>
                            <td
                              style={{
                                padding: "6px 8px",
                                borderBottom: `1px solid ${colors.border.table}`,
                                color: isFuture ? colors.text.tertiary : colors.error,
                              }}
                            >
                              {flags.length ? flags.join(", ") : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Salary Slip Modal */}
      <SalarySlipModal
        isOpen={showSalarySlip}
        onClose={() => {
          setShowSalarySlip(false);
          setSalarySlipData(null);
        }}
        employeeData={salarySlipData || myRecord}
        month={salarySlipMonth || month}
        loading={loadingSalarySlip}
      />

      {/* Edit Profile Modal */}
      <Modal
        isOpen={showEditProfile}
        onClose={() => {
          setShowEditProfile(false);
          setErrorMsg('');
          setSuccessMsg('');
        }}
        title="Edit Profile"
        size="medium"
      >
        {successMsg && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${colors.success}`,
            color: colors.success,
            fontSize: 13,
            fontWeight: 500,
          }}>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${colors.error}`,
            color: colors.error,
            fontSize: 13,
            fontWeight: 500,
          }}>
            {errorMsg}
          </div>
        )}
        <EmployeeProfileEdit
          employee={employee || myRecord}
          onSave={handleProfileUpdate}
          onCancel={() => {
            setShowEditProfile(false);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          loading={savingProfile}
        />
      </Modal>

      {/* Auto Logout Warning */}
      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}
    </div>
  );
}
