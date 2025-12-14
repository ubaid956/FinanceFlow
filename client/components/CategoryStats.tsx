import { TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Transaction, TransactionType } from "@shared/api";

interface CategoryStatsProps {
  transactions: Transaction[];
  type: TransactionType;
}

interface CategorySummary {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export default function CategoryStats({
  transactions,
  type,
}: CategoryStatsProps) {
  const filtered = transactions.filter((t) => t.type === type);

  const categoryTotals = filtered.reduce(
    (acc, t) => {
      if (!acc[t.category]) {
        acc[t.category] = { total: 0, count: 0 };
      }
      acc[t.category].total += t.amount;
      acc[t.category].count += 1;
      return acc;
    },
    {} as Record<string, { total: number; count: number }>
  );

  const totalAmount = Object.values(categoryTotals).reduce(
    (sum, cat) => sum + cat.total,
    0
  );

  const stats: CategorySummary[] = Object.entries(categoryTotals)
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      percentage: totalAmount > 0 ? (total / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  if (stats.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
        <p className="text-gray-500">No {type}s recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        {type === "income" ? (
          <TrendingUp className="w-5 h-5 text-green-600" />
        ) : (
          <TrendingDown className="w-5 h-5 text-red-600" />
        )}
        {type === "income" ? "Income" : "Expense"} by Category
      </h3>

      <div className="space-y-3">
        {stats.map((stat) => (
          <div key={stat.category} className="flex items-end gap-3">
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-gray-700">
                  {stat.category}
                </span>
                <span className="text-xs font-medium text-gray-600">
                  {stat.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    type === "income" ? "bg-green-500" : "bg-red-500"
                  }`}
                  style={{ width: `${stat.percentage}%` }}
                />
              </div>
            </div>
            <div className="text-right min-w-24">
                <p
                className={`text-sm font-bold ${
                  type === "income" ? "text-green-600" : "text-red-600"
                }`}
              >
                ${formatNumber(stat.total, 2)}
              </p>
              <p className="text-xs text-gray-500">{stat.count} items</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
