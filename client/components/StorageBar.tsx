import { useState, useMemo } from "react";
import { HardDrive } from "lucide-react";

interface StorageBarProps {
  transactions: any[];
  budgets: any[];
  recurring: any[];
}

const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB
const STORAGE_WARNING_THRESHOLD = 0.9; // 90%

export default function StorageBar({ transactions, budgets, recurring }: StorageBarProps) {
  const [showDetails, setShowDetails] = useState(false);

  const storageInfo = useMemo(() => {
    const transactionsSize = JSON.stringify(transactions).length;
    const budgetsSize = JSON.stringify(budgets).length;
    const recurringSize = JSON.stringify(recurring).length;
    const totalSize = transactionsSize + budgetsSize + recurringSize;

    const percentageUsed = (totalSize / STORAGE_LIMIT_BYTES) * 100;
    const isWarning = percentageUsed >= (STORAGE_WARNING_THRESHOLD * 100);

    return {
      totalSize,
      transactionsSize,
      budgetsSize,
      recurringSize,
      percentageUsed,
      isWarning,
      remainingBytes: STORAGE_LIMIT_BYTES - totalSize,
    };
  }, [transactions, budgets, recurring]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const barColor = storageInfo.isWarning 
    ? "bg-red-500" 
    : storageInfo.percentageUsed > 50 
    ? "bg-yellow-500" 
    : "bg-emerald-500";

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className="relative"
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        {/* Storage Bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
          <HardDrive className="w-4 h-4 text-gray-600" />
          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-gray-700">
              Storage: {storageInfo.percentageUsed.toFixed(0)}%
            </div>
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all`}
                style={{ width: `${Math.min(storageInfo.percentageUsed, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {showDetails && (
          <div className="absolute top-full right-0 mt-2 bg-gray-900 text-white rounded-lg shadow-lg p-3 w-56 text-xs z-50">
            <div className="font-semibold mb-2">Storage Details</div>
            <div className="space-y-1 text-gray-200">
              <div className="flex justify-between">
                <span>Transactions:</span>
                <span>{formatBytes(storageInfo.transactionsSize)}</span>
              </div>
              <div className="flex justify-between">
                <span>Budgets:</span>
                <span>{formatBytes(storageInfo.budgetsSize)}</span>
              </div>
              <div className="flex justify-between">
                <span>Recurring:</span>
                <span>{formatBytes(storageInfo.recurringSize)}</span>
              </div>
              <div className="border-t border-gray-700 pt-1 mt-1">
                <div className="flex justify-between font-semibold">
                  <span>Used:</span>
                  <span>{formatBytes(storageInfo.totalSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining:</span>
                  <span className={storageInfo.isWarning ? "text-red-400" : "text-emerald-400"}>
                    {formatBytes(storageInfo.remainingBytes)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs mt-1">
                  <span>Limit:</span>
                  <span>{formatBytes(STORAGE_LIMIT_BYTES)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
