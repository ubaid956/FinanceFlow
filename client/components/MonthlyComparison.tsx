import { TrendingUp, TrendingDown } from "lucide-react";
import { Transaction } from "@shared/api";

interface MonthlyComparisonProps {
  transactions: Transaction[];
  month: number;
  year: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function MonthlyComparison({
  transactions,
  month,
  year,
}: MonthlyComparisonProps) {
  const getMonthStats = (m: number, y: number) => {
    const filtered = transactions.filter((t) => {
      const [dateYear, monthStr] = t.date.split("-");
      return parseInt(dateYear) === y && parseInt(monthStr) === m + 1;
    });

    const income = filtered
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = filtered
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    return { income, expense, net: income - expense };
  };

  const currentStats = getMonthStats(month, year);
  
  let previousMonth = month - 1;
  let previousYear = year;
  if (previousMonth < 0) {
    previousMonth = 11;
    previousYear = year - 1;
  }

  const previousStats = getMonthStats(previousMonth, previousYear);

  const incomeChange = currentStats.income - previousStats.income;
  const expenseChange = currentStats.expense - previousStats.expense;
  const netChange = currentStats.net - previousStats.net;

  const getChangePercent = (change: number, previous: number) => {
    if (previous === 0) return 0;
    return ((change / previous) * 100).toFixed(1);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-6">
        {MONTHS[month]} {year} vs {MONTHS[previousMonth]} {previousYear}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Income Comparison */}
        <div className="p-4 rounded-lg border border-green-200 bg-green-50">
          <p className="text-green-600 text-sm font-semibold mb-2">Income</p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-green-700">
              ${currentStats.income.toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center gap-1 ${incomeChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {incomeChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {incomeChange >= 0 ? "+" : ""}{incomeChange.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-green-600">
            Previous: ${previousStats.income.toFixed(2)}
          </p>
        </div>

        {/* Expense Comparison */}
        <div className="p-4 rounded-lg border border-red-200 bg-red-50">
          <p className="text-red-600 text-sm font-semibold mb-2">Expense</p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-red-700">
              ${currentStats.expense.toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center gap-1 ${expenseChange <= 0 ? "text-green-600" : "text-red-600"}`}>
              {expenseChange <= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {expenseChange <= 0 ? "" : "+"}{expenseChange.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-red-600">
            Previous: ${previousStats.expense.toFixed(2)}
          </p>
        </div>

        {/* Net Comparison */}
        <div className={`p-4 rounded-lg border ${currentStats.net >= 0 ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
          <p className={`text-sm font-semibold mb-2 ${currentStats.net >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
            Net
          </p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-bold ${currentStats.net >= 0 ? "text-emerald-700" : "text-orange-700"}`}>
              {currentStats.net >= 0 ? "+" : "-"}${Math.abs(currentStats.net).toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center gap-1 ${netChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {netChange >= 0 ? "+" : ""}{netChange.toFixed(2)}
            </span>
          </div>
          <p className={`text-xs ${currentStats.net >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
            Previous: {previousStats.net >= 0 ? "+" : "-"}${Math.abs(previousStats.net).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
