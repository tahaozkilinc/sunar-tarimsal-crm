"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, Input, Spinner } from "./ui";
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

export function FinanceView() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const statusLabel = (s: string) =>
    CONTRACT_STATUS_OPTIONS.find((o) => o.value === s)?.label || s;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = (d: string | null) => {
    if (!d) return false;
    const x = new Date(d.slice(0, 10) + "T00:00:00");
    return !Number.isNaN(x.getTime()) && x < today;
  };

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
