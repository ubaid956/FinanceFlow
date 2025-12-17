import { useState } from "react";
import { Trash2, Edit2, Save, X, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Transaction, TransactionType, AccountType } from "@shared/api";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, formatInputValue, parseFormattedNumber } from "@/lib/format";

interface TransactionsTableProps {
  transactions: Transaction[];
  // onDelete may perform an async call to Supabase; we accept a promise or void
  onDelete: (id: string) => Promise<void> | void;
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
  const { toast } = useToast();
  // Debug: log transactions prop every render to help diagnose cases where
  // the UI shows 'No transactions found' even after a successful server load.
  try {
    console.log("UI: TransactionsTable render - transactions.length", transactions.length, "ids:", transactions.slice(0,5).map(t => t.id));
  } catch (e) {}
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Transaction | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

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
      className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
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
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
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
                className="px-3 md:px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
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
              <th className="px-3 md:px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {getSortedTransactions().map((transaction) => (
              editingId === transaction.id && editFormData ? (
                <tr key={transaction.id} className="bg-blue-50">
                  <td className="px-3 md:px-6 py-4">
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={(e) =>
                        handleFieldChange("date", e.target.value)
                      }
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-3 md:px-6 py-4">
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
                  <td className="px-3 md:px-6 py-4">
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
                  <td className="px-3 md:px-6 py-4">
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
                  <td className="px-3 md:px-6 py-4">
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
                  <td className="px-3 md:px-6 py-4">
                    <input
                      type="text"
                      value={formatInputValue(String(editFormData.amount))}
                      onChange={(e) => {
                        const parsed = parseFormattedNumber(e.target.value);
                        handleFieldChange("amount", Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-3 md:px-6 py-4 text-center">
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
                  <td className="px-3 md:px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      {formatDateString(transaction.date)}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4">
                    <span className="text-sm text-gray-700">
                      {transaction.description || "-"}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4">
                    <span className="text-sm font-medium text-gray-700">
                      {transaction.category}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getAccountColor(
                        transaction.account
                      )}`}
                    >
                      {transaction.account.charAt(0).toUpperCase() +
                        transaction.account.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4">
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
                  <td className="px-3 md:px-6 py-4 text-right">
                    <span
                      className={`text-sm font-bold ${
                        transaction.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"}$
                      {formatNumber(transaction.amount, 2)}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEditStart(transaction)}
                        className={`p-1.5 rounded-lg transition-colors ${deletingIds.includes(transaction.id) ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-50"}`}
                        title={deletingIds.includes(transaction.id) ? "Deleting..." : "Edit transaction"}
                        aria-disabled={deletingIds.includes(transaction.id)}
                        disabled={deletingIds.includes(transaction.id)}
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={async () => {
                          // mark as deleting immediately so UI shows activity indicator
                          setDeletingIds((ids) => [...ids, transaction.id]);
                          try {
                            const result = onDelete(transaction.id);
                            if (result && typeof (result as Promise<void>).then === "function") {
                              await (result as Promise<void>);
                            }

                            // Success
                            try {
                              toast({
                                title: "Deleted",
                                description: "Transaction deleted successfully",
                              });
                            } catch (tErr) {
                              // ignore toast errors
                            }
                          } catch (e) {
                            // Show toast so user knows delete failed
                            console.error("Delete failed", e);
                            try {
                              toast({
                                title: "Delete failed",
                                description: (e as any)?.message || "Unable to delete transaction. It will be restored.",
                                variant: "destructive",
                              });
                            } catch (tErr) {
                              // ignore toast errors
                            }
                          } finally {
                            setDeletingIds((ids) => ids.filter((i) => i !== transaction.id));
                          }
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${deletingIds.includes(transaction.id) ? "bg-red-50" : "hover:bg-red-50"}`}
                        title={deletingIds.includes(transaction.id) ? "Deleting..." : "Delete transaction"}
                        aria-busy={deletingIds.includes(transaction.id)}
                        disabled={deletingIds.includes(transaction.id)}
                      >
                        {deletingIds.includes(transaction.id) ? (
                          <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-red-600 hover:text-red-700" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-gray-200">
        {getSortedTransactions().map((transaction) => (
          editingId === transaction.id && editFormData ? (
            <div key={transaction.id} className="p-4 bg-blue-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => handleFieldChange("date", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editFormData.description}
                    onChange={(e) => handleFieldChange("description", e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={editFormData.category}
                      onChange={(e) => handleFieldChange("category", e.target.value)}
                      placeholder="Category"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Amount</label>
                    <input
                      type="text"
                      value={formatInputValue(String(editFormData.amount))}
                      onChange={(e) => {
                        const parsed = parseFormattedNumber(e.target.value);
                        handleFieldChange("amount", Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Account</label>
                    <select
                      value={editFormData.account}
                      onChange={(e) => handleFieldChange("account", e.target.value as AccountType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {ACCOUNTS.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc.charAt(0).toUpperCase() + acc.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                    <select
                      value={editFormData.type}
                      onChange={(e) => handleFieldChange("type", e.target.value as TransactionType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {TRANSACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleEditSave}
                    className="flex-1 bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleEditCancel}
                    className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={transaction.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-lg font-bold ${
                        transaction.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "income" ? "+" : "-"}$
                      {formatNumber(transaction.amount, 2)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateString(transaction.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {transaction.category}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getAccountColor(
                        transaction.account
                      )}`}
                    >
                      {transaction.account.charAt(0).toUpperCase() +
                        transaction.account.slice(1)}
                    </span>
                  </div>
                  {transaction.description && (
                    <p className="text-sm text-gray-600 truncate mb-2">
                      {transaction.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleEditStart(transaction)}
                    className={`p-2 rounded-lg transition-colors ${deletingIds.includes(transaction.id) ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-50 bg-blue-50/50"}`}
                    title="Edit transaction"
                    disabled={deletingIds.includes(transaction.id)}
                  >
                    <Edit2 className="w-5 h-5 text-blue-600" />
                  </button>
                  <button
                    onClick={async () => {
                      setDeletingIds((ids) => [...ids, transaction.id]);
                      try {
                        const result = onDelete(transaction.id);
                        if (result && typeof (result as Promise<void>).then === "function") {
                          await (result as Promise<void>);
                        }
                        try {
                          toast({
                            title: "Deleted",
                            description: "Transaction deleted successfully",
                          });
                        } catch (tErr) {}
                      } catch (e) {
                        console.error("Delete failed", e);
                        try {
                          toast({
                            title: "Delete failed",
                            description: (e as any)?.message || "Unable to delete transaction.",
                            variant: "destructive",
                          });
                        } catch (tErr) {}
                      } finally {
                        setDeletingIds((ids) => ids.filter((i) => i !== transaction.id));
                      }
                    }}
                    className={`p-2 rounded-lg transition-colors ${deletingIds.includes(transaction.id) ? "bg-red-50" : "hover:bg-red-50 bg-red-50/50"}`}
                    title="Delete transaction"
                    disabled={deletingIds.includes(transaction.id)}
                  >
                    {deletingIds.includes(transaction.id) ? (
                      <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5 text-red-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
