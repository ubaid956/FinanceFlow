import { useState, useEffect, useRef } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Transaction, TransactionType, AccountType } from "@shared/api";
import { useToast } from "@/hooks/use-toast";
import { formatInputValue, parseFormattedNumber, formatNumber } from "@/lib/format";

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">) => Promise<void> | void;
  categories: string[];
  currentMonth: number;
  currentYear: number;
  disabled?: boolean;
}

const ACCOUNTS: AccountType[] = ["checking", "saving", "cash"];
const TRANSACTION_TYPES: TransactionType[] = ["income", "expense"];

const DEFAULT_CATEGORIES = [
  "Salary",
  "Food",
  "Transport",
  "Entertainment",
  "Bills",
  "Shopping",
  "Healthcare",
  "Donation",
  "Refunds/Returns",
  "Other",
];

export default function TransactionForm({
  onAddTransaction,
  categories,
  currentMonth,
  currentYear,
  disabled = false,
}: TransactionFormProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Generate default date based on currently selected month/year (first day of month)
  const getDefaultDate = () => {
    const month = String(currentMonth + 1).padStart(2, "0");
    const day = "01";
    return `${currentYear}-${month}-${day}`;
  };

  const [date, setDate] = useState(getDefaultDate());
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState<AccountType>("checking");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [customCategory, setCustomCategory] = useState("");

  // Update date when month/year changes
  useEffect(() => {
    setDate(getDefaultDate());
  }, [currentMonth, currentYear]);

  // Track submission start time to detect stuck submissions after tab switching
  const submissionStartRef = useRef<number | null>(null);

  // Safety: if the tab was hidden and the submit got stuck, clear submitting when visibility changes
  // Increased timeout to 30 seconds - simple timeout like axios would have
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && submitting) {
        // If we've been submitting for more than 30 seconds, likely stuck
        const now = Date.now();
        if (submissionStartRef.current && now - submissionStartRef.current > 30000) {
          console.warn("Detected stuck submission after tab switch (30s timeout), clearing state");
          setSubmitting(false);
          submissionStartRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [submitting]);

  const allCategories = [
    ...new Set([...DEFAULT_CATEGORIES, ...categories]),
  ].sort();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount) {
      toast({
        title: "Amount Required",
        description: "Please enter an amount for this transaction",
        variant: "destructive",
      });
      return;
    }

    if (!date) {
      toast({
        title: "Date Required",
        description: "Please select a date for this transaction",
        variant: "destructive",
      });
      return;
    }

    const finalCategory = customCategory || category;
    if (!finalCategory) {
      toast({
        title: "Category Required",
        description: "Please select or enter a category for this transaction",
        variant: "destructive",
      });
      return;
    }

    // No need to block submission if tab is not visible
    // The handleAddTransaction function will wait for tab to become visible automatically
    // This matches the behavior of axios - it just works

    try {
      setSubmitting(true);
      submissionStartRef.current = Date.now();
      
      const result = onAddTransaction({
        date,
        type,
        amount: parseFormattedNumber(amount),
        account,
        category: finalCategory,
        description,
      });

      // If caller returned a promise, await it so we only show success on true completion
      // Note: We don't add a timeout here because the retry logic in handleAddTransaction
      // already handles timeouts and retries properly
      if (result && typeof (result as Promise<void>).then === "function") {
        await (result as Promise<void>);
      }

      // Clear submission tracking on success
      submissionStartRef.current = null;

      toast({
        title: "Transaction Added",
        description: `${type === "income" ? "Income" : "Expense"} of $${formatNumber(parseFormattedNumber(amount), 2)} recorded successfully`,
      });

      setDate(getDefaultDate());
      setType("expense");
      setAmount("");
      setAccount("checking");
      setCategory("");
      setDescription("");
      setCustomCategory("");
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to add transaction:", err);
      submissionStartRef.current = null;
      try {
        toast({
          title: "Failed to add transaction",
          description: (err as any)?.message || String(err) || "Unknown error",
          variant: "destructive",
        });
      } catch (e) {}
    } finally {
      // ensure we always clear submitting flag so UI doesn't remain stuck
      setSubmitting(false);
      submissionStartRef.current = null;
    }
  };

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          className={`w-full px-4 py-3 font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-2 ${
            disabled
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 hover:shadow-lg"
          }`}
        >
          <Plus className="w-5 h-5" />
          Add Transaction
        </button>
        {disabled && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            Storage limit reached. Please delete some data to add new transactions.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">New Transaction</h2>
        {disabled && (
          <div className="bg-red-100 border border-red-400 rounded px-2 py-1 text-xs font-semibold text-red-700">
            Storage Full
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(formatInputValue(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Account
            </label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value as AccountType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Category
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select a category...</option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Or add custom"
                className="flex-1 sm:flex-none sm:w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="submit"
            disabled={disabled || submitting}
            className={`flex-1 rounded-lg py-2 font-semibold transition-colors ${
              disabled || submitting
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-emerald-500 text-white hover:bg-emerald-600"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              "Add Transaction"
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
