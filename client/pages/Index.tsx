import { useState, useEffect, useRef } from "react";
import { Session } from "@supabase/supabase-js";
import Header from "@/components/Header";
import Auth from "@/components/Auth";
import DateFilter from "@/components/DateFilter";
import TransactionFilters from "@/components/TransactionFilters";
import TransactionForm from "@/components/TransactionForm";
import StatsPanel from "@/components/StatsPanel";
import TransactionsTable from "@/components/TransactionsTable";
import CategoryStats from "@/components/CategoryStats";
import ExportButton from "@/components/ExportButton";
import YearOverview from "@/components/YearOverview";
import TransactionSearch from "@/components/TransactionSearch";
import SpendingTrends from "@/components/SpendingTrends";
import BudgetGoals from "@/components/BudgetGoals";
import AccountBalances from "@/components/AccountBalances";
import MonthlyComparison from "@/components/MonthlyComparison";
import RecurringTransactions from "@/components/RecurringTransactions";
import DataBackup from "@/components/DataBackup";
import StorageBar from "@/components/StorageBar";
import { Transaction, TransactionFilters as FilterType, AccountType, BudgetGoal, RecurringTransaction } from "@shared/api";
import { Calendar, Clock, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";


const STORAGE_KEY = "financeflow_transactions";
const BUDGET_STORAGE_KEY = "financeflow_budgets";
const RECURRING_STORAGE_KEY = "financeflow_recurring";

// Supabase free tier database limit: 500MB
// We'll warn/block at 90% to be safe (450MB)
const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB
const STORAGE_WARNING_THRESHOLD = 0.9; // 90%

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedAccount, setSelectedAccount] = useState<AccountType | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [lastLoadedUserId, setLastLoadedUserId] = useState<string | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Track pending saves to ensure they complete before page unload
  const pendingSavesRef = useRef<Promise<void>[]>([]);
  // Ensure we don't sync to Supabase until we've loaded data from Supabase
  // for the current user. This prevents an initial empty local state from
  // deleting the user's existing records in Supabase.
  const loadedFromSupabaseRef = useRef(false);

  // Check session and load data from Supabase
  useEffect(() => {
    try {
      bcRef.current = new BroadcastChannel("financeflow-storage");
    } catch (err) {
      bcRef.current = null;
    }

    let mounted = true;
    const getSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        // If there's a refresh token error, sign out and let user log back in
        if (error && error.message?.includes("Refresh Token")) {
          console.warn("Refresh token invalid, signing out:", error);
          await supabase.auth.signOut();
          if (mounted) {
            setSession(null);
            loadDataFromLocalStorage();
          }
          return;
        }

        if (error) throw error;

        if (mounted) {
          setSession(data?.session || null);

          if (data?.session) {
            // User is authenticated - try Supabase first, fall back to localStorage if it fails
            // Reset loaded flag until the load completes successfully
            loadedFromSupabaseRef.current = false;
            await loadDataFromSupabase(data.session.user.id);
          } else {
            // User is not authenticated - load from localStorage only
            loadedFromSupabaseRef.current = false;
            loadDataFromLocalStorage();
          }
        }
      } catch (error) {
        console.error("Failed to load session:", error);
        // Fallback to localStorage on error
  if (mounted) {
          loadDataFromLocalStorage();
        }
      } finally {
        if (mounted) {
          // Set loading false immediately - Supabase sync happens in background
          setLoading(false);
        }
      }
    };

    getSession();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (mounted) {
        // Only handle actual login/logout events, not token refresh
        // This prevents clearing data on every tab focus/session refresh
        if (event === "SIGNED_IN" && newSession) {
          // User just signed in - show loading while we fetch their data
          setLoading(true);
          setSession(newSession);
          // Mark that we haven't yet loaded this user's data from Supabase
          loadedFromSupabaseRef.current = false;
          setLastLoadedUserId(newSession.user.id);
          await loadDataFromSupabase(newSession.user.id);
          // Data is now loaded from Supabase and saved to localStorage
          // Don't clear localStorage - it has the user's data now
          setLoading(false);
        } else if (event === "SIGNED_OUT" || !newSession) {
          // User logged out - clear everything
          setSession(null);
          setTransactions([]);
          setBudgets([]);
          setRecurring([]);
          setLastLoadedUserId(null);
          // No longer loaded for any user
          loadedFromSupabaseRef.current = false;
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(BUDGET_STORAGE_KEY);
          localStorage.removeItem(RECURRING_STORAGE_KEY);
        } else {
          // For TOKEN_REFRESHED and other events, just update session
          // The session is updated but data is safe in state and localStorage
          setSession(newSession);
        }
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
      if (bcRef.current) {
        try { bcRef.current.close(); } catch (e) {}
        bcRef.current = null;
      }
    };
  }, []);

  // Ensure pending saves complete before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If there are pending saves, prevent default to give them time
      if (pendingSavesRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const loadDataFromLocalStorage = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTransactions(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to load transactions:", error);
      }
    }

    const budgetStored = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (budgetStored) {
      try {
        setBudgets(JSON.parse(budgetStored));
      } catch (error) {
        console.error("Failed to load budgets:", error);
      }
    }

    const recurringStored = localStorage.getItem(RECURRING_STORAGE_KEY);
    if (recurringStored) {
      try {
        setRecurring(JSON.parse(recurringStored));
      } catch (error) {
        console.error("Failed to load recurring:", error);
      }
    }
  };

  const loadDataFromSupabase = async (userId: string) => {
    try {
      setSyncing(true);

      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Data load timeout")), 5000)
      );

      const dataPromise = Promise.all([
        supabase.from("transactions").select("*").eq("user_id", userId),
        supabase.from("budgets").select("*").eq("user_id", userId),
        supabase.from("recurring_transactions").select("*").eq("user_id", userId),
      ]);

      const [transactionsRes, budgetsRes, recurringRes] = await Promise.race([
        dataPromise,
        timeoutPromise,
      ]) as any[];

      // For authenticated users, Supabase is the source of truth
      // Load data and keep it in localStorage as a backup only
      if (transactionsRes?.data !== undefined && Array.isArray(transactionsRes.data)) {
        const txData = transactionsRes.data as Transaction[];
        setTransactions(txData);
        // Keep in localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(txData));
      }
      if (budgetsRes?.data !== undefined && Array.isArray(budgetsRes.data)) {
        const bgData = budgetsRes.data as BudgetGoal[];
        setBudgets(bgData);
        localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(bgData));
      }
      if (recurringRes?.data !== undefined && Array.isArray(recurringRes.data)) {
        const rtData = recurringRes.data as RecurringTransaction[];
        setRecurring(rtData);
        localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(rtData));
      }
      // Mark that we've successfully loaded this user's data from Supabase.
      loadedFromSupabaseRef.current = true;
      setLastLoadedUserId(userId);
  // notify other tabs
  try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
    } catch (error) {
      console.error("Failed to load data from Supabase:", error);
      // On error, try to load from localStorage as fallback
      // This ensures user sees their data even if Supabase is down temporarily
      console.warn("Supabase load failed, using localStorage backup");
      loadDataFromLocalStorage();
      // Did not load from Supabase
      loadedFromSupabaseRef.current = false;
    } finally {
      setSyncing(false);
    }
  };


  

  // Check if storage is full based on current data size
  const checkStorageQuota = () => {
    // Estimate size of data in bytes
    const transactionsSize = JSON.stringify(transactions).length;
    const budgetsSize = JSON.stringify(budgets).length;
    const recurringSize = JSON.stringify(recurring).length;
    const totalSize = transactionsSize + budgetsSize + recurringSize;

    // Check if we're over the warning threshold
    const isOverLimit = totalSize > (STORAGE_LIMIT_BYTES * STORAGE_WARNING_THRESHOLD);

    if (isOverLimit && !storageFull) {
      setStorageFull(true);
      console.warn(`Storage quota warning: ${(totalSize / 1024 / 1024).toFixed(2)}MB of ${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)}MB used`);
    } else if (!isOverLimit && storageFull) {
      setStorageFull(false);
    }
  };

  // Check storage quota whenever data changes
  useEffect(() => {
    checkStorageQuota();
  }, [transactions, budgets, recurring]);

  // Save data to both localStorage and Supabase
  useEffect(() => {
    // ALWAYS save to localStorage immediately as emergency backup
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));

    if (!session || !loadedFromSupabaseRef.current) {
      // If there's no session or we haven't loaded this user's data from
      // Supabase yet, skip syncing to avoid accidental remote deletes.
      return;
    }

    // For authenticated users, also save to Supabase immediately (no debounce to prevent data loss)
    const saveToSupabase = async () => {
      try {
        setSyncing(true);
        const userId = session.user.id;

        // Step 1: Get current transaction IDs from Supabase
        const { data: existingTxs, error: fetchError } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", userId);

        if (fetchError) {
          console.error("Failed to fetch existing transactions:", fetchError);
          throw fetchError;
        }

        const existingIds = new Set(existingTxs?.map(t => t.id) || []);
        const currentIds = new Set(transactions.map(t => t.id));

        // Step 2: Delete transactions that no longer exist
        const idsToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));
        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("transactions")
            .delete()
            .in("id", idsToDelete);

          if (deleteError) {
            console.error("Failed to delete transactions:", deleteError);
            throw deleteError;
          }
        }

        // Step 3: Upsert (insert or update) all current transactions
        if (transactions.length > 0) {
          const toUpsert = transactions.map((t) => ({
            ...t,
            user_id: userId,
          }));

          const { error: upsertError } = await supabase
            .from("transactions")
            .upsert(toUpsert, { onConflict: "id" });

          if (upsertError) {
            console.error("Failed to upsert transactions:", upsertError);
            throw upsertError;
          }
        }
      } catch (error) {
        console.error("Failed to sync transactions to Supabase:", error);
        // Data is safe in localStorage, will retry on next change
      } finally {
        setSyncing(false);
      }
    };

    // Save immediately and track the promise to ensure it completes before unload
    const savePromise = saveToSupabase();
    pendingSavesRef.current.push(savePromise);

    // Clean up completed promise from array
    savePromise.finally(() => {
      pendingSavesRef.current = pendingSavesRef.current.filter(p => p !== savePromise);
    });
  }, [transactions, session]);

  useEffect(() => {
    // ALWAYS save to localStorage immediately as emergency backup
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));

    if (!session || !loadedFromSupabaseRef.current) {
      return;
    }

    // For authenticated users, also save to Supabase immediately (no debounce to prevent data loss)
    const saveToSupabase = async () => {
      try {
        const userId = session.user.id;

        // Step 1: Get current budget IDs from Supabase
        const { data: existingBudgets, error: fetchError } = await supabase
          .from("budgets")
          .select("id")
          .eq("user_id", userId);

        if (fetchError) {
          console.error("Failed to fetch existing budgets:", fetchError);
          throw fetchError;
        }

        const existingIds = new Set(existingBudgets?.map(b => b.id) || []);
        const currentIds = new Set(budgets.map(b => b.id));

        // Step 2: Delete budgets that no longer exist
        const idsToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));
        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("budgets")
            .delete()
            .in("id", idsToDelete);

          if (deleteError) {
            console.error("Failed to delete budgets:", deleteError);
            throw deleteError;
          }
        }

        // Step 3: Upsert (insert or update) all current budgets
        if (budgets.length > 0) {
          const toUpsert = budgets.map((b) => ({
            ...b,
            user_id: userId,
          }));

          const { error: upsertError } = await supabase
            .from("budgets")
            .upsert(toUpsert, { onConflict: "id" });

          if (upsertError) {
            console.error("Failed to upsert budgets:", upsertError);
            throw upsertError;
          }
        }
      } catch (error) {
        console.error("Failed to sync budgets to Supabase:", error);
        // Data is safe in localStorage, will retry on next change
      }
    };

    // Save immediately and track the promise to ensure it completes before unload
    const savePromise = saveToSupabase();
    pendingSavesRef.current.push(savePromise);

    // Clean up completed promise from array
    savePromise.finally(() => {
      pendingSavesRef.current = pendingSavesRef.current.filter(p => p !== savePromise);
    });
  }, [budgets, session]);

  useEffect(() => {
    // ALWAYS save to localStorage immediately as emergency backup
    localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(recurring));

    if (!session || !loadedFromSupabaseRef.current) {
      return;
    }

    // For authenticated users, also save to Supabase immediately (no debounce to prevent data loss)
    const saveToSupabase = async () => {
      try {
        const userId = session.user.id;

        // Step 1: Get current recurring IDs from Supabase
        const { data: existingRecurring, error: fetchError } = await supabase
          .from("recurring_transactions")
          .select("id")
          .eq("user_id", userId);

        if (fetchError) {
          console.error("Failed to fetch existing recurring:", fetchError);
          throw fetchError;
        }

        const existingIds = new Set(existingRecurring?.map(r => r.id) || []);
        const currentIds = new Set(recurring.map(r => r.id));

        // Step 2: Delete recurring transactions that no longer exist
        const idsToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));
        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("recurring_transactions")
            .delete()
            .in("id", idsToDelete);

          if (deleteError) {
            console.error("Failed to delete recurring:", deleteError);
            throw deleteError;
          }
        }

        // Step 3: Upsert (insert or update) all current recurring transactions
        if (recurring.length > 0) {
          const toUpsert = recurring.map((r) => ({
            ...r,
            user_id: userId,
          }));

          const { error: upsertError } = await supabase
            .from("recurring_transactions")
            .upsert(toUpsert, { onConflict: "id" });

          if (upsertError) {
            console.error("Failed to upsert recurring:", upsertError);
            throw upsertError;
          }
        }
      } catch (error) {
        console.error("Failed to sync recurring to Supabase:", error);
        // Data is safe in localStorage, will retry on next change
      }
    };

    // Save immediately and track the promise to ensure it completes before unload
    const savePromise = saveToSupabase();
    pendingSavesRef.current.push(savePromise);

    // Clean up completed promise from array
    savePromise.finally(() => {
      pendingSavesRef.current = pendingSavesRef.current.filter(p => p !== savePromise);
    });
  }, [recurring, session]);

  // Add new transaction
  const handleAddTransaction = (newTransaction: Omit<Transaction, "id">) => {
    const transaction: Transaction = {
      ...newTransaction,
      id: uuidv4(),
    };
    setTransactions([transaction, ...transactions]);
    // notify other tabs immediately and persist localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([transaction, ...transactions]));
    } catch (e) {}
    try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
  };

  // Delete transaction: do NOT remove locally until Supabase confirms deletion
  // This ensures the TransactionsTable can show a spinner in-place while the
  // backend operation completes.
  const handleDeleteTransaction = async (id: string): Promise<void> => {
    const toRemove = transactions.find((t) => t.id === id) || null;

    if (!session) {
      // No session - local-only deletion; remove immediately
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) {
        throw error;
      }

      // On success, remove from local state and update localStorage immediately
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      try {
        const updated = transactions.filter((t) => t.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        // ignore localStorage errors
      }
      try { bcRef.current?.postMessage({ type: "update" }); } catch (e) {}
    } catch (err) {
      // Let caller (TransactionsTable) show toast; do not modify local state
      throw err;
    }
  };

  // Update transaction
  const handleUpdateTransaction = (updatedTransaction: Transaction) => {
    setTransactions(
      transactions.map((t) =>
        t.id === updatedTransaction.id ? updatedTransaction : t
      )
    );
  };

  // Add budget
  const handleAddBudget = (budget: BudgetGoal) => {
    setBudgets([...budgets, budget]);
  };

  // Delete budget: wait for Supabase confirmation before removing locally
  const handleDeleteBudget = async (id: string): Promise<void> => {
    if (!session) {
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      throw err;
    }
  };

  // Add recurring
  const handleAddRecurring = (trans: RecurringTransaction) => {
    setRecurring([...recurring, trans]);
  };

  // Delete recurring: wait for Supabase confirmation before removing locally
  const handleDeleteRecurring = async (id: string): Promise<void> => {
    if (!session) {
      setRecurring((prev) => prev.filter((r) => r.id !== id));
      return;
    }

    try {
      const { error } = await supabase
        .from("recurring_transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      setRecurring((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      throw err;
    }
  };

  // Get all unique categories from transactions
  const allCategories = Array.from(
    new Set(transactions.map((t) => t.category))
  ).sort();

  // Filter transactions based on selected filters
  const filteredTransactions = transactions.filter((t) => {
    // Parse date in local timezone to avoid timezone shifts
    const [dateYear, monthStr, day] = t.date.split("-");
    const transactionMonth = parseInt(monthStr) - 1; // Convert to 0-indexed
    const transactionYear = parseInt(dateYear);

    // Month and year filter
    if (transactionMonth !== month || transactionYear !== year) {
      return false;
    }

    // Account filter
    if (selectedAccount && t.account !== selectedAccount) {
      return false;
    }

    // Category filter
    if (selectedCategory && t.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matches =
        t.description?.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        t.amount.toString().includes(query);
      if (!matches) {
        return false;
      }
    }

    return true;
  });

  // Calculate stats for filtered transactions
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const handleLogout = async () => {
    try {
      // Wait for any pending saves to complete before clearing data
      if (pendingSavesRef.current.length > 0) {
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000));
        await Promise.race([Promise.all(pendingSavesRef.current), timeoutPromise]);
      }

      // Clear local storage
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BUDGET_STORAGE_KEY);
      localStorage.removeItem(RECURRING_STORAGE_KEY);

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Supabase signOut error:", error);
        throw error;
      }

      // Reset state - the onAuthStateChange listener will also update session
      // but we do this to ensure immediate UI update
      setSession(null);
      setTransactions([]);
      setBudgets([]);
      setRecurring([]);
    } catch (error) {
      console.error("Failed to logout:", error);
      // Even if logout fails, clear session state and show auth
      setSession(null);
      setTransactions([]);
      setBudgets([]);
      setRecurring([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-300 border-t-emerald-500 animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header userEmail={session?.user?.email} onLogout={handleLogout} />
      <StorageBar transactions={transactions} budgets={budgets} recurring={recurring} />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* View Mode Toggle and Date Filter */}
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setViewMode("month")}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                viewMode === "month"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Month View</span>
              <span className="sm:hidden">Month</span>
            </button>
            <button
              onClick={() => setViewMode("year")}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                viewMode === "year"
                  ? "bg-emerald-500 text-white shadow-md"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Year View</span>
              <span className="sm:hidden">Year</span>
            </button>
          </div>
          {viewMode === "month" && (
            <DateFilter
              month={month}
              year={year}
              onMonthChange={setMonth}
              onYearChange={setYear}
            />
          )}
        </div>

        {viewMode === "year" ? (
          <YearOverview
            transactions={transactions}
            year={year}
            onMonthClick={(selectedMonth) => {
              setMonth(selectedMonth);
              setViewMode("month");
            }}
            onYearChange={setYear}
          />
        ) : (
          <>
            {/* Quick Stats Overview */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <StatsPanel
                totalIncome={totalIncome}
                totalExpense={totalExpense}
              />
            </div>

            {/* Search */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionSearch
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            {/* Transaction Input Form */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionForm
                onAddTransaction={handleAddTransaction}
                categories={allCategories}
                currentMonth={month}
                currentYear={year}
                disabled={storageFull}
              />
            </div>

            {/* Transactions Table */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionsTable
                transactions={filteredTransactions}
                onDelete={handleDeleteTransaction}
                onUpdate={handleUpdateTransaction}
              />
            </div>

            {/* Export Button */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <ExportButton transactions={filteredTransactions} />
            </div>

            {/* Filters Section */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <TransactionFilters
                selectedAccount={selectedAccount}
                selectedCategory={selectedCategory}
                categories={allCategories}
                onAccountChange={setSelectedAccount}
                onCategoryChange={setSelectedCategory}
              />
            </div>

            {/* Monthly Comparison */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <MonthlyComparison
                transactions={transactions}
                month={month}
                year={year}
              />
            </div>

            {/* Spending Trends Chart */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <SpendingTrends transactions={transactions} year={year} />
            </div>

            {/* Account Balances */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <AccountBalances transactions={transactions} />
            </div>

            {/* Budget Goals */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <BudgetGoals
                budgets={budgets}
                transactions={transactions}
                month={month}
                year={year}
                onAddBudget={handleAddBudget}
                onDeleteBudget={handleDeleteBudget}
                disabled={storageFull}
              />
            </div>

            {/* Recurring Transactions */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <RecurringTransactions
                recurring={recurring}
                onAdd={handleAddRecurring}
                onDelete={handleDeleteRecurring}
                disabled={storageFull}
              />
            </div>

            {/* Data Backup */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <DataBackup transactions={transactions} />
            </div>

            {/* Category Statistics */}
            <div className="mb-4 sm:mb-6 md:mb-8 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              <CategoryStats
                transactions={filteredTransactions}
                type="income"
              />
              <CategoryStats
                transactions={filteredTransactions}
                type="expense"
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
