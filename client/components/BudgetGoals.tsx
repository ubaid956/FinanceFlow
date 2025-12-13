import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Transaction, BudgetGoal } from "@shared/api";

interface BudgetGoalsProps {
  budgets: BudgetGoal[];
  transactions: Transaction[];
  month: number;
  year: number;
  onAddBudget: (budget: BudgetGoal) => void;
  onDeleteBudget: (id: string) => void;
  disabled?: boolean;
}

const DEFAULT_CATEGORIES = [
  "Salary", "Food", "Transport", "Entertainment", "Bills", "Shopping", "Healthcare", "Donation", "Other"
];

export default function BudgetGoals({
  budgets,
  transactions,
  month,
  year,
  onAddBudget,
  onDeleteBudget,
  disabled = false,
}: BudgetGoalsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !limit) return;

    onAddBudget({
      id: Date.now().toString(),
      category,
      monthlyLimit: parseFloat(limit),
      type,
    });

    setCategory("");
    setLimit("");
    setType("expense");
    setIsOpen(false);
  };

  const getSpentInMonth = (category: string, type: "income" | "expense") => {
    return transactions
      .filter((t) => {
        const [dateYear, monthStr] = t.date.split("-");
        return (
          t.category === category &&
          t.type === type &&
          parseInt(dateYear) === year &&
          parseInt(monthStr) === month + 1
        );
      })
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const expenseBudgets = budgets.filter((b) => b.type === "expense");
  const incomeBudgets = budgets.filter((b) => b.type === "income");

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Budget Goals</h3>
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            disabled={disabled}
            className={`p-2 rounded-lg transition-colors ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-100"
            }`}
          >
            <Plus className={`w-5 h-5 ${disabled ? "text-gray-400" : "text-emerald-600"}`} />
          </button>
        )}
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Select category...</option>
            {DEFAULT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value as "income" | "expense")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>

          <input
            type="number"
            step="0.01"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="Monthly limit"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={disabled}
              className={`flex-1 rounded py-2 font-semibold text-sm ${
                disabled
                  ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              }`}
            >
              Add Budget
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-gray-200 text-gray-700 rounded py-2 font-semibold hover:bg-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {expenseBudgets.length === 0 && incomeBudgets.length === 0 ? (
        <p className="text-gray-500 text-sm">No budget goals set. Click the + button to add one.</p>
      ) : (
        <div className="space-y-4">
          {expenseBudgets.map((budget) => {
            const spent = getSpentInMonth(budget.category, "expense");
            const percentage = (spent / budget.monthlyLimit) * 100;
            const isOver = spent > budget.monthlyLimit;

            return (
              <div key={budget.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{budget.category}</span>
                  <button
                    onClick={() => onDeleteBudget(budget.id)}
                    className="p-1 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={isOver ? "text-red-600 font-semibold" : "text-gray-600"}>
                    ${spent.toFixed(2)} / ${budget.monthlyLimit.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-500">{percentage.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isOver ? "bg-red-500" : percentage > 80 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
