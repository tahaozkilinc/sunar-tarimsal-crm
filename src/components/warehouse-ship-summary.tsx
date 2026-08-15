"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { attributeByWarehouse, isInboundType, UNASSIGNED_KEY, type AttributionMovement } from "@/lib/stock-attribution";

// Stok Durumu'nun depo satırını açtığında gösterilen HAFİF özet: yalnızca
// gemi, hammadde, depoya ilk giriş tarihi + o tarihten beri kaç gündür
// beklediği (canlı sayaç) ve mevcut miktar. Depo yönetiminin tamamı (fotoğraf,
// yetkililer, milli/yerli, tam geçmiş) artık CRM -> Depolar'a taşındı (bkz.
// crm-tabs.tsx, WarehouseDetailExtra) — burası kasıtlı olarak sade tutuldu.
//
// Depoda birden fazla gemiden kalan varsa üstte gemi bazlı bir kırılım
// çubuğu gösterilir (hangi geminin malı ne kadar yer kaplıyor); tek gemi
// varsa çubuk tek renk/bilgisiz kalacağından gösterilmez.

type Movement = AttributionMovement & {
  contract_id: string | null;
  movement_date: string;
};
type ContractRef = { id: string; vessel: string | null; contract_no: string | null; product_id: string | null };
type ProductRef = { id: string; name: string };

const SHIP_BAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500",
  "bg-pink-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(dateStr: string): number {
  const start = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / DAY_MS));
}

function WaitingBadge({ days }: { days: number }) {
  const tone =
    days > 30 ? "bg-red-50 text-red-700" : days > 15 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {days} gündür
    </span>
  );
}

export function WarehouseShipSummary({ warehouseId }: { warehouseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [contracts, setContracts] = useState<ContractRef[]>([]);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const [{ data }, { data: pData }] = await Promise.all([
        supabase
          .from("stock_movements")
          .select("id,warehouse_id,movement_type,quantity,contract_id,movement_date")
          .eq("warehouse_id", warehouseId),
        supabase.from("products").select("id,name"),
      ]);
      if (!on) return;
      const rows = (data as Movement[] | null) || [];
      setMovements(rows);
      setProducts((pData as ProductRef[] | null) || []);

      const contractIds = Array.from(new Set(rows.map((r) => r.contract_id).filter(Boolean))) as string[];
      const { data: cData } = contractIds.length > 0
        ? await supabase.from("purchase_contracts").select("id,vessel,contract_no,product_id").in("id", contractIds)
        : { data: [] as ContractRef[] };
      if (!on) return;
      setContracts((cData as ContractRef[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, warehouseId]);

  const contractLabel = (id: string) =>
    contracts.find((c) => c.id === id)?.vessel || contracts.find((c) => c.id === id)?.contract_no || "—";
  const productName = (id: string | null) => (id && products.find((p) => p.id === id)?.name) || "—";

  const rows = useMemo(() => {
    const remaining = attributeByWarehouse(movements, (r) => r.contract_id).get(warehouseId) || new Map();
    // Bu geminin bu depoya İLK girdiği tarih — yalnızca Giriş tipi hareketler.
    const firstIn = new Map<string, string>();
    movements.forEach((m) => {
      if (!m.contract_id || !isInboundType(m.movement_type)) return;
      const cur = firstIn.get(m.contract_id);
      if (!cur || m.movement_date < cur) firstIn.set(m.contract_id, m.movement_date);
    });
    return Array.from(remaining.entries())
      .map(([key, ton]) => {
        const isUnassigned = key === UNASSIGNED_KEY;
        const contract = isUnassigned ? undefined : contracts.find((c) => c.id === key);
        const firstDate = isUnassigned ? null : (firstIn.get(key) ?? null);
        return {
          key,
          ship: isUnassigned ? "Kaynağı belirsiz" : contractLabel(key),
          product: productName(contract?.product_id ?? null),
          firstDate,
          daysWaiting: firstDate ? daysSince(firstDate) : null,
          ton,
        };
      })
      .sort((a, b) => b.ton - a.ton);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouseId, contracts, products]);

  if (loading) return <div className="flex justify-center py-4"><Spinner /></div>;
  if (rows.length === 0) return <div className="text-xs text-gray-400">Bu depoda kayıtlı giriş yok.</div>;

  const totalTon = rows.reduce((a, r) => a + r.ton, 0);

  return (
    <div className="space-y-2">
      {/* Gemi bazlı kırılım çubuğu — yalnızca birden fazla kaynak varsa (tek
          kaynakta çubuk tek renk/bilgisiz olur, gerek yok). */}
      {rows.length > 1 && totalTon > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className={SHIP_BAR_COLORS[i % SHIP_BAR_COLORS.length]}
              style={{ width: `${Math.max(0, Math.min(100, (r.ton / totalTon) * 100))}%` }}
              title={`${r.ship}: ${formatNumber(r.ton)} ton`}
            />
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Gemi</th>
              <th className="px-3 py-2 font-medium">Hammadde</th>
              <th className="px-3 py-2 font-medium">Depoya İlk Giriş</th>
              <th className="px-3 py-2 font-medium">Bekleme Süresi</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {rows.length > 1 && (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SHIP_BAR_COLORS[i % SHIP_BAR_COLORS.length]}`} />
                    )}
                    {r.ship}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{r.product}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.firstDate ? formatDate(r.firstDate) : "—"}</td>
                <td className="px-3 py-2">{r.daysWaiting !== null ? <WaitingBadge days={r.daysWaiting} /> : "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.ton)} ton</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
