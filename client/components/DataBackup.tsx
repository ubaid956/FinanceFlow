import { Download, Archive, File } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Transaction } from "@shared/api";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface DataBackupProps {
  transactions: Transaction[];
}

export default function DataBackup({ transactions }: DataBackupProps) {
  // const downloadAsPDF = async () => {
  //   try {
  //     // Scroll to top to capture full page from the beginning
  //     window.scrollTo(0, 0);

  //     // Wait a moment for scroll to complete
  //     await new Promise(resolve => setTimeout(resolve, 300));

  //     // Capture the entire page as screenshot
  //     const canvas = await html2canvas(document.documentElement, {
  //       allowTaint: true,
  //       useCORS: true,
  //       backgroundColor: "#ffffff",
  //       scale: 1,
  //       logging: false,
  //     });

  //     const imgData = canvas.toDataURL("image/png");

  //     // Create PDF in landscape orientation for better fit
  //     const pdf = new jsPDF({
  //       orientation: "landscape",
  //       unit: "mm",
  //       format: "a4",
  //     });

  //     const pageWidth = pdf.internal.pageSize.getWidth();
  //     const pageHeight = pdf.internal.pageSize.getHeight();

  //     // Calculate scaling to fit image to page
  //     const imgWidth = pageWidth;
  //     const imgHeight = (canvas.height * imgWidth) / canvas.width;

  //     // Add image to PDF, scaling across multiple pages if needed
  //     let yPosition = 0;
  //     let pageNum = 1;

  //     pdf.addImage(imgData, "PNG", 0, yPosition, imgWidth, imgHeight);

  //     while (yPosition + pageHeight < imgHeight) {
  //       yPosition -= pageHeight;
  //       pdf.addPage();
  //       pdf.addImage(imgData, "PNG", 0, yPosition, imgWidth, imgHeight);
  //       pageNum++;
  //     }

  //     pdf.save(`FinanceFlow-Report-${new Date().toISOString().split("T")[0]}.pdf`);
  //   } catch (error) {
  //     console.error("Failed to export PDF:", error);
  //     alert("Failed to export PDF. Please try again.");
  //   }
  // };


  const downloadAsPDF = async () => {
  try {
    window.scrollTo(0, 0);
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(document.body, {
      scale: 2, // Better quality
      useCORS: true,
      backgroundColor: "#ffffff"
    });

    const imgData = canvas.toDataURL("image/jpeg", 1.0);

    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`FinanceFlow-Report-${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (error) {
    console.error("PDF Download Error:", error);
    alert("Failed to export PDF. Please try again.");
  }
};


  const downloadAsCSV = () => {
    const headers = [
      "Date",
      "Description",
      "Category",
      "Account",
      "Type",
      "Amount",
      "Tags",
    ];

    const rows = transactions.map((t) => [
      new Date(t.date).toLocaleDateString("en-US"),
      t.description || "",
      t.category,
      t.account.charAt(0).toUpperCase() + t.account.slice(1),
      t.type === "income" ? "Income" : "Expense",
      `$${formatNumber(t.amount, 2)}`,
      t.tags?.join(";") || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const stringCell = String(cell);
            if (
              stringCell.includes(",") ||
              stringCell.includes('"') ||
              stringCell.includes("\n")
            ) {
              return `"${stringCell.replace(/"/g, '""')}"`;
            }
            return stringCell;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financeflow-backup-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Archive className="w-6 h-6 text-emerald-600" />
        <h3 className="text-lg font-bold text-gray-900">Data Backup</h3>
      </div>

      <p className="text-gray-600 text-sm mb-4">
        Download a backup of all your transactions in PDF or CSV format. You have{" "}
        <span className="font-bold text-gray-900">{transactions.length}</span> transactions to backup.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={downloadAsPDF}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors"
        >
          <File className="w-4 h-4" />
          Export to PDF
        </button>
        <button
          onClick={downloadAsCSV}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download as CSV
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Backups are saved to your device's Downloads folder. You can use these files to import
        transactions into other apps or keep as a permanent record.
      </p>
    </div>
  );
}
