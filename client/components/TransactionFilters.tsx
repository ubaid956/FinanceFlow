import { X } from "lucide-react";
import { AccountType } from "@shared/api";

interface TransactionFiltersProps {
  selectedAccount?: AccountType;
  selectedCategory?: string;
  categories: string[];
  onAccountChange: (account: AccountType | undefined) => void;
  onCategoryChange: (category: string | undefined) => void;
}

const ACCOUNTS: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "saving", label: "Saving" },
  { value: "cash", label: "Cash" },
];

export default function TransactionFilters({
  selectedAccount,
  selectedCategory,
  categories,
  onAccountChange,
  onCategoryChange,
}: TransactionFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">
          Account
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAccountChange(undefined)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !selectedAccount
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {ACCOUNTS.map((account) => (
            <button
              key={account.value}
              onClick={() =>
                onAccountChange(
                  selectedAccount === account.value
                    ? undefined
                    : account.value
                )
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedAccount === account.value
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">
          Category
        </label>
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory || ""}
            onChange={(e) =>
              onCategoryChange(e.target.value || undefined)
            }
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {selectedCategory && (
            <button
              onClick={() => onCategoryChange(undefined)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Clear filter"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
