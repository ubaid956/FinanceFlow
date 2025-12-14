export function formatNumber(value: number | string | undefined, decimals = 2): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  if (Number.isNaN(num)) return "";
  // Use toLocaleString to add commas, keep decimals
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Format an input string as the user types: preserves decimal typing and adds commas to integer part
export function formatInputValue(input: string): string {
  if (input == null) return "";
  // Remove all commas and spaces
  let v = input.replace(/,/g, "").trim();
  // If empty or just a dot, return as-is
  if (v === "") return "";
  // Allow only digits and at most one dot and optional leading minus
  const negative = v.startsWith("-") ? "-" : "";
  if (negative) v = v.slice(1);

  const parts = v.split(".");
  // Clean integer part
  let intPart = parts[0].replace(/\D/g, "") || "0";
  // Remove leading zeros (but keep single zero)
  intPart = intPart.replace(/^0+(\d)/, "$1");
  const intFormatted = parseInt(intPart || "0", 10).toLocaleString("en-US");

  if (parts.length > 1) {
    // keep only digits in decimal part
    const dec = parts[1].replace(/\D/g, "");
    return (negative ? "-" : "") + intFormatted + "." + dec;
  }

  return (negative ? "-" : "") + intFormatted;
}

export function parseFormattedNumber(formatted: string): number {
  if (!formatted && formatted !== "0") return NaN;
  const cleaned = String(formatted).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "-" ) return NaN;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? NaN : n;
}
