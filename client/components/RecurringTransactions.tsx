import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { RecurringTransaction, AccountType, TransactionType } from "@shared/api";

interface RecurringTransactionsProps {
  recurring: RecurringTransaction[];
  onAdd: (transaction: RecurringTransaction) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

const ACCOUNTS: AccountType[] = ["checking", "saving", "cash"];
const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

export default function RecurringTransactions({
  recurring,
  onAdd,
  onDelete,
  disabled = false,
}: RecurringTransactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "Salary",
    description: "",
    frequency: "monthly" as const,
    type: "income" as TransactionType,
    account: "checking" as AccountType,
    endDate: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.category) return;

    onAdd({
      id: Date.now().toString(),
      date: formData.date,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      frequency: formData.frequency as "daily" | "weekly" | "monthly" | "yearly",
      type: formData.type,
      account: formData.account,
      endDate: formData.endDate || undefined,
    });

    setFormData({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      category: "Salary",
      description: "",
      frequency: "monthly",
      type: "income",
      account: "checking",
      endDate: "",
    });
    setIsOpen(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Recurring Transactions</h3>
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
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />

            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as TransactionType })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>

            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Amount"
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />

            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Category"
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />

            <select
              value={formData.account}
              onChange={(e) => setFormData({ ...formData, account: e.target.value as AccountType })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              {ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />

          <input
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            placeholder="End date (optional)"
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
              Add Recurring
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

      {recurring.length === 0 ? (
        <p className="text-gray-500 text-sm">No recurring transactions set up.</p>
      ) : (
        <div className="space-y-3">
          {recurring.map((trans) => (
            <div key={trans.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{trans.category}</p>
                <p className="text-sm text-gray-600">{trans.description || "No description"}</p>
                <p className="text-xs text-gray-500">
                  {trans.frequency.charAt(0).toUpperCase() + trans.frequency.slice(1)} • ${trans.amount.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => onDelete(trans.id)}
                className="p-1 hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
