// "Excel'e Aktar" — Excel'in çift tıklamayla doğrudan açtığı, noktalı virgülle
// ayrılmış (TR yerel ayarında virgül ondalık ayracıyla çakışmasın diye),
// UTF-8 BOM'lu CSV üretir. ship-ops-page.tsx'teki mevcut dışa aktarımla aynı
// biçim — burada tek yerden, tekrar kullanılabilir hale getirildi.

export function exportToExcel(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
