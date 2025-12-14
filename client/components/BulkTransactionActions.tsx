import { Trash2, CheckSquare, Square } from "lucide-react";
import { Transaction } from "@shared/api";
import { formatNumber } from "@/lib/format";

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

interface BulkTransactionActionsProps {
  transactions: Transaction[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onBulkDelete: () => void;
}

export default function BulkTransactionActions({
  transactions,
  selectedIds,
  onSelectionChange,
  onBulkDelete,
}: BulkTransactionActionsProps) {
  const handleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-emerald-700">
              {selectedIds.size} selected
            </span>
          </div>
          <button
            onClick={onBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
        </div>
      )}

      {/* Select All Row */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-3 w-full hover:bg-gray-50 p-2 rounded transition-colors"
        >
          {selectedIds.size === transactions.length ? (
            <CheckSquare className="w-5 h-5 text-emerald-600" />
          ) : (
            <Square className="w-5 h-5 text-gray-400" />
          )}
          <span className="font-semibold text-gray-900">
            {selectedIds.size === transactions.length ? "Deselect All" : "Select All"}
          </span>
        </button>
      </div>

      {/* Transaction List with Checkboxes */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
        {transactions.map((transaction) => (
          <button
            key={transaction.id}
            onClick={() => handleToggleSelect(transaction.id)}
            className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
          >
            {selectedIds.has(transaction.id) ? (
              <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <Square className="w-5 h-5 text-gray-300 flex-shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 truncate">
                  {transaction.description || transaction.category}
                </span>
                <span
                  className={`font-bold flex-shrink-0 ${
                    transaction.type === "income"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}$
                  {formatNumber(transaction.amount, 2)}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {formatDateString(transaction.date)} •{" "}
                {transaction.category}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
