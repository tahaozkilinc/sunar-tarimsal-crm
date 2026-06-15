"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, EmptyState, Spinner } from "./ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { ArrowLeft, Printer } from "lucide-react";

type PC = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  supplier_id: string | null;
  product_id: string | null;
  principal_id: string | null;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  currency: string | null;
  incoterm: string | null;
  origin_country: string | null;
  loading_port: string | null;
  eta: string | null;
  laycan_start: string | null;
  laycan_end: string | null;
  status: string;
  buyer: string | null;
  payment_due_date: string | null;
  usd_try: number | null;
  eur_try: number | null;
  fx_date: string | null;
  created_at: string | null;
};
type SO = {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  delivery_date: string | null;
  status: string;
  usd_try: number | null;
  eur_try: number | null;
};
type SM = {
  id: string;
  movement_date: string | null;
  warehouse_id: string | null;
  quantity: number | null;
  movement_type: string | null;
  vehicle_plate: string | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 print:break-inside-avoid">
      <h2 className="mb-3 border-b border-border pb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export function ContractReport({ contractId }: { contractId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [pc, setPc] = useState<PC | null>(null);
  const [sales, setSales] = useState<SO[]>([]);
  const [moves, setMoves] = useState<SM[]>([]);
  const [names, setNames] = useState<{
    products: Record<string, string>;
    companies: Record<string, string>;
    principals: Record<string, string>;
    warehouses: Record<string, string>;
  }>({ products: {}, companies: {}, principals: {}, warehouses: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [c, so, sm, pr, co, pri, wh] = await Promise.all([
        supabase.from("purchase_contracts").select("*").eq("id", contractId).maybeSingle(),
        supabase
          .from("sales_orders")
          .select(
            "id,order_no,customer_id,quantity,price,currency,delivery_date,status,usd_try,eur_try",
          )
          .eq("contract_id", contractId),
        supabase
          .from("stock_movements")
          .select("id,movement_date,warehouse_id,quantity,movement_type,vehicle_plate")
          .eq("contract_id", contractId),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name"),
        supabase.from("principals").select("id,name"),
        supabase.from("warehouses").select("id,name"),
      ]);
      if (!on) return;
      setPc((c.data as PC | null) ?? null);
      setSales((so.data as SO[] | null) || []);
      setMoves((sm.data as SM[] | null) || []);
      const toMap = (rows: { id: string; name: string }[] | null) => {
        const m: Record<string, string> = {};
        (rows || []).forEach((r) => (m[r.id] = r.name));
        return m;
      };
      setNames({
        products: toMap(pr.data as { id: string; name: string }[] | null),
        companies: toMap(co.data as { id: string; name: string }[] | null),
        principals: toMap(pri.data as { id: string; name: string }[] | null),
        warehouses: toMap(wh.data as { id: string; name: string }[] | null),
      });
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, contractId]);

  const calc = useMemo(() => {
    if (!pc) return null;
    const alisTon = Number(pc.quantity) || 0;
    const alisBirim = Number(pc.price) || 0;
    const alisCur = pc.currency || "USD";
    const alisNative = alisTon * alisBirim;
    const alisUsd = toUsd(alisNative, alisCur, pc.usd_try, pc.eur_try);
    const costPerTonUsd = alisTon > 0 && alisUsd !== null ? alisUsd / alisTon : null;

    const active = sales.filter((s) => s.status !== "cancelled");
    const satisTon = active.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
    let satisUsd = 0;
    let satisUsdEksik = false; // bazı satışların kuru yoksa kâr eksik hesaplanır
    active.forEach((s) => {
      const u = toUsd((Number(s.quantity) || 0) * (Number(s.price) || 0), s.currency, s.usd_try, s.eur_try);
      if (u === null) satisUsdEksik = true;
      else satisUsd += u;
    });

    const allocCostUsd = costPerTonUsd !== null ? satisTon * costPerTonUsd : null;
    const karUsd = allocCostUsd !== null ? satisUsd - allocCostUsd : null;
    const karTonUsd = karUsd !== null && satisTon > 0 ? karUsd / satisTon : null;

    const bosaltilan = moves.reduce((a, m) => a + (Number(m.quantity) || 0), 0);

    return {
      alisTon,
      alisBirim,
      alisCur,
      alisNative,
      alisUsd,
      costPerTonUsd,
      satisTon,
      satisUsd,
      satisUsdEksik,
      karUsd,
      karTonUsd,
      kalanSatilabilir: alisTon - satisTon,
      bosaltilan,
      kalanBosaltilacak: alisTon - bosaltilan,
    };
  }, [pc, sales, moves]);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  if (!pc || !calc)
    return <EmptyState message="Bağlantı bulunamadı veya görüntüleme yetkiniz yok." />;

  const statusOpt = CONTRACT_STATUS_OPTIONS.find((o) => o.value === pc.status);
  const parite = pc.usd_try && pc.eur_try ? pc.eur_try / pc.usd_try : null;
  const title = pc.vessel || pc.contract_no || "Bağlantı";

  return (
    <div className="space-y-4">
      {/* Aksiyon çubuğu - yazdırmada gizli */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/cost"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Maliyet&apos;e dön
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"
        >
          <Printer className="h-4 w-4" /> PDF / Yazdır
        </button>
      </div>

      {/* Rapor başlığı */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="text-xs text-gray-500">Sunar Tarımsal — Gemi (Bağlantı) Raporu</div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="text-sm text-gray-500">
            {names.products[pc.product_id || ""] || "Ürünsüz"}
            {pc.contract_no ? ` · ${pc.contract_no}` : ""}
          </div>
        </div>
        <div className="text-right">
          {statusOpt && <Badge color={statusOpt.color}>{statusOpt.label}</Badge>}
          <div className="mt-1 text-xs text-gray-400">
            Rapor: {formatDate(new Date().toISOString())}
          </div>
        </div>
      </div>

      {/* USD kâr-zarar özeti */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-gray-500">Toplam Maliyet (USD)</div>
          <div className="mt-1 text-lg font-bold">{formatUsd(calc.alisUsd, 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-gray-500">Satış Geliri (USD)</div>
          <div className="mt-1 text-lg font-bold">{formatUsd(calc.satisUsd, 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-gray-500">Kâr (USD)</div>
          <div
            className={`mt-1 text-lg font-bold ${
              calc.karUsd === null
                ? "text-gray-400"
                : calc.karUsd < 0
                  ? "text-red-600"
                  : "text-emerald-700"
            }`}
          >
            {calc.karUsd !== null ? formatUsd(calc.karUsd, 0) : "-"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-gray-500">Ton Başına Kâr (USD)</div>
          <div className="mt-1 text-lg font-bold text-emerald-700">
            {calc.karTonUsd !== null ? formatUsd(calc.karTonUsd) : "-"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Satın Alma">
          <Row label="Tedarikçi" value={names.companies[pc.supplier_id || ""] || "-"} />
          <Row label="Kimin Adına" value={names.principals[pc.principal_id || ""] || "-"} />
          <Row label="Menşe / Yükleme Limanı" value={`${pc.origin_country || "-"} · ${pc.loading_port || "-"}`} />
          <Row label="Teslim Şekli (Incoterm)" value={pc.incoterm || "-"} />
          <Row label="ETA" value={formatDate(pc.eta)} />
          <Row
            label="Laycan"
            value={`${formatDate(pc.laycan_start)} – ${formatDate(pc.laycan_end)}`}
          />
          <Row label="Miktar" value={`${formatNumber(calc.alisTon)} ${pc.unit || "ton"}`} />
          <Row
            label="Birim Fiyat"
            value={calc.alisBirim > 0 ? formatMoney(calc.alisBirim, calc.alisCur) : "-"}
          />
          <Row
            label="Toplam Maliyet"
            value={
              <>
                {calc.alisNative > 0 ? formatMoney(calc.alisNative, calc.alisCur) : "-"}
                <span className="ml-2 text-gray-400">/ {formatUsd(calc.alisUsd, 0)}</span>
              </>
            }
          />
          <Row label="Ödeme Tarihi" value={formatDate(pc.payment_due_date)} />
          <Row
            label="TCMB Kuru"
            value={
              pc.usd_try
                ? `USD/TRY ${formatNumber(pc.usd_try, 4)}${
                    parite ? ` · EUR/USD ${formatNumber(parite, 4)}` : ""
                  }${pc.fx_date ? ` (${formatDate(pc.fx_date)})` : ""}`
                : "Kur kaydı yok"
            }
          />
        </Section>

        <Section title="Operasyon (Boşaltma)">
          <div className="mb-2 flex gap-4">
            <div>
              <div className="text-xs text-gray-500">Boşaltılan</div>
              <div className="text-base font-bold">{formatNumber(calc.bosaltilan)} ton</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Kalan (boşaltılacak)</div>
              <div
                className={`text-base font-bold ${calc.kalanBosaltilacak < 0 ? "text-amber-600" : ""}`}
              >
                {formatNumber(calc.kalanBosaltilacak)} ton
              </div>
            </div>
          </div>
          {moves.length === 0 ? (
            <div className="py-2 text-sm text-gray-500">Boşaltma hareketi yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
                  <th className="py-1.5 font-medium">Tarih</th>
                  <th className="py-1.5 font-medium">Depo</th>
                  <th className="py-1.5 font-medium">Plaka</th>
                  <th className="py-1.5 text-right font-medium">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {moves
                  .slice()
                  .sort((a, b) => (b.movement_date || "").localeCompare(a.movement_date || ""))
                  .map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="py-1.5">{formatDate(m.movement_date)}</td>
                      <td className="py-1.5">{names.warehouses[m.warehouse_id || ""] || "-"}</td>
                      <td className="py-1.5">{m.vehicle_plate || "-"}</td>
                      <td className="py-1.5 text-right">{formatNumber(m.quantity)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Satış (Müşteri Bazlı)">
        <div className="mb-2 flex gap-4">
          <div>
            <div className="text-xs text-gray-500">Satılan</div>
            <div className="text-base font-bold">{formatNumber(calc.satisTon)} ton</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Kalan (satılabilir)</div>
            <div
              className={`text-base font-bold ${calc.kalanSatilabilir < 0 ? "text-amber-600" : ""}`}
            >
              {formatNumber(calc.kalanSatilabilir)} ton
            </div>
          </div>
        </div>
        {sales.length === 0 ? (
          <div className="py-2 text-sm text-gray-500">Bu gemiye bağlı satış yok.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
                <th className="py-1.5 font-medium">Müşteri</th>
                <th className="py-1.5 font-medium">Tarih</th>
                <th className="py-1.5 text-right font-medium">Miktar</th>
                <th className="py-1.5 text-right font-medium">Birim Fiyat</th>
                <th className="py-1.5 text-right font-medium">Tutar (USD)</th>
                <th className="py-1.5 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {sales
                .slice()
                .sort((a, b) => (b.delivery_date || "").localeCompare(a.delivery_date || ""))
                .map((s) => {
                  const rev = toUsd(
                    (Number(s.quantity) || 0) * (Number(s.price) || 0),
                    s.currency,
                    s.usd_try,
                    s.eur_try,
                  );
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="py-1.5">{names.companies[s.customer_id || ""] || "-"}</td>
                      <td className="py-1.5">{formatDate(s.delivery_date)}</td>
                      <td className="py-1.5 text-right">{formatNumber(s.quantity)}</td>
                      <td className="py-1.5 text-right">
                        {s.price ? formatMoney(s.price, s.currency || "TRY") : "-"}
                      </td>
                      <td className="py-1.5 text-right">{formatUsd(rev, 0)}</td>
                      <td className="py-1.5">
                        {s.status === "cancelled" ? (
                          <span className="text-gray-400">İptal</span>
                        ) : (
                          s.order_no || "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </Section>

      {(calc.alisUsd === null || calc.satisUsdEksik) && (
        <p className="text-xs text-amber-600 print:text-black">
          Uyarı: Bazı kayıtlarda TCMB kuru bulunmadığı için USD tutarları/kâr eksik hesaplanmış
          olabilir. (Kur, kayıt oluşturulurken otomatik alınır; eski kayıtlarda elle girilebilir.)
        </p>
      )}
    </div>
  );
}
