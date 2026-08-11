"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";

// "Bekleyen Gelişler" sekmesinin yanındaki küçük panel: her geminin ne kadarı
// FİİLEN boşaltıldığını % olarak gösterir — Satışlar sekmesindeki sevkiyat
// panelinin (sales-fulfillment-panel.tsx) alım tarafındaki simetriği. Sözleşme
// tonajı ile fiilen çekilen (stock_movements 'inbound') FARKLI şeydir; bu panel
// o farkı satış paneliyle aynı görsel dilde (yüzde + çubuk) gösterir.

type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  status: string;
};
type Ref = { id: string; name: string };

const EXCLUDED_STATUS = new Set(["cancelled", "completed"]);

export function OperationsFulfillmentPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cRes, mRes, pRes] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,quantity,status"),
        supabase
          .from("stock_movements")
          .select("contract_id,quantity")
          .eq("movement_type", "inbound")
          .not("contract_id", "is", null),
        supabase.from("products").select("id,name"),
      ]);
      setRows(((cRes.data as Contract[]) || []).filter((c) => !EXCLUDED_STATUS.has(c.status)));
      const d: Record<string, number> = {};
      ((mRes.data as { contract_id: string; quantity: number | null }[] | null) || []).forEach((m) => {
        d[m.contract_id] = (d[m.contract_id] || 0) + (Number(m.quantity) || 0);
      });
      setDrawn(d);
      setProducts((pRes.data as Ref[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const pName = (id: string | null) => (id && products.find((p) => p.id === id)?.name) || "—";

  // En az tamamlanan (en çok dikkat gereken) önce; %100 olanlar en altta.
  const list = useMemo(() => {
    return rows
      .map((c) => {
        const qty = Number(c.quantity) || 0;
        const d = drawn[c.id] || 0;
        const pct = qty > 0 ? Math.min(100, (d / qty) * 100) : 0;
        return { ...c, qty, drawn: d, pct };
      })
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.pct - b.pct);
  }, [rows, drawn]);

  if (loading) return <Card className="p-4"><div className="flex justify-center py-6"><Spinner /></div></Card>;
  if (list.length === 0) return null;

  return (
    <Card className="max-h-[70vh] overflow-y-auto p-3">
      <div className="mb-2 px-1 text-xs font-semibold uppercase text-gray-500">
        Gemi Boşaltma Durumu ({list.length})
      </div>
      <div className="space-y-2">
        {list.map((r) => {
          const color = r.pct >= 100 ? "bg-emerald-500" : r.pct > 0 ? "bg-amber-500" : "bg-gray-300";
          const pctColor = r.pct >= 100 ? "text-emerald-700" : r.pct > 0 ? "text-amber-700" : "text-gray-500";
          return (
            <div key={r.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.vessel || r.contract_no || "—"}</div>
                  <div className="truncate text-xs text-gray-500">
                    {pName(r.product_id)}{r.contract_no && r.vessel ? ` · ${r.contract_no}` : ""}
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-bold ${pctColor}`}>%{Math.round(r.pct)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${r.pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                {formatNumber(r.drawn)} / {formatNumber(r.qty)} ton boşaltıldı
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
