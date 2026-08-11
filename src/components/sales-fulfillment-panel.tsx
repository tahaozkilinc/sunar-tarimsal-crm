"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, DeadlineBadge, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

// Satışlar sekmesinin yanındaki küçük panel: her satışın ne kadarının FİİLEN
// sevk edildiğini % olarak gösterir. "1000 ton satıldı" satış kaydının kendisi;
// gerçekte kaç tonun müşteriye ULAŞTIĞI stock_movements'taki 'outbound_sale'
// kayıtlarından hesaplanır — ikisi FARKLI şeydir (satış ≠ fiili sevkiyat),
// bu panel o farkı tek bakışta gösterir. Fiyat/ticari koşul içermez.
//
// Operasyoncu "Sevkiyatı Bitir" dediğinde (dispatch_closed_at dolar) tonaj tam
// tutmayabilir (eksik/fazla) — bu durum burada da (satışın içinde) kırmızı bir
// uyarı rozetiyle gösterilir; aynı uyarı Satış Operasyon ekranındaki "Kapatılan
// Sevkiyatlar" listesinde operatöre de gösterilir (bkz. sales-dispatch.tsx).

type Sale = {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  product_id: string | null;
  quantity: number | null;
  status: string;
  dispatch_closed_at: string | null;
  final_sale_date: string | null;
};
type Ref = { id: string; name: string };

export function SalesFulfillmentPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dispatched, setDispatched] = useState<Record<string, number>>({});
  const [companies, setCompanies] = useState<Ref[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [soRes, smRes, coRes, prRes] = await Promise.all([
        supabase
          .from("sales_orders")
          .select("id,order_no,customer_id,product_id,quantity,status,dispatch_closed_at,final_sale_date")
          .not("status", "in", "(cancelled)"),
        supabase
          .from("stock_movements")
          .select("sale_id,quantity")
          .eq("movement_type", "outbound_sale")
          .not("sale_id", "is", null),
        supabase.from("companies").select("id,name"),
        supabase.from("products").select("id,name"),
      ]);
      setSales((soRes.data as Sale[]) || []);
      const d: Record<string, number> = {};
      ((smRes.data as { sale_id: string; quantity: number | null }[] | null) || []).forEach((m) => {
        d[m.sale_id] = (d[m.sale_id] || 0) + (Number(m.quantity) || 0);
      });
      setDispatched(d);
      setCompanies((coRes.data as Ref[]) || []);
      setProducts((prRes.data as Ref[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const cName = (id: string | null) => (id && companies.find((c) => c.id === id)?.name) || "—";
  const pName = (id: string | null) => (id && products.find((p) => p.id === id)?.name) || "—";

  // Sıralama: önce tonaj UYUŞMAYAN kapatılmış sevkiyatlar (en dikkat gereken),
  // sonra hâlâ açık/devam eden satışlar (en az tamamlanan önce), en altta
  // sorunsuz kapatılmış (tam sevk edilmiş) satışlar.
  const rows = useMemo(() => {
    return sales
      .map((s) => {
        const qty = Number(s.quantity) || 0;
        const disp = dispatched[s.id] || 0;
        const pct = qty > 0 ? Math.min(100, (disp / qty) * 100) : 0;
        const closed = !!s.dispatch_closed_at;
        const diff = Math.round((disp - qty) * 100) / 100;
        const mismatch = closed && Math.abs(diff) > 0.01;
        return { ...s, qty, disp, pct, closed, diff, mismatch };
      })
      .filter((r) => r.qty > 0)
      .sort((a, b) => {
        const rank = (r: { mismatch: boolean; closed: boolean }) => (r.mismatch ? 0 : r.closed ? 2 : 1);
        const rd = rank(a) - rank(b);
        return rd !== 0 ? rd : a.pct - b.pct;
      });
  }, [sales, dispatched]);

  if (loading) return <Card className="p-4"><div className="flex justify-center py-6"><Spinner /></div></Card>;
  if (rows.length === 0) return null;

  return (
    <Card className="max-h-[70vh] overflow-y-auto p-3">
      <div className="mb-2 px-1 text-xs font-semibold uppercase text-gray-500">
        Sevkiyat Durumu ({rows.length})
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const color = r.mismatch
            ? "bg-red-500"
            : r.pct >= 100
              ? "bg-emerald-500"
              : r.pct > 0
                ? "bg-amber-500"
                : "bg-gray-300";
          const pctColor = r.pct >= 100 ? "text-emerald-700" : r.pct > 0 ? "text-amber-700" : "text-gray-500";
          return (
            <div
              key={r.id}
              className={`rounded-lg border p-2.5 ${r.mismatch ? "border-red-300 bg-red-50" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{cName(r.customer_id)}</div>
                  <div className="truncate text-xs text-gray-500">
                    {pName(r.product_id)}{r.order_no ? ` · ${r.order_no}` : ""}
                  </div>
                  {!r.closed && (
                    <div className="mt-1">
                      <DeadlineBadge date={r.final_sale_date} />
                    </div>
                  )}
                </div>
                {r.mismatch ? (
                  <Badge color="red">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {r.diff > 0 ? "fazla" : "eksik"}
                    </span>
                  </Badge>
                ) : r.closed ? (
                  <Badge color="green">✓ Tamamlandı</Badge>
                ) : (
                  <span className={`shrink-0 text-sm font-bold ${pctColor}`}>%{Math.round(r.pct)}</span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${r.pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                {formatNumber(r.disp)} / {formatNumber(r.qty)} ton sevk edildi
                {r.closed && " · Sevkiyat kapatıldı"}
              </div>
              {r.mismatch && (
                <div className="mt-1 text-[11px] font-medium text-red-600">
                  ⚠ {formatNumber(Math.abs(r.diff))} ton {r.diff > 0 ? "fazla" : "eksik"} sevk edilmiş — sevkiyat
                  tonaj uyuşmadan kapatıldı.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
