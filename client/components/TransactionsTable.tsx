import { useState } from "react";
import { Trash2, Edit2, Save, X, ArrowUp, ArrowDown } from "lucide-react";
import { Transaction, TransactionType, AccountType } from "@shared/api";

interface TransactionsTableProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onUpdate: (transaction: Transaction) => void;
}

const ACCOUNTS: AccountType[] = ["checking", "saving", "cash"];
const TRANSACTION_TYPES: TransactionType[] = ["income", "expense"];

type SortColumn = "date" | "description" | "category" | "account" | "type" | "amount" | null;
type SortDirection = "asc" | "desc";

const getTypeColor = (type: TransactionType) => {
  return type === "income"
    ? "bg-green-50 text-green-700"
    : "bg-red-50 text-red-700";
};

const getAccountColor = (account: string) => {
  const colors: Record<string, string> = {
    checking: "bg-blue-100 text-blue-700",
    saving: "bg-purple-100 text-purple-700",
    cash: "bg-yellow-100 text-yellow-700",
  };
  return colors[account] || "bg-gray-100 text-gray-700";
};

const formatDateString = (dateString: string): string => {
  // Parse date string (YYYY-MM-DD) without timezone conversion
  const [year, month, day] = dateString.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function TransactionsTable({
  transactions,
  onDelete,
  onUpdate,
}: TransactionsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Transaction | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to descending
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const getSortedTransactions = () => {
    if (!sortColumn) return transactions;

    const sorted = [...transactions].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case "date":
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case "description":
          aVal = (a.description || "").toLowerCase();
          bVal = (b.description || "").toLowerCase();
          break;
        case "category":
          aVal = a.category.toLowerCase();
          bVal = b.category.toLowerCase();
          break;
        case "account":
          aVal = a.account.toLowerCase();
          bVal = b.account.toLowerCase();
          break;
        case "type":
          aVal = a.type.toLowerCase();
          bVal = b.type.toLowerCase();
          break;
        case "amount":
          aVal = a.amount;
          bVal = b.amount;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const SortHeader = ({ column, label }: { column: SortColumn; label: string }) => (
    <th
      onClick={() => handleSort(column)}
      className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        {label}
        {sortColumn === column && (
          sortDirection === "asc" ? (
            <ArrowUp className="w-3 h-3 text-emerald-600" />
          ) : (
            <ArrowDown className="w-3 h-3 text-emerald-600" />
          )
        )}
      </div>
    </th>
  );

  const handleEditStart = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setEditFormData({ ...transaction });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditFormData(null);
  };

  const handleEditSave = () => {
    if (editFormData) {
      onUpdate(editFormData);
      setEditingId(null);
      setEditFormData(null);
    }
  };

  const handleFieldChange = (field: keyof Transaction, value: any) => {
    if (editFormData) {
      setEditFormData({
        ...editFormData,
        [field]: value,
      });
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-500 text-lg">No transactions found</p>
        <p className="text-gray-400 text-sm mt-1">
          Add your first transaction to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortHeader column="date" label="Date" />
              <SortHeader column="description" label="Description" />
              <SortHeader column="category" label="Category" />
              <SortHeader column="account" label="Account" />
              <SortHeader column="type" label="Type" />
              <th
                onClick={() => handleSort("amount")}
                className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-end gap-2">
                  Amount
                  {sortColumn === "amount" && (
                    sortDirection === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-emerald-600" />
                    )
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {getSortedTransactions().map((transaction) => (
              editingId === transaction.id && editFormData ? (
                <tr key={transaction.id} className="bg-blue-50">
                  <td className="px-6 py-4">
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={(e) =>
                        handleFieldChange("date", e.target.value)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={editFormData.description}
                      onChange={(e) =>
                        handleFieldChange("description", e.target.value)
                      }
                      placeholder="Description"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={editFormData.category}
                      onChange={(e) =>
                        handleFieldChange("category", e.target.value)
                      }
                      placeholder="Category"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={editFormData.account}
                      onChange={(e) =>
                        handleFieldChange("account", e.target.value as AccountType)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {ACCOUNTS.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc.charAt(0).toUpperCase() + acc.slice(1)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={editFormData.type}
                      onChange={(e) =>
                        handleFieldChange("type", e.target.value as TransactionType)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {TRANSACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.amount}
                      onChange={(e) =>
                        handleFieldChange("amount", parseFloat(e.target.value))
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={handleEditSave}
                        className="p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                        title="Save transaction"
                      >
                        <Save className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Cancel editing"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={transaction.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      {formatDateString(transaction.date)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">
                      {transaction.description || "-"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-700">
                      {transaction.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getAccountColor(
                        transaction.account
                      )}`}
                    >
                      {transaction.account.charAt(0).toUpperCase() +
                        transaction.account.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        transaction.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "income" ? "Income" : "Expense"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`text-sm font-bold ${
                        transaction.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"}$
                      {transaction.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEditStart(transaction)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit transaction"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => onDelete(transaction.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 hover:text-red-700" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
