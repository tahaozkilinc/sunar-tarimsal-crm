"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatNumber } from "@/lib/format";
import { Spinner } from "./ui";

// Bir firmaya ait operasyonel özet: o firmadan/ona yapılan alım ve satışların
// ürün bazında toplamları, ortalama fiyatları ve aylık (sezonsallık) dağılımı.
// RLS gereği rol neyi görebiliyorsa onu gösterir (satışçı alımları göremez vb.).

type Deal = {
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  dateStr: string | null;
};

type RawPurchase = {
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  eta: string | null;
  created_at: string | null;
};
type RawSale = {
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  delivery_date: string | null;
  created_at: string | null;
};
type RawProduct = { id: string; name: string };

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

type ProductAgg = {
  name: string;
  tons: number;
  count: number;
  byCurrency: Record<string, { amount: number; tons: number }>;
};

function aggregateByProduct(deals: Deal[], productMap: Record<string, string>): ProductAgg[] {
  const m = new Map<string, ProductAgg>();
  deals.forEach((d) => {
    const key = d.product_id || "none";
    const q = Number(d.quantity) || 0;
    const e =
      m.get(key) ||
      {
        name: (d.product_id && productMap[d.product_id]) || "Ürünsüz",
        tons: 0,
        count: 0,
        byCurrency: {},
      };
    e.tons += q;
    e.count++;
    const price = Number(d.price) || 0;
    if (price > 0 && q > 0) {
      const cur = d.currency || "—";
      const c = e.byCurrency[cur] || { amount: 0, tons: 0 };
      c.amount += q * price;
      c.tons += q;
      e.byCurrency[cur] = c;
    }
    m.set(key, e);
  });
  return Array.from(m.values()).sort((a, b) => b.tons - a.tons);
}

function aggregateByMonth(deals: Deal[]): { k: string; tons: number }[] {
  const m = new Map<string, number>();
  deals.forEach((d) => {
    if (!d.dateStr) return;
    const dt = new Date(d.dateStr);
    if (Number.isNaN(dt.getTime())) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    m.set(key, (m.get(key) || 0) + (Number(d.quantity) || 0));
  });
  return Array.from(m.entries())
    .map(([k, tons]) => ({ k, tons }))
    .sort((a, b) => a.k.localeCompare(b.k));
}

function priceSummary(byCurrency: ProductAgg["byCurrency"]): string {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return "Fiyat girilmemiş";
  return entries
    .map(
      ([cur, v]) =>
        `${formatMoney(v.amount, cur)} · ort. ${formatMoney(v.tons ? v.amount / v.tons : 0, cur)}/ton`,
    )
    .join(" · ");
}

function Section({
  title,
  byProduct,
  byMonth,
  accent,
}: {
  title: string;
  byProduct: ProductAgg[];
  byMonth: { k: string; tons: number }[];
  accent: string;
}) {
  if (byProduct.length === 0) return null;
  const totalTons = byProduct.reduce((a, p) => a + p.tons, 0);
  const maxMonth = Math.max(1, ...byMonth.map((x) => x.tons));
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-gray-500">{formatNumber(totalTons)} ton toplam</span>
      </div>
      <div className="space-y-1.5">
        {byProduct.map((p) => (
          <div
            key={p.name}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border/60 pb-1.5 last:border-0"
          >
            <span className="text-sm font-medium">{p.name}</span>
            <span className="text-sm">
              {formatNumber(p.tons)} ton · {p.count} kayıt
            </span>
            <span className="w-full text-xs text-gray-500">{priceSummary(p.byCurrency)}</span>
          </div>
        ))}
      </div>
      {byMonth.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Sezonsallık (ton/ay)</div>
          <div className="space-y-1">
            {byMonth.map((x) => {
              const [yy, mm] = x.k.split("-");
              return (
                <div key={x.k} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-500">
                    {MONTHS_TR[Number(mm) - 1]} {yy.slice(2)}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className={`h-full rounded ${accent}`}
                      style={{ width: `${(x.tons / maxMonth) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs">{formatNumber(x.tons)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CompanyReport({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Deal[]>([]);
  const [sales, setSales] = useState<Deal[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [pc, so, pr] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("product_id,quantity,price,currency,eta,created_at")
          .eq("supplier_id", companyId),
        supabase
          .from("sales_orders")
          .select("product_id,quantity,price,currency,delivery_date,created_at")
          .eq("customer_id", companyId),
        supabase.from("products").select("id,name"),
      ]);
      if (!active) return;
      setPurchases(
        ((pc.data as unknown as RawPurchase[]) || []).map((r) => ({
          product_id: r.product_id,
          quantity: r.quantity,
          price: r.price,
          currency: r.currency,
          dateStr: r.eta || r.created_at,
        })),
      );
      setSales(
        ((so.data as unknown as RawSale[]) || []).map((r) => ({
          product_id: r.product_id,
          quantity: r.quantity,
          price: r.price,
          currency: r.currency,
          dateStr: r.delivery_date || r.created_at,
        })),
      );
      const map: Record<string, string> = {};
      ((pr.data as unknown as RawProduct[]) || []).forEach((p) => (map[p.id] = p.name));
      setProductMap(map);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [companyId, supabase]);

  const pByProduct = useMemo(() => aggregateByProduct(purchases, productMap), [purchases, productMap]);
  const sByProduct = useMemo(() => aggregateByProduct(sales, productMap), [sales, productMap]);
  const pByMonth = useMemo(() => aggregateByMonth(purchases), [purchases]);
  const sByMonth = useMemo(() => aggregateByMonth(sales), [sales]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );

  if (purchases.length === 0 && sales.length === 0)
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-gray-500">
        Bu firmaya ait bağlantı/satış kaydı yok.
      </div>
    );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Operasyonel Özet</h3>
      <Section title="Alımlar (Bağlantı)" byProduct={pByProduct} byMonth={pByMonth} accent="bg-brand" />
      <Section title="Satışlar" byProduct={sByProduct} byMonth={sByMonth} accent="bg-amber-500" />
    </div>
  );
}
