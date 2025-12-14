import { Transaction } from "@shared/api";
import * as XLSX from "xlsx";

export function exportToCSV(transactions: Transaction[], filename: string = "transactions.xlsx") {
  if (transactions.length === 0) {
    alert("No transactions to export");
    return;
  }

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Prepare data
  const headers = ["Date", "Description", "Category", "Account", "Type", "Amount"];
  const rows = transactions.map((t) => [
    new Date(t.date).toLocaleDateString("en-US"),
    t.description || "",
    t.category,
    t.account.charAt(0).toUpperCase() + t.account.slice(1),
    t.type === "income" ? "Income" : "Expense",
    t.amount,
  ]);

  // Create sheet from data
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, // Date
    { wch: 20 }, // Description
    { wch: 15 }, // Category
    { wch: 12 }, // Account
    { wch: 10 }, // Type
    { wch: 12 }, // Amount
  ];

  // Header style
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, size: 11 },
    fill: { fgColor: { rgb: "10B981" } }, // Emerald
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // Row styles
  const incomeStyle = {
    font: { color: { rgb: "059669" } }, // Green
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  const expenseStyle = {
    font: { color: { rgb: "DC2626" } }, // Red
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  // Format header row
  for (let i = 0; i < headers.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = headerStyle;
  }

  // Format data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const typeValue = row[4];
    const isIncome = typeValue === "Income";

    // Type column color
    const typeCell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 4 })];
    if (typeCell) {
      typeCell.s = {
        font: { bold: true, color: { rgb: isIncome ? "059669" : "DC2626" } },
        alignment: { horizontal: "center" },
      };
    }

    // Amount column with conditional coloring
    const amountCell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 5 })];
    if (amountCell) {
      amountCell.s = isIncome ? incomeStyle : expenseStyle;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  // Write file
  XLSX.writeFile(wb, filename);
}

export function exportToGoogleSheets(
  transactions: Transaction[],
  sheetName: string = "Transactions"
) {
  // Create TSV format for Google Sheets
  const headers = ["Date", "Description", "Category", "Account", "Type", "Amount"];

  const rows = transactions.map((t) => [
    new Date(t.date).toLocaleDateString("en-US"),
    t.description || "",
    t.category,
    t.account.charAt(0).toUpperCase() + t.account.slice(1),
    t.type === "income" ? "Income" : "Expense",
    t.amount.toFixed(2),
  ]);

  // Create TSV content
  const tsvContent = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join(
    "\n"
  );

  // Copy to clipboard
  navigator.clipboard.writeText(tsvContent).then(() => {
    alert("Data copied to clipboard! You can now paste it into Google Sheets.");
  });
}

export function exportAnnualReport(
  transactions: Transaction[],
  year: number,
  filename: string = `annual-report-${year}.xlsx`
) {
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Calculate yearly totals
  const yearTransactions = transactions.filter((t) => {
    const [dateYear] = t.date.split("-");
    return parseInt(dateYear) === year;
  });

  const yearIncome = yearTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const yearExpense = yearTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const yearTotal = {
    income: yearIncome,
    expense: yearExpense,
    count: yearTransactions.length,
    net: yearIncome - yearExpense,
  };

  // Calculate monthly breakdown
  const monthlyStats = MONTHS.map((_, monthIndex) => {
    const monthTransactions = transactions.filter((t) => {
      const [dateYear, monthStr] = t.date.split("-");
      const transactionMonth = parseInt(monthStr) - 1;
      const transactionYear = parseInt(dateYear);
      return transactionMonth === monthIndex && transactionYear === year;
    });

    const income = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      month: MONTHS[monthIndex],
      income,
      expense,
      net: income - expense,
      count: monthTransactions.length,
    };
  });

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    [`Annual Financial Report - ${year}`],
    [],
    ["ANNUAL SUMMARY"],
    ["Total Income", yearTotal.income],
    ["Total Expense", yearTotal.expense],
    ["Net Total", yearTotal.net],
    ["Total Transactions", yearTotal.count],
    [],
    ["MONTHLY BREAKDOWN"],
    ["Month", "Income", "Expense", "Net", "Transactions"],
    ...monthlyStats.map((stat) => [
      stat.month,
      stat.income,
      stat.expense,
      stat.net,
      stat.count,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths
  ws["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];

  // Apply formatting
  const headerStyle = {
    font: { bold: true, size: 14, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "10B981" } }, // Emerald
    alignment: { horizontal: "center", vertical: "center" },
  };

  const summaryHeaderStyle = {
    font: { bold: true, size: 12, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "059669" } }, // Dark emerald
    alignment: { horizontal: "left", vertical: "center" },
  };

  const incomeStyle = {
    font: { bold: true, color: { rgb: "059669" } }, // Green
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  const expenseStyle = {
    font: { bold: true, color: { rgb: "DC2626" } }, // Red
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  const netPositiveStyle = {
    font: { bold: true, color: { rgb: "059669" } }, // Green
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  const netNegativeStyle = {
    font: { bold: true, color: { rgb: "DC2626" } }, // Red
    numFmt: "$#,##0.00",
    alignment: { horizontal: "right" },
  };

  // Format header row
  if (ws["A1"]) ws["A1"].s = headerStyle;

  // Format summary section
  const summaryStartRow = 3;
  for (let i = 0; i < 4; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: summaryStartRow + i, c: 0 })];
    if (cell) cell.s = summaryHeaderStyle;
  }

  // Format summary values
  const incomeCell = ws[XLSX.utils.encode_cell({ r: 3, c: 1 })];
  if (incomeCell) incomeCell.s = incomeStyle;

  const expenseCell = ws[XLSX.utils.encode_cell({ r: 4, c: 1 })];
  if (expenseCell) expenseCell.s = expenseStyle;

  const netCell = ws[XLSX.utils.encode_cell({ r: 5, c: 1 })];
  if (netCell) {
    netCell.s = yearTotal.net >= 0 ? netPositiveStyle : netNegativeStyle;
  }

  // Format monthly breakdown headers
  const monthlyHeaderRow = 9;
  for (let i = 0; i < 5; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: monthlyHeaderRow, c: i })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "10B981" } },
        alignment: { horizontal: "center" },
      };
    }
  }

  // Format monthly data rows
  for (let i = 0; i < monthlyStats.length; i++) {
    const rowIndex = monthlyHeaderRow + 1 + i;
    const stat = monthlyStats[i];

    // Income column
    const incomeCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })];
    if (incomeCell) incomeCell.s = incomeStyle;

    // Expense column
    const expenseCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 2 })];
    if (expenseCell) expenseCell.s = expenseStyle;

    // Net column
    const netCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 3 })];
    if (netCell) {
      netCell.s = stat.net >= 0 ? netPositiveStyle : netNegativeStyle;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Annual Report");

  // Write file
  XLSX.writeFile(wb, filename);
}
