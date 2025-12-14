import { DollarSign } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Transaction, AccountType } from "@shared/api";

interface AccountBalancesProps {
  transactions: Transaction[];
}

const ACCOUNTS: { value: AccountType; label: string; color: string }[] = [
  { value: "checking", label: "Checking", color: "bg-blue-100 text-blue-700" },
  { value: "saving", label: "Saving", color: "bg-purple-100 text-purple-700" },
  { value: "cash", label: "Cash", color: "bg-yellow-100 text-yellow-700" },
];

export default function AccountBalances({ transactions }: AccountBalancesProps) {
  const getBalance = (account: AccountType) => {
    return transactions
      .filter((t) => t.account === account)
      .reduce((balance, t) => {
        return t.type === "income" ? balance + t.amount : balance - t.amount;
      }, 0);
  };

  const totalBalance = ACCOUNTS.reduce(
    (sum, acc) => sum + getBalance(acc.value),
    0
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <DollarSign className="w-6 h-6 text-emerald-600" />
        <h3 className="text-lg font-bold text-gray-900">Account Balances</h3>
      </div>

      <div className="space-y-4">
        {ACCOUNTS.map((account) => {
          const balance = getBalance(account.value);
          return (
            <div key={account.value} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${account.color}`}>
                  {account.label}
                </span>
                <span className={`text-lg font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {balance >= 0 ? "+" : "-"}${formatNumber(Math.abs(balance), 2)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${balance >= 0 ? "bg-green-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(Math.abs(balance) / 10000 * 100, 100)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total Balance</span>
            <span className={`text-xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalBalance >= 0 ? "+" : "-"}${formatNumber(Math.abs(totalBalance), 2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
