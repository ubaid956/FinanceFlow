/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

export type AccountType = "checking" | "saving" | "cash";
export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string;
  account: AccountType;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  tags?: string[];
  isRecurring?: boolean;
  recurringFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  recurringEndDate?: string;
}

export interface BudgetGoal {
  id: string;
  category: string;
  monthlyLimit: number;
  type: TransactionType;
}

export interface RecurringTransaction {
  id: string;
  date: string;
  account: AccountType;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  endDate?: string;
  tags?: string[];
}

export interface TransactionFilters {
  month: number;
  year: number;
  account?: AccountType;
  category?: string;
}

export interface TransactionStats {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export interface CategoryStats {
  category: string;
  total: number;
  type: TransactionType;
}
