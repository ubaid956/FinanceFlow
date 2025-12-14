import { TrendingUp, TrendingDown, Wallet, Calendar, Download } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Transaction } from "@shared/api";
import { exportAnnualReport } from "@/utils/exportToExcel";

interface YearOverviewProps {
  transactions: Transaction[];
  year: number;
  onMonthClick: (month: number) => void;
  onYearChange: (year: number) => void;
}

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

export default function YearOverview({
  transactions,
  year,
  onMonthClick,
  onYearChange,
}: YearOverviewProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
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

    const net = income - expense;

    return {
      month: monthIndex,
      monthName: MONTHS[monthIndex],
      income,
      expense,
      net,
      transactionCount: monthTransactions.length,
    };
  });

  const yearTotal = monthlyStats.reduce(
    (acc, stat) => ({
      income: acc.income + stat.income,
      expense: acc.expense + stat.expense,
      net: acc.net + stat.net,
      count: acc.count + stat.transactionCount,
    }),
    { income: 0, expense: 0, net: 0, count: 0 }
  );

  // Calculate category totals for the year
  const yearTransactions = transactions.filter((t) => {
    const [dateYear] = t.date.split("-");
    return parseInt(dateYear) === year;
  });

  const categoryStats = yearTransactions.reduce(
    (acc, t) => {
      if (!acc[t.category]) {
        acc[t.category] = { income: 0, expense: 0 };
      }
      if (t.type === "income") {
        acc[t.category].income += t.amount;
      } else {
        acc[t.category].expense += t.amount;
      }
      return acc;
    },
    {} as Record<string, { income: number; expense: number }>
  );

  const topIncomeCategory = Object.entries(categoryStats).sort(
    (a, b) => b[1].income - a[1].income
  )[0];

  const topExpenseCategory = Object.entries(categoryStats).sort(
    (a, b) => b[1].expense - a[1].expense
  )[0];

  const allIncomeCategories = Object.entries(categoryStats)
    .filter(([_, stats]) => stats.income > 0)
    .sort((a, b) => b[1].income - a[1].income)
    .slice(0, 5);

  const allExpenseCategories = Object.entries(categoryStats)
    .filter(([_, stats]) => stats.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Year Summary Card */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-900">Year Overview</h2>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onYearChange(year - 1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Previous year"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <select
              value={year}
              onChange={(e) => onYearChange(parseInt(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-900"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button
              onClick={() => onYearChange(year + 1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Next year"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-green-600 text-sm font-semibold">Total Income</p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              ${formatNumber(yearTotal.income, 2)}
            </p>
          </div>

          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-red-600 text-sm font-semibold">Total Expense</p>
            <p className="text-2xl font-bold text-red-700 mt-1">
              ${formatNumber(yearTotal.expense, 2)}
            </p>
          </div>

          <div
            className={`p-4 rounded-lg border ${
              yearTotal.net >= 0
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                yearTotal.net >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              Net Total
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                yearTotal.net >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {yearTotal.net >= 0 ? "+" : "-"}${formatNumber(Math.abs(yearTotal.net), 2)}
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-600 text-sm font-semibold">Transactions</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {yearTotal.count}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Grid */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {monthlyStats.map((stat) => (
            <button
              key={stat.month}
              onClick={() => onMonthClick(stat.month)}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-emerald-300 transition-all text-left"
            >
              <h4 className="font-semibold text-gray-900 mb-3">{stat.monthName}</h4>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    Income
                  </span>
                  <span className="font-semibold text-green-600">
                      ${formatNumber(stat.income, 2)}
                    </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <TrendingDown className="w-4 h-4 text-red-600" />
                    Expense
                  </span>
                    <span className="font-semibold text-red-600">
                    ${formatNumber(stat.expense, 2)}
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Wallet className="w-4 h-4" />
                    Net
                  </span>
                  <span
                    className={`font-bold ${
                      stat.net >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {stat.net >= 0 ? "+" : "-"}${formatNumber(Math.abs(stat.net), 2)}
                  </span>
                </div>

                {stat.transactionCount > 0 && (
                  <div className="pt-1 text-xs text-gray-500">
                    {stat.transactionCount} transaction{stat.transactionCount !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Category Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Income Categories */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">
              Top Income Categories
            </h3>
          </div>

          {allIncomeCategories.length > 0 ? (
            <div className="space-y-4">
              {topIncomeCategory && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600 font-semibold uppercase">
                    Highest Income
                  </p>
                  <p className="text-lg font-bold text-green-700 mt-1">
                    {topIncomeCategory[0]}
                  </p>
                  <p className="text-sm text-green-600 mt-0.5">
                    ${formatNumber(topIncomeCategory[1].income, 2)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {allIncomeCategories.map(([category, stats], index) => (
                  <div
                    key={category}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {index + 1}. {category}
                      </p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="h-1.5 rounded-full bg-green-500 transition-all"
                          style={{
                            width: `${
                              (stats.income /
                                (allIncomeCategories[0]?.[1].income || 1)) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-green-600 ml-3 whitespace-nowrap">
                      ${formatNumber(stats.income, 2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No income recorded</p>
          )}
        </div>

        {/* Top Expense Categories */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-bold text-gray-900">
              Top Expense Categories
            </h3>
          </div>

          {allExpenseCategories.length > 0 ? (
            <div className="space-y-4">
              {topExpenseCategory && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-xs text-red-600 font-semibold uppercase">
                    Highest Expense
                  </p>
                  <p className="text-lg font-bold text-red-700 mt-1">
                    {topExpenseCategory[0]}
                  </p>
                    <p className="text-sm text-red-600 mt-0.5">
                    ${formatNumber(topExpenseCategory[1].expense, 2)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {allExpenseCategories.map(([category, stats], index) => (
                  <div
                    key={category}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {index + 1}. {category}
                      </p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="h-1.5 rounded-full bg-red-500 transition-all"
                          style={{
                            width: `${
                              (stats.expense /
                                (allExpenseCategories[0]?.[1].expense || 1)) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-600 ml-3 whitespace-nowrap">
                      ${formatNumber(stats.expense, 2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No expenses recorded</p>
          )}
        </div>
      </div>

      {/* Export Button */}
      <div className="flex justify-center">
        <button
          onClick={() => exportAnnualReport(transactions, year)}
          className="bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2.5 font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
        >
          <Download className="w-4 h-4" />
          Export Annual Report
        </button>
      </div>
    </div>
  );
}
