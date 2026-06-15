"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { Printer } from "lucide-react";

type PC = {
  quantity: number | null;
  price: number | null;
  currency: string | null;
  status: string;
  created_at: string | null;
  usd_try: number | null;
  eur_try: number | null;
};
type SO = {
  quantity: number | null;
  price: number | null;
  currency: string | null;
  status: string;
  created_at: string | null;
  usd_try: number | null;
  eur_try: number | null;
};

type YearRow = {
  year: number;
  alisTon: number;
  alisUsd: number;
  satisTon: number;
  satisUsd: number;
};

const yearOf = (s: string | null): number | null => {
  if (!s) return null;
  const y = new Date(s).getFullYear();
  return Number.isFinite(y) ? y : null;
};

export function YearlyReport() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<PC[]>([]);
  const [sales, setSales] = useState<SO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [pc, so] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("quantity,price,currency,status,created_at,usd_try,eur_try"),
        supabase
          .from("sales_orders")
          .select("quantity,price,currency,status,created_at,usd_try,eur_try"),
      ]);
      if (!on) return;
      setContracts((pc.data as PC[] | null) || []);
      setSales((so.data as SO[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const rows = useMemo<YearRow[]>(() => {
    const map = new Map<number, YearRow>();
    const get = (y: number) => {
      let r = map.get(y);
      if (!r) {
        r = { year: y, alisTon: 0, alisUsd: 0, satisTon: 0, satisUsd: 0 };
        map.set(y, r);
      }
      return r;
    };
    contracts
      .filter((c) => c.status !== "cancelled")
      .forEach((c) => {
        const y = yearOf(c.created_at);
        if (y === null) return;
        const r = get(y);
        r.alisTon += Number(c.quantity) || 0;
        const u = toUsd((Number(c.quantity) || 0) * (Number(c.price) || 0), c.currency, c.usd_try, c.eur_try);
        if (u !== null) r.alisUsd += u;
      });
    sales
      .filter((s) => s.status !== "cancelled")
      .forEach((s) => {
        const y = yearOf(s.created_at);
        if (y === null) return;
        const r = get(y);
        r.satisTon += Number(s.quantity) || 0;
        const u = toUsd((Number(s.quantity) || 0) * (Number(s.price) || 0), s.currency, s.usd_try, s.eur_try);
        if (u !== null) r.satisUsd += u;
      });
    return Array.from(map.values()).sort((a, b) => b.year - a.year);
  }, [contracts, sales]);

  const maxAlisTon = Math.max(1, ...rows.map((r) => r.alisTon));

  // Bir önceki yıla göre % değişim (yıllar artan sırada eşlenir).
  const prevByYear = new Map<number, YearRow>();
  rows.forEach((r) => prevByYear.set(r.year, r));
  const pct = (cur: number, year: number) => {
    const prev = prevByYear.get(year - 1);
    if (!prev || prev.alisTon === 0) return null;
    return ((cur - prev.alisTon) / prev.alisTon) * 100;
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-gray-500">
          Yıl bazında alınan/satılan tonaj ve USD tutarları. &quot;Geçen sene bu seviyedeydi&quot;
          karşılaştırması için.
        </p>
        <button
          onClick={() => window.print()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"
        >
          <Printer className="h-4 w-4" /> PDF / Yazdır
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Kayıt yok." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Yıl</th>
                <th className="px-4 py-3 font-medium">Alınan Tonaj</th>
                <th className="px-4 py-3 text-right font-medium">Alış (USD)</th>
                <th className="px-4 py-3 text-right font-medium">Satılan Ton</th>
                <th className="px-4 py-3 text-right font-medium">Satış (USD)</th>
                <th className="px-4 py-3 text-right font-medium">Önceki Yıla Göre</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = pct(r.alisTon, r.year);
                return (
                  <tr key={r.year} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">{r.year}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-24 overflow-hidden rounded bg-gray-100 print:hidden">
                          <div
                            className="h-full rounded bg-brand"
                            style={{ width: `${(r.alisTon / maxAlisTon) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium">{formatNumber(r.alisTon)} ton</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatUsd(r.alisUsd, 0)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.satisTon)}</td>
                    <td className="px-4 py-3 text-right">{formatUsd(r.satisUsd, 0)}</td>
                    <td className="px-4 py-3 text-right">
                      {p === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={p < 0 ? "text-red-600" : "text-emerald-700"}>
                          {p >= 0 ? "+" : ""}
                          {formatNumber(p, 1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        USD tutarları, her kaydın oluşturulduğu günkü TCMB kuruna göre hesaplanır; kuru olmayan
        (eski) kayıtlar USD toplamına dahil edilmez. Tonaj rakamları her zaman tamdır. &quot;Önceki
        yıla göre&quot; sütunu alınan tonaja göredir.
      </p>
    </div>
  );
}
