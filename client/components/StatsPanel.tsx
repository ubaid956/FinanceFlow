import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface StatsPanelProps {
  totalIncome: number;
  totalExpense: number;
}

export default function StatsPanel({
  totalIncome,
  totalExpense,
}: StatsPanelProps) {
  const net = totalIncome - totalExpense;
  const isPositive = net >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-gray-600 text-xs sm:text-sm font-semibold">Total Income</p>
            <p className="text-xl sm:text-2xl font-bold text-green-600 mt-2 truncate">
              ${totalIncome.toFixed(2)}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-gray-600 text-xs sm:text-sm font-semibold">Total Expense</p>
            <p className="text-xl sm:text-2xl font-bold text-red-600 mt-2 truncate">
              ${totalExpense.toFixed(2)}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-red-100 rounded-lg flex-shrink-0">
            <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
          </div>
        </div>
      </div>

      <div
        className={`bg-white rounded-lg shadow-sm border p-4 sm:p-6 ${
          isPositive ? "border-emerald-200" : "border-orange-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-gray-600 text-xs sm:text-sm font-semibold">Net Total</p>
            <p
              className={`text-xl sm:text-2xl font-bold mt-2 truncate ${
                isPositive ? "text-emerald-600" : "text-orange-600"
              }`}
            >
              {isPositive ? "+" : "-"}${Math.abs(net).toFixed(2)}
            </p>
          </div>
          <div
            className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${
              isPositive ? "bg-emerald-100" : "bg-orange-100"
            }`}
          >
            <Wallet
              className={`w-5 h-5 sm:w-6 sm:h-6 ${
                isPositive ? "text-emerald-600" : "text-orange-600"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
