"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Input, Spinner } from "./ui";
import { formatDate } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { Search } from "lucide-react";

// Finans görünümü: SADECE öngörülen ödeme tarihleri (payment_schedule view'ından).
// Fiyat/tedarikçi/miktar gibi hassas veri burada YOK.
type Row = {
  id: string;
  contract_no: string | null;
  payment_due_date: string | null;
  eta: string | null;
  status: string;
};

const MONTHS_TR_FULL = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function FinanceView() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("payment_schedule")
        .select("*")
        .order("payment_due_date", { ascending: true });
      if (error) setError(error.message);
      setRows((data as Row[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const calItems = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      if (!r.payment_due_date) return;
      const d = new Date(r.payment_due_date.slice(0, 10) + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() === calMonth.getFullYear() && d.getMonth() === calMonth.getMonth()) {
        const key = String(d.getDate());
        const arr = map.get(key) || [];
        arr.push(r);
        map.set(key, arr);
      }
    });
    return map;
  }, [rows, calMonth]);

  const statusLabel = (s: string) =>
    CONTRACT_STATUS_OPTIONS.find((o) => o.value === s)?.label || s;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = (d: string | null) => {
    if (!d) return false;
    const x = new Date(d.slice(0, 10) + "T00:00:00");
    return !Number.isNaN(x.getTime()) && x < today;
  };
  const daysTo = (d: string | null) => {
    if (!d) return null;
    const x = new Date(d.slice(0, 10) + "T00:00:00");
    if (Number.isNaN(x.getTime())) return null;
    return Math.round((x.getTime() - today.getTime()) / 86400000);
  };
  const overdueCount = rows.filter((r) => {
    const n = daysTo(r.payment_due_date);
    return n !== null && n < 0;
  }).length;
  const soonCount = rows.filter((r) => {
    const n = daysTo(r.payment_due_date);
    return n !== null && n >= 0 && n <= 7;
  }).length;

  const filtered = rows.filter(
    (r) =>
      !search ||
      (r.contract_no || "").toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Finans — Öngörülen Ödemeler</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Sözleşme no ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-8 sm:w-64"
          />
        </div>
      </div>

      {(overdueCount > 0 || soonCount > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️{" "}
          {overdueCount > 0 && (
            <span className="font-semibold">{overdueCount} ödemenin tarihi geçti. </span>
          )}
          {soonCount > 0 && <span>{soonCount} ödeme önümüzdeki 7 gün içinde.</span>}
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ödeme Takvimi</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
              }
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
              aria-label="Önceki ay"
            >
              ‹
            </button>
            <span className="w-32 text-center text-sm font-medium">
              {MONTHS_TR_FULL[calMonth.getMonth()]} {calMonth.getFullYear()}
            </span>
            <button
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
              }
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
              aria-label="Sonraki ay"
            >
              ›
            </button>
          </div>
        </div>
        {(() => {
          const year = calMonth.getFullYear();
          const month = calMonth.getMonth();
          const leading = (new Date(year, month, 1).getDay() + 6) % 7;
          const dim = new Date(year, month + 1, 0).getDate();
          const cells: (number | null)[] = [];
          for (let i = 0; i < leading; i++) cells.push(null);
          for (let d = 1; d <= dim; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);
          const now = new Date();
          const todayDay =
            now.getFullYear() === year && now.getMonth() === month ? now.getDate() : -1;
          return (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_TR.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-medium text-gray-500">
                  {w}
                </div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={i} className="min-h-[64px] rounded bg-gray-50/40" />;
                const items = calItems.get(String(d)) || [];
                return (
                  <div
                    key={i}
                    className={`min-h-[64px] rounded border p-1 ${
                      d === todayDay ? "border-brand bg-brand/5" : "border-border"
                    }`}
                  >
                    <div className="mb-0.5 text-right text-xs text-gray-400">{d}</div>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((r) => (
                        <div
                          key={r.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            isOverdue(r.payment_due_date)
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                          title={`${r.contract_no || "—"} · ${formatDate(r.payment_due_date)}`}
                        >
                          {r.contract_no || "—"}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-[10px] text-gray-500">+{items.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Liste yüklenemedi: {error}
          <div className="mt-1 text-xs text-red-500">
            payment_schedule görünümü yoksa 0005_payment_and_finance.sql migration&apos;ını
            çalıştırın.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Öngörülen ödeme tarihi girilmiş bağlantı yok." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Sözleşme No</th>
                <th className="px-4 py-3 font-medium">Öngörülen Ödeme</th>
                <th className="px-4 py-3 font-medium">ETA</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.contract_no || "—"}</td>
                  <td
                    className={`px-4 py-3 ${
                      isOverdue(r.payment_due_date) ? "font-semibold text-red-600" : ""
                    }`}
                  >
                    {formatDate(r.payment_due_date)}
                    {isOverdue(r.payment_due_date) ? " (geçti)" : ""}
                  </td>
                  <td className="px-4 py-3">{formatDate(r.eta)}</td>
                  <td className="px-4 py-3">{statusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
