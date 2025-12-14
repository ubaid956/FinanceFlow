import { Download, FileText, File } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { useState } from "react";
import { Transaction } from "@shared/api";
import { exportToCSV, exportToGoogleSheets } from "@/utils/exportToExcel";

interface ExportButtonProps {
  transactions: Transaction[];
  filename?: string;
}

export default function ExportButton({ transactions, filename }: ExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  if (transactions.length === 0) {
    return null;
  }

  const handleExportCSV = () => {
    const defaultFilename = (() => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      return `transactions-${year}-${month}.csv`;
    })();
    exportToCSV(transactions, filename || defaultFilename);
    setShowMenu(false);
  };

  const handleExportGoogleSheets = () => {
    exportToGoogleSheets(transactions);
    setShowMenu(false);
  };

  const handleExportPDF = () => {
    // Prepare content for PDF
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const title = `FinanceFlow - Transactions Report (${year}-${month})`;

    // Create a temporary container with print styles
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const headers = ["Date", "Description", "Category", "Account", "Type", "Amount"];
    const rows = transactions.map((t) => [
      new Date(t.date).toLocaleDateString("en-US"),
      t.description || "",
      t.category,
      t.account.charAt(0).toUpperCase() + t.account.slice(1),
      t.type === "income" ? "Income" : "Expense",
      `$${formatNumber(t.amount, 2)}`,
    ]);

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 40px;
            background: white;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #10B981;
            padding-bottom: 20px;
          }
          .header h1 {
            font-size: 28px;
            color: #059669;
            margin-bottom: 5px;
          }
          .header p {
            font-size: 14px;
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background-color: #10B981;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #10B981;
          }
          td {
            padding: 10px 12px;
            border: 1px solid #e5e7eb;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .income {
            color: #059669;
            font-weight: 500;
          }
          .expense {
            color: #DC2626;
            font-weight: 500;
          }
          .summary {
            margin-top: 30px;
            padding: 20px;
            background-color: #f0fdf4;
            border: 1px solid #10B981;
            border-radius: 8px;
          }
          .summary h3 {
            color: #059669;
            margin-bottom: 15px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #d1fae5;
          }
          .summary-row:last-child {
            border-bottom: none;
            font-weight: bold;
            padding-top: 10px;
            color: #059669;
          }
          .summary-label {
            font-weight: 500;
          }
          @media print {
            body {
              padding: 0;
            }
            .header {
              page-break-after: avoid;
            }
            table {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>FinanceFlow</h1>
          <p>Financial Report - ${new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        </div>

        <table>
          <thead>
            <tr>
              ${headers.map((h) => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row, idx) => `
              <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
                <td>${row[3]}</td>
                <td class="${row[4] === "Income" ? "income" : "expense"}">${row[4]}</td>
                <td style="text-align: right;">${row[5]}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>

        <div class="summary">
          <h3>Summary</h3>
          <div class="summary-row">
            <span class="summary-label">Total Income:</span>
            <span class="income">$${formatNumber(totalIncome, 2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Expense:</span>
            <span class="expense">$${formatNumber(totalExpense, 2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Net Total:</span>
            <span style="color: ${totalIncome - totalExpense >= 0 ? "#059669" : "#DC2626"};">$${formatNumber(totalIncome - totalExpense, 2)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Total Transactions:</span>
            <span>${transactions.length}</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setShowMenu(false);
  };

  return (
    <div className="relative inline-block w-full sm:w-auto">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-full sm:w-auto bg-white border border-gray-300 text-gray-700 rounded-lg px-3 sm:px-4 py-2.5 font-semibold text-sm sm:text-base hover:bg-gray-50 transition-colors flex items-center justify-center sm:justify-start gap-2 shadow-sm"
      >
        <Download className="w-4 h-4" />
        Export
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-full sm:w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <button
            onClick={handleExportPDF}
            className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700 font-medium text-sm sm:text-base border-b border-gray-200"
          >
            <File className="w-4 h-4" />
            <span className="truncate">Export to PDF</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700 font-medium text-sm sm:text-base border-b border-gray-200"
          >
            <FileText className="w-4 h-4" />
            <span className="truncate">Export to Excel (CSV)</span>
          </button>
          <button
            onClick={handleExportGoogleSheets}
            className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-gray-100 transition-colors flex items-center gap-2 text-gray-700 font-medium text-sm sm:text-base"
          >
            <FileText className="w-4 h-4" />
            <span className="truncate">Copy to Google Sheets</span>
          </button>
        </div>
      )}
    </div>
  );
}
