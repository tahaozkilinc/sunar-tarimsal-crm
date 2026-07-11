"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";

// Pozisyon raporu: ürün bazında NET pozisyon = bağlanan − satılan.
// Bir tüccarın temel risk görünümü: hangi üründe ne kadar "açıktayım",
// ortalama maliyetim ne, açık tonajın ne kadarı yolda / ne kadarı geldi.
// Ortalama maliyet, TCMB kuru kayıtlı sözleşmelerin USD toplamından hesaplanır;
// kuru olmayan sözleşme tonajı pozisyona dahil edilir ama maliyete katılamaz
// (satır uyarıyla işaretlenir).

type PC = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  status: string;
  eta: string | null;
  usd_try: number | null;
  eur_try: number | null;
};
type SO = { contract_id: string | null; quantity: number | null; status: string };
type Ref = { id: string; name: string };

// Yolda = henüz Türkiye'ye gelmemiş; Gelen = arrived/completed.
const IN_TRANSIT = new Set(["draft", "active", "in_transit"]);

type ProductPos = {
  product: string;
  bought: number;
  sold: number;
  open: number;
  openTransit: number;
  openArrived: number;
  costTon: number | null; // USD/ton (kurlu sözleşmelerden)
  openValueUsd: number | null;
  fxMissing: boolean;
};

type OpenContract = {
  id: string;
  label: string;
  product: string;
  status: string;
  eta: string | null;
  bought: number;
  sold: number;
  open: number;
};

export function PositionReport() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<PC[]>([]);
  const [sales, setSales] = useState<SO[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [pc, so, pr] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,quantity,price,currency,status,eta,usd_try,eur_try")
          .neq("status", "cancelled"),
        supabase.from("sales_orders").select("contract_id,quantity,status").neq("status", "cancelled"),
        supabase.from("products").select("id,name"),
      ]);
      if (pc.error) setError(pc.error.message);
      setContracts((pc.data as PC[]) || []);
      setSales((so.data as SO[]) || []);
      setProducts((pr.data as Ref[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const { rows, openContracts, totals } = useMemo(() => {
    const pName = (id: string | null) =>
      products.find((p) => p.id === id)?.name || "Ürünsüz";

    const soldByContract = new Map<string, number>();
    sales.forEach((s) => {
      if (!s.contract_id) return;
      soldByContract.set(
        s.contract_id,
        (soldByContract.get(s.contract_id) || 0) + (Number(s.quantity) || 0),
      );
    });

    const byProduct = new Map<
      string,
      ProductPos & { costUsdSum: number; costTonSum: number }
    >();
    const opens: OpenContract[] = [];

    contracts.forEach((c) => {
      const product = pName(c.product_id);
      const bought = Number(c.quantity) || 0;
      const sold = Math.min(soldByContract.get(c.id) || 0, bought) as number;
      // (kota kuralı satışın alımı aşmasını engeller; yine de emniyetle sınırla)
      const soldRaw = soldByContract.get(c.id) || 0;
      const open = bought - soldRaw;

      const e =
        byProduct.get(product) ||
        ({
          product,
          bought: 0,
          sold: 0,
          open: 0,
          openTransit: 0,
          openArrived: 0,
          costTon: null,
          openValueUsd: null,
          fxMissing: false,
          costUsdSum: 0,
          costTonSum: 0,
        } as ProductPos & { costUsdSum: number; costTonSum: number });

      e.bought += bought;
      e.sold += soldRaw;
      e.open += open;
      if (open > 0.0001) {
        if (IN_TRANSIT.has(c.status)) e.openTransit += open;
        else e.openArrived += open;
        opens.push({
          id: c.id,
          label: c.vessel || c.contract_no || "—",
          product,
          status: c.status,
          eta: c.eta,
          bought,
          sold: soldRaw,
          open,
        });
      }
      const price = Number(c.price) || 0;
      if (price > 0) {
        const usd = toUsd(bought * price, c.currency, c.usd_try, c.eur_try);
        if (usd === null) e.fxMissing = true;
        else {
          e.costUsdSum += usd;
          e.costTonSum += bought;
        }
      }
      byProduct.set(product, e);
      void sold;
    });

    const rows: ProductPos[] = Array.from(byProduct.values())
      .map((e) => {
        const costTon = e.costTonSum > 0 ? e.costUsdSum / e.costTonSum : null;
        return {
          ...e,
          costTon,
          openValueUsd: costTon !== null ? e.open * costTon : null,
        };
      })
      .sort((a, b) => b.open - a.open);

    opens.sort((a, b) => b.open - a.open);

    const totals = rows.reduce(
      (a, r) => ({
        bought: a.bought + r.bought,
        sold: a.sold + r.sold,
        open: a.open + r.open,
        openValueUsd:
          r.openValueUsd === null ? a.openValueUsd : (a.openValueUsd ?? 0) + r.openValueUsd,
        fxMissing: a.fxMissing || r.fxMissing,
      }),
      { bought: 0, sold: 0, open: 0, openValueUsd: null as number | null, fxMissing: false },
    );

    return { rows, openContracts: opens, totals };
  }, [contracts, sales, products]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );
  if (rows.length === 0) return <EmptyState message="Pozisyon hesaplanacak bağlantı yok." />;

  const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

  return (
    <div className="space-y-4">
      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Toplam Bağlanan</div>
          <div className="mt-0.5 text-2xl font-bold">{formatNumber(totals.bought)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Toplam Satılan</div>
          <div className="mt-0.5 text-2xl font-bold">{formatNumber(totals.sold)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className={`p-3 ${totals.open < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
          <div className="text-[11px] uppercase text-gray-500">Açık Pozisyon</div>
          <div className={`mt-0.5 text-2xl font-bold ${totals.open < 0 ? "text-red-600" : "text-emerald-700"}`}>
            {formatNumber(totals.open)}
          </div>
          <div className="text-xs text-gray-400">ton (satılmamış)</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Açık Pozisyon Değeri</div>
          <div className="mt-0.5 text-2xl font-bold">{formatUsd(totals.openValueUsd, 0)}</div>
          <div className="text-xs text-gray-400">maliyetten (USD)</div>
        </Card>
      </div>

      {/* Ürün bazında pozisyon */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-3 font-medium">Ürün</th>
              <th className="px-3 py-3 text-right font-medium">Bağlanan</th>
              <th className="px-3 py-3 text-right font-medium">Satılan</th>
              <th className="px-3 py-3 text-right font-medium">Açık Pozisyon</th>
              <th className="px-3 py-3 text-right font-medium">Yolda</th>
              <th className="px-3 py-3 text-right font-medium">Gelen / Depoda</th>
              <th className="px-3 py-3 text-right font-medium">Ort. Maliyet</th>
              <th className="px-3 py-3 text-right font-medium">Açık Değeri (USD)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product} className="border-b border-border last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3 font-medium">
                  {r.product}
                  {r.fxMissing && (
                    <span className="ml-1 text-xs text-amber-600" title="Bazı sözleşmelerde TCMB kuru yok; ortalama maliyet eksik sözleşmelerle hesaplandı">
                      ⚠
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">{formatNumber(r.bought)}</td>
                <td className="px-3 py-3 text-right">{formatNumber(r.sold)}</td>
                <td className={`px-3 py-3 text-right font-bold ${r.open < 0 ? "text-red-600" : r.open > 0 ? "text-emerald-700" : "text-gray-400"}`}>
                  {formatNumber(r.open)}
                </td>
                <td className="px-3 py-3 text-right text-gray-600">{formatNumber(r.openTransit)}</td>
                <td className="px-3 py-3 text-right text-gray-600">{formatNumber(r.openArrived)}</td>
                <td className="px-3 py-3 text-right">
                  {r.costTon !== null ? `${formatUsd(r.costTon)}/t` : "—"}
                </td>
                <td className="px-3 py-3 text-right">{formatUsd(r.openValueUsd, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-gray-50 text-xs font-bold">
              <td className="px-3 py-2.5">TOPLAM</td>
              <td className="px-3 py-2.5 text-right">{formatNumber(totals.bought)}</td>
              <td className="px-3 py-2.5 text-right">{formatNumber(totals.sold)}</td>
              <td className={`px-3 py-2.5 text-right ${totals.open < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {formatNumber(totals.open)}
              </td>
              <td className="px-3 py-2.5 text-right text-gray-400" colSpan={3}>—</td>
              <td className="px-3 py-2.5 text-right">{formatUsd(totals.openValueUsd, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Açık pozisyonlu gemiler */}
      {openContracts.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold">Açık Pozisyonlu Bağlantılar</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-gray-400">
                  <th className="py-1.5 pr-3 font-medium">Gemi / Sözleşme</th>
                  <th className="py-1.5 pr-3 font-medium">Ürün</th>
                  <th className="py-1.5 pr-3 font-medium">Durum</th>
                  <th className="py-1.5 pr-3 font-medium">ETA</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Bağlanan</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Satılan</th>
                  <th className="py-1.5 text-right font-medium">Açık</th>
                </tr>
              </thead>
              <tbody>
                {openContracts.map((c) => {
                  const so = statusOpt(c.status);
                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/cost/${c.id}`} className="font-medium text-brand hover:underline">
                          {c.label}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{c.product}</td>
                      <td className="py-2 pr-3">{so && <Badge color={so.color}>{so.label}</Badge>}</td>
                      <td className="py-2 pr-3 text-gray-500">
                        {c.eta ? new Date(c.eta).toLocaleDateString("tr-TR") : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">{formatNumber(c.bought)}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">{formatNumber(c.sold)}</td>
                      <td className="py-2 text-right font-semibold text-emerald-700">{formatNumber(c.open)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400">
        Açık pozisyon = bağlanan − satılan (iptal edilenler hariç). &quot;Yolda&quot; = taslak/aktif/yolda
        durumundaki bağlantıların açık tonajı; &quot;Gelen&quot; = gelmiş/tamamlanmış. Ortalama maliyet,
        TCMB kuru kayıtlı sözleşmelerin USD toplamından; depo masrafları bu ekrana dahil değildir
        (gemi bazlı kâr için Gemi Bazlı sekmesine bakın).
      </p>
    </div>
  );
}
