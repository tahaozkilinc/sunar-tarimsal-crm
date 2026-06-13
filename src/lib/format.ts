// Türkçe biçimlendirme yardımcıları.

export function formatNumber(
  value: number | string | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(
  value: number | null | undefined,
  currency = "TRY",
): string {
  if (value === null || value === undefined) return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  try {
    return n.toLocaleString("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 2,
    });
  } catch {
    return `${formatNumber(n)} ${currency}`;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
