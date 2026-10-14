"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { Badge } from "./ui";

type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  loading_tonnage: number | null;
  unit: string | null;
  status: string;
};
type Ref = { id: string; name: string };

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

// Süreç sonucunda 3 farklı tonaj: Sözleşme (quantity), Yükleme (loading_tonnage,
// menşede fiilen yüklenen) ve Boşaltma (stock_movements'tan canlı toplam) —
// ödeme bu üçü arasındaki farka göre yapılabiliyor. Bu rapor, tüm gemileri bir
// arada gösterip aradaki farkları görünür kılar (kullanıcı isteği).
function Diff({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="text-emerald-600">0 {unit}</span>;
  const positive = value > 0;
  return (
    <span className={positive ? "text-amber-600" : "text-red-600"}>
      {positive ? "+" : ""}{formatNumber(value)} {unit}
    </span>
  );
}

export function ShipFinalization() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, p, m] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,quantity,loading_tonnage,unit,status")
          .neq("status", "cancelled")
          .order("eta", { ascending: false }),
        supabase.from("products").select("id,name"),
        supabase.from("stock_movements").select("contract_id,quantity").eq("movement_type", "inbound"),
      ]);
      setRows((c.data as Contract[] | null) || []);
      setProducts((p.data as Ref[] | null) || []);
      const sums: Record<string, number> = {};
      ((m.data as { contract_id: string | null; quantity: number | null }[] | null) || []).forEach((mv) => {
        if (!mv.contract_id) return;
        sums[mv.contract_id] = (sums[mv.contract_id] || 0) + (Number(mv.quantity) || 0);
      });
      setDrawn(sums);
      setLoading(false);
    })();
  }, [supabase]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name || "Ürünsüz";

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (rows.length === 0) return <EmptyState message="Henüz bağlantı yok." />;

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-medium">Finalizasyon</div>
      <div className="mb-3 text-xs text-gray-500">
        Sözleşme / Yükleme / Boşaltma tonajları ve aralarındaki farklar — ödeme bu farka göre yapılabiliyor.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
              <th className="py-2 pr-3 font-medium">Gemi / Sözleşme</th>
              <th className="py-2 pr-3 font-medium">Ürün</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 pr-3 text-right font-medium">Sözleşme Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Yükleme Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Fark (Yükleme−Sözleşme)</th>
              <th className="py-2 pr-3 text-right font-medium">Boşaltma Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Fark (Boşaltma−Yükleme)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const unit = c.unit || "ton";
              const contracted = Number(c.quantity) || 0;
              const loaded = c.loading_tonnage != null ? Number(c.loading_tonnage) : null;
              const discharged = drawn[c.id] || 0;
              const st = statusOpt(c.status);
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium">{c.vessel || c.contract_no || "—"}</td>
                  <td className="py-2 pr-3 text-gray-500">{productName(c.product_id)}</td>
                  <td className="py-2 pr-3">{st && <Badge color={st.color}>{st.label}</Badge>}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(contracted)} {unit}</td>
                  <td className="py-2 pr-3 text-right">{loaded != null ? `${formatNumber(loaded)} ${unit}` : "-"}</td>
                  <td className="py-2 pr-3 text-right">
                    {loaded != null ? <Diff value={loaded - contracted} unit={unit} /> : "-"}
                  </td>
                  <td className="py-2 pr-3 text-right">{formatNumber(discharged)} {unit}</td>
                  <td className="py-2 pr-3 text-right">
                    {loaded != null ? <Diff value={discharged - loaded} unit={unit} /> : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
