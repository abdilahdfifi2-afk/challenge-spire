export const CURRENCY = "MAD";
export const CURRENCY_SYMBOL = "د.م.";

export function formatCurrency(amount: number | string | null | undefined, currency = CURRENCY) {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (Number.isNaN(n)) return `0 ${currency}`;
  return new Intl.NumberFormat("ar-MA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(n: number | null | undefined) {
  return new Intl.NumberFormat("ar-MA").format(n ?? 0);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ar-MA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
