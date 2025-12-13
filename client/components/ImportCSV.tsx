import { Upload } from "lucide-react";
import { useState } from "react";
import { Transaction, AccountType, TransactionType } from "@shared/api";

interface ImportCSVProps {
  onImport: (transactions: Transaction[]) => void;
}

export default function ImportCSV({ onImport }: ImportCSVProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split("\n");
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

        const transactions: Transaction[] = [];

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;

          const values = lines[i].split(",").map((v) => v.trim());
          const obj: any = {};

          headers.forEach((header, index) => {
            obj[header] = values[index];
          });

          if (obj.date && obj.amount && obj.category) {
            transactions.push({
              id: Date.now().toString() + Math.random(),
              date: obj.date,
              amount: parseFloat(obj.amount),
              category: obj.category,
              description: obj.description || "",
              type: (obj.type?.toLowerCase() === "income" ? "income" : "expense") as TransactionType,
              account: ((obj.account?.toLowerCase() || "checking") as AccountType) || "checking",
            });
          }
        }

        onImport(transactions);
        setIsOpen(false);
        alert(`Successfully imported ${transactions.length} transactions!`);
      } catch (error) {
        alert("Error parsing CSV file. Make sure it has columns: Date, Amount, Category, Description, Type, Account");
      }
    };

    reader.readAsText(file);
  };

  return (
    <div>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
      ) : (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Import Transactions from CSV</h2>

            <p className="text-sm text-gray-600 mb-4">
              Your CSV file should have columns: Date, Amount, Category, Description, Type, Account
            </p>

            <p className="text-xs text-gray-500 mb-4 p-3 bg-gray-50 rounded">
              Example format:<br />
              Date, Amount, Category, Description, Type, Account<br />
              2025-01-15, 100.00, Salary, Monthly income, income, checking
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="w-full mb-4"
            />

            <button
              onClick={() => setIsOpen(false)}
              className="w-full bg-gray-200 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
