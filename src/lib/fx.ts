// USD bazlı dönüşüm yardımcıları.
// usd_try / eur_try, kaydın oluşturulduğu günün TCMB döviz-satış kurlarıdır.
// Dönüşüm yapılamıyorsa (kur yoksa veya para birimi bilinmiyorsa) null döner.

export function toUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
  usdTry: number | null | undefined,
  eurTry: number | null | undefined,
): number | null {
  const a = Number(amount);
  if (!Number.isFinite(a)) return null;
  const cur = (currency || "").toUpperCase();
  if (cur === "USD") return a;
  const usd = Number(usdTry);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (cur === "TRY") return a / usd;
  if (cur === "EUR") {
    const eur = Number(eurTry);
    if (!Number.isFinite(eur) || eur <= 0) return null;
    return a * (eur / usd);
  }
  return null;
}

export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("tr-TR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
