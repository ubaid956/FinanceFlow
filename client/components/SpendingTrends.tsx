import { Transaction } from "@shared/api";

interface SpendingTrendsProps {
  transactions: Transaction[];
  year: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export default function SpendingTrends({ transactions, year }: SpendingTrendsProps) {
  const monthlyData = MONTHS.map((month, monthIndex) => {
    const monthNum = monthIndex + 1;
    const monthTransactions = transactions.filter((t) => {
      const [dateYear, monthStr] = t.date.split("-");
      return parseInt(dateYear) === year && parseInt(monthStr) === monthNum;
    });

    const income = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      name: month,
      income,
      expense,
      net: income - expense,
    };
  });

  const maxValue = Math.max(...monthlyData.map((d) => Math.max(d.income, d.expense))) || 100;
  const chartHeight = 250;
  const padding = 40;
  const graphWidth = 100 - padding * 2;
  const graphHeight = 100 - padding * 2;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Spending Trends</h3>

      <div className="overflow-x-auto">
        <div className="min-w-full" style={{ height: `${chartHeight}px` }}>
          <svg viewBox="0 0 1200 300" className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines and axes */}
            <line x1="40" y1="20" x2="40" y2="250" stroke="#e5e7eb" strokeWidth="2" />
            <line x1="40" y1="250" x2="1180" y2="250" stroke="#e5e7eb" strokeWidth="2" />

            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = 250 - tick * 230;
              const value = Math.round(tick * maxValue);
              return (
                <g key={`y-${tick}`}>
                  <line x1="35" y1={y} x2="40" y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x="30" y={y + 4} fontSize="12" textAnchor="end" className="text-gray-500">
                    ${value}
                  </text>
                </g>
              );
            })}

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = 250 - tick * 230;
              return (
                <line
                  key={`grid-${tick}`}
                  x1="40"
                  y1={y}
                  x2="1180"
                  y2={y}
                  stroke="#f3f4f6"
                  strokeWidth="1"
                />
              );
            })}

            {/* Data lines */}
            {/* Income line */}
            <polyline
              points={monthlyData
                .map((d, i) => {
                  const x = 40 + (i * 1140) / 12;
                  const y = 250 - (d.income / maxValue) * 230;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
            />

            {/* Expense line */}
            <polyline
              points={monthlyData
                .map((d, i) => {
                  const x = 40 + (i * 1140) / 12;
                  const y = 250 - (d.expense / maxValue) * 230;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
            />

            {/* X-axis labels */}
            {monthlyData.map((d, i) => {
              const x = 40 + (i * 1140) / 12;
              return (
                <text key={`x-${i}`} x={x} y="270" fontSize="12" textAnchor="middle" className="text-gray-500">
                  {d.name}
                </text>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-6 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-sm text-gray-600">Income</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span className="text-sm text-gray-600">Expense</span>
        </div>
      </div>
    </div>
  );
}
