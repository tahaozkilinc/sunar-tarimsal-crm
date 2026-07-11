"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, EmptyState, Input, Modal, Spinner } from "./ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { CheckCircle, RotateCcw } from "lucide-react";

// Tahsilat takibi: satışların ödenme durumu ve müşteri bazında açık bakiye.
// Alış tarafındaki ödeme onayının (0017) simetriği: "Tahsil Edildi" işaretlemek
// referans (dekont no vb.) ister ve set_sale_paid RPC'siyle yapılır (admin+finans).

type SO = {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  delivery_date: string | null;
  status: string;
  is_paid: boolean;
  payment_ref: string | null;
  paid_at: string | null;
  usd_try: number | null;
  eur_try: number | null;
};
type Ref = { id: string; name: string };

export function CollectionsView({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canMark = ["admin", "finans"].includes(baseRole(role)) && !role.endsWith("_view");

  const [sales, setSales] = useState<SO[]>([]);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  // "Tahsil Edildi" onay penceresi
  const [markSale, setMarkSale] = useState<SO | null>(null);
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [markErr, setMarkErr] = useState<string | null>(null);

  const load = async () => {
    const [so, co] = await Promise.all([
      supabase
        .from("sales_orders")
        .select("id,order_no,customer_id,quantity,price,currency,delivery_date,status,is_paid,payment_ref,paid_at,usd_try,eur_try")
        .neq("status", "cancelled")
        .order("delivery_date", { ascending: true }),
      supabase.from("companies").select("id,name"),
    ]);
    if (so.error) setError(so.error.message);
    setSales((so.data as SO[]) || []);
    const m: Record<string, string> = {};
    ((co.data as Ref[] | null) || []).forEach((c) => (m[c.id] = c.name));
    setCompanies(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cName = (id: string | null) => (id && companies[id]) || "Müşteri belirtilmemiş";
  const amountOf = (s: SO) => (Number(s.quantity) || 0) * (Number(s.price) || 0);

  const { open, paid, byCustomer, totals } = useMemo(() => {
    const open = sales.filter((s) => !s.is_paid && amountOf(s) > 0);
    const paid = sales.filter((s) => s.is_paid);
    const byCustomer = new Map<string, { name: string; rows: SO[]; usd: number | null }>();
    open.forEach((s) => {
      const key = s.customer_id || "_";
      const e = byCustomer.get(key) || { name: cName(s.customer_id), rows: [], usd: 0 as number | null };
      e.rows.push(s);
      const u = toUsd(amountOf(s), s.currency, s.usd_try, s.eur_try);
      e.usd = u === null || e.usd === null ? null : e.usd + u;
      byCustomer.set(key, e);
    });
    const totals = { count: open.length, usd: 0 as number | null };
    byCustomer.forEach((e) => {
      totals.usd = e.usd === null || totals.usd === null ? null : totals.usd + e.usd;
    });
    return {
      open,
      paid,
      byCustomer: Array.from(byCustomer.entries()).sort(
        (a, b) => (b[1].usd ?? 0) - (a[1].usd ?? 0),
      ),
      totals,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, companies]);

  const doMark = async () => {
    if (!markSale) return;
    setSaving(true);
    setMarkErr(null);
    const { error: err } = await supabase.rpc("set_sale_paid", {
      p_sale_id: markSale.id,
      p_paid: true,
      p_payment_ref: ref.trim(),
    });
    setSaving(false);
    if (err) { setMarkErr(err.message); return; }
    setMarkSale(null);
    setRef("");
    await load();
  };

  const undoMark = async (s: SO) => {
    if (!window.confirm("Tahsilat işareti geri alınsın mı?")) return;
    const { error: err } = await supabase.rpc("set_sale_paid", {
      p_sale_id: s.id,
      p_paid: false,
    });
    if (err) alert(err.message);
    await load();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Açık Tahsilat</div>
          <div className="mt-0.5 text-2xl font-bold">{open.length}</div>
          <div className="text-xs text-gray-400">satış</div>
        </Card>
        <Card className={`p-3 ${totals.usd && totals.usd > 0 ? "bg-amber-50" : ""}`}>
          <div className="text-[11px] uppercase text-gray-500">Toplam Açık Bakiye</div>
          <div className="mt-0.5 text-2xl font-bold">{formatUsd(totals.usd, 0)}</div>
          <div className="text-xs text-gray-400">TCMB kuruyla USD</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Tahsil Edilen</div>
          <div className="mt-0.5 text-2xl font-bold text-emerald-700">{paid.length}</div>
          <div className="text-xs text-gray-400">satış</div>
        </Card>
      </div>

      {/* Müşteri bazında açık bakiye */}
      {open.length === 0 ? (
        <EmptyState message="Açık tahsilat yok — tüm satışlar tahsil edilmiş." />
      ) : (
        byCustomer.map(([custId, e]) => (
          <Card key={custId} className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{e.name}</span>
              <span className="text-sm">
                Açık bakiye: <b>{formatUsd(e.usd, 0)}</b>
                <span className="ml-1 text-xs text-gray-400">({e.rows.length} satış)</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase text-gray-400">
                    <th className="py-1.5 pr-3 font-medium">Satış No</th>
                    <th className="py-1.5 pr-3 font-medium">Teslim</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Miktar</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Tutar</th>
                    <th className="py-1.5 pr-3 text-right font-medium">USD</th>
                    <th className="py-1.5 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {e.rows.map((s) => {
                    const u = toUsd(amountOf(s), s.currency, s.usd_try, s.eur_try);
                    return (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">{s.order_no || "—"}</td>
                        <td className="py-2 pr-3 text-gray-500">{formatDate(s.delivery_date)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(s.quantity)} t</td>
                        <td className="py-2 pr-3 text-right">
                          {formatMoney(amountOf(s), s.currency || "TRY")}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-600">
                          {u !== null ? formatUsd(u, 0) : "kur yok"}
                        </td>
                        <td className="py-2 text-right">
                          {canMark && (
                            <Button size="sm" variant="secondary" onClick={() => { setMarkSale(s); setRef(""); setMarkErr(null); }}>
                              <CheckCircle className="h-3.5 w-3.5" /> Tahsil Edildi
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      {/* Tahsil edilenler (katlanır) */}
      {paid.length > 0 && (
        <Card className="p-4">
          <button
            onClick={() => setShowPaid((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold">Tahsil Edilenler ({paid.length})</span>
            <span className="text-xs text-brand">{showPaid ? "Gizle" : "Göster"}</span>
          </button>
          {showPaid && (
            <div className="mt-3 divide-y divide-border">
              {paid.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{cName(s.customer_id)}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {s.order_no || "—"} · {formatMoney(amountOf(s), s.currency || "TRY")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="green">Tahsil edildi</Badge>
                    <span className="text-xs text-gray-400">
                      {s.payment_ref} · {formatDate(s.paid_at)}
                    </span>
                    {canMark && (
                      <button
                        onClick={() => undoMark(s)}
                        className="rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                        title="Geri al"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <p className="text-xs text-gray-400">
        Açık bakiye = iptal olmayan ve tahsil edilmemiş satışların tutarı; USD çevrimi kaydın
        günündeki TCMB kuruyladır. &quot;Tahsil Edildi&quot; işaretlemek admin + finans yetkisidir ve
        referans (dekont no) zorunludur.
      </p>

      {/* Tahsil onayı */}
      <Modal open={!!markSale} onClose={() => setMarkSale(null)} title="Tahsilatı Onayla">
        {markSale && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <b>{cName(markSale.customer_id)}</b> · {markSale.order_no || "—"} ·{" "}
              {formatMoney(amountOf(markSale), markSale.currency || "TRY")}
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Tahsilat referansı (dekont no) <span className="text-red-500">*</span>
              </label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="örn. HVL-2026-0113" />
            </div>
            {markErr && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {markErr}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setMarkSale(null)}>İptal</Button>
              <Button onClick={doMark} disabled={saving || !ref.trim()}>
                {saving ? "Kaydediliyor..." : "Tahsil Edildi"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
