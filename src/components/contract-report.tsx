"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, EmptyState, Spinner } from "./ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { ArrowLeft, Leaf, Printer } from "lucide-react";

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
  eta: string | null;
  status: string;
  usd_try: number | null;
  eur_try: number | null;
  fx_date: string | null;
};
type SO = {
  id: string;
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
  quantity: number | null;
  movement_type: string | null;
};

type CustomerLine = {
  id: string;
  name: string;
  ton: number;
  lastDate: string | null;
  satisUsd: number | null;
  karUsd: number | null;
};

export function ContractReport({ contractId }: { contractId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [pc, setPc] = useState<PC | null>(null);
  const [sales, setSales] = useState<SO[]>([]);
  const [moves, setMoves] = useState<SM[]>([]);
  const [names, setNames] = useState<{
    products: Record<string, string>;
    companies: Record<string, string>;
    principals: Record<string, string>;
  }>({ products: {}, companies: {}, principals: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [c, so, sm, pr, co, pri] = await Promise.all([
        supabase.from("purchase_contracts").select("*").eq("id", contractId).maybeSingle(),
        supabase
          .from("sales_orders")
          .select("id,customer_id,quantity,price,currency,delivery_date,status,usd_try,eur_try")
          .eq("contract_id", contractId),
        supabase
          .from("stock_movements")
          .select("id,quantity,movement_type")
          .eq("contract_id", contractId),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name"),
        supabase.from("principals").select("id,name"),
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

    let satisUsd: number | null = 0;
    const byCustomer = new Map<string, SO[]>();
    active.forEach((s) => {
      const key = s.customer_id || "_";
      const arr = byCustomer.get(key) || [];
      arr.push(s);
      byCustomer.set(key, arr);
      const u = toUsd((Number(s.quantity) || 0) * (Number(s.price) || 0), s.currency, s.usd_try, s.eur_try);
      if (u === null) satisUsd = null;
      else if (satisUsd !== null) satisUsd += u;
    });

    const customers: CustomerLine[] = Array.from(byCustomer.entries())
      .map(([id, sos]) => {
        const ton = sos.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
        let cUsd: number | null = 0;
        sos.forEach((s) => {
          const u = toUsd((Number(s.quantity) || 0) * (Number(s.price) || 0), s.currency, s.usd_try, s.eur_try);
          if (u === null) cUsd = null;
          else if (cUsd !== null) cUsd += u;
        });
        const allocCost = costPerTonUsd !== null ? ton * costPerTonUsd : null;
        const karUsd = cUsd !== null && allocCost !== null ? cUsd - allocCost : null;
        const lastDate = sos
          .map((s) => s.delivery_date)
          .filter(Boolean)
          .sort((a, b) => (b || "").localeCompare(a || ""))[0] || null;
        return {
          id,
          name: id === "_" ? "Müşteri belirtilmemiş" : names.companies[id] || "—",
          ton,
          lastDate,
          satisUsd: cUsd,
          karUsd,
        };
      })
      .sort((a, b) => b.ton - a.ton);

    const allocCostTotal = costPerTonUsd !== null ? satisTon * costPerTonUsd : null;
    const karUsd = satisUsd !== null && allocCostTotal !== null ? satisUsd - allocCostTotal : null;
    const karTonUsd = karUsd !== null && satisTon > 0 ? karUsd / satisTon : null;

    const bosaltilan = moves
      .filter((m) => m.movement_type === "inbound")
      .reduce((a, m) => a + (Number(m.quantity) || 0), 0);

    return {
      alisTon,
      alisBirim,
      alisCur,
      alisNative,
      alisUsd,
      satisTon,
      satisUsd,
      karUsd,
      karTonUsd,
      bosaltilan,
      kalanSatilabilir: alisTon - satisTon,
      customers,
      fxMissing: (alisBirim > 0 && alisUsd === null) || satisUsd === null,
    };
  }, [pc, sales, moves, names.companies]);

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
  const unit = pc.unit || "ton";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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

      {/* ===== Tek sayfa kurumsal rapor ===== */}
      <div className="report-sheet rounded-2xl border border-border bg-white p-6 shadow-sm print:rounded-none print:p-0">
        {/* Antet */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight">SUNAR TARIMSAL</div>
              <div className="text-xs uppercase tracking-widest text-gray-400">
                Gemi · Satış &amp; Maliyet Raporu
              </div>
            </div>
          </div>
          <div className="text-right">
            {statusOpt && <Badge color={statusOpt.color}>{statusOpt.label}</Badge>}
            <div className="mt-1 text-xs text-gray-400">
              {formatDate(new Date().toISOString())}
            </div>
          </div>
        </div>

        {/* Başlık */}
        <div className="flex flex-wrap items-end justify-between gap-2 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <div className="mt-0.5 text-sm text-gray-500">
              {names.products[pc.product_id || ""] || "Ürünsüz"}
              {pc.contract_no ? ` · Sözleşme ${pc.contract_no}` : ""}
              {pc.principal_id && names.principals[pc.principal_id]
                ? ` · ${names.principals[pc.principal_id]} adına`
                : ""}
            </div>
          </div>
        </div>

        {/* Finansal özet (USD) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-gray-50 p-3 print:border print:border-border">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Toplam Maliyet</div>
            <div className="mt-1 text-lg font-bold">{formatUsd(calc.alisUsd, 0)}</div>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 print:border print:border-border">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Satış Geliri</div>
            <div className="mt-1 text-lg font-bold">{formatUsd(calc.satisUsd, 0)}</div>
          </div>
          <div
            className={`rounded-xl p-3 print:border print:border-border ${
              calc.karUsd !== null && calc.karUsd < 0 ? "bg-red-50" : "bg-emerald-50"
            }`}
          >
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Kâr</div>
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
          <div className="rounded-xl bg-gray-50 p-3 print:border print:border-border">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Ton Başına Kâr</div>
            <div className="mt-1 text-lg font-bold text-emerald-700">
              {calc.karTonUsd !== null ? formatUsd(calc.karTonUsd) : "-"}
            </div>
          </div>
        </div>

        {/* Alış bilgileri + Ton akışı */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="report-avoid-break rounded-xl border border-border p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Alış Bilgileri
            </h2>
            <dl className="divide-y divide-border text-sm">
              <InfoRow label="Tedarikçi" value={names.companies[pc.supplier_id || ""] || "-"} />
              <InfoRow label="Menşe" value={pc.origin_country || "-"} />
              <InfoRow label="Teslim Şekli" value={pc.incoterm || "-"} />
              <InfoRow label="ETA" value={formatDate(pc.eta)} />
              <InfoRow label="Miktar" value={`${formatNumber(calc.alisTon)} ${unit}`} />
              <InfoRow
                label="Toplam Maliyet"
                value={calc.alisNative > 0 ? formatMoney(calc.alisNative, calc.alisCur) : "-"}
              />
              <InfoRow
                label="TCMB Kuru"
                value={
                  pc.usd_try
                    ? `USD/TRY ${formatNumber(pc.usd_try, 4)}${
                        parite ? ` · EUR/USD ${formatNumber(parite, 4)}` : ""
                      }`
                    : "Kur kaydı yok"
                }
              />
            </dl>
          </div>

          <div className="report-avoid-break rounded-xl border border-border p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Ton Akışı
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <FlowStat label="Bağlı" value={calc.alisTon} unit={unit} />
              <FlowStat label="Boşaltılan" value={calc.bosaltilan} unit={unit} />
              <FlowStat label="Satılan" value={calc.satisTon} unit={unit} />
              <FlowStat
                label="Kalan (satılabilir)"
                value={calc.kalanSatilabilir}
                unit={unit}
                warn={calc.kalanSatilabilir < 0}
              />
            </div>
            {/* İlerleme çubuğu: satılan / bağlı */}
            {calc.alisTon > 0 && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                  <span>Satış gerçekleşme</span>
                  <span>
                    %{formatNumber(Math.min(100, (calc.satisTon / calc.alisTon) * 100), 0)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${Math.min(100, (calc.satisTon / calc.alisTon) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Müşteri bazlı satış */}
        <div className="report-avoid-break mt-4 rounded-xl border border-border p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Müşteri Bazlı Satış
          </h2>
          {calc.customers.length === 0 ? (
            <div className="py-2 text-sm text-gray-500">Bu gemiye bağlı satış yok.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-gray-400">
                  <th className="py-1.5 font-medium">Müşteri</th>
                  <th className="py-1.5 font-medium">Son Teslim</th>
                  <th className="py-1.5 text-right font-medium">Ton</th>
                  <th className="py-1.5 text-right font-medium">Gelir (USD)</th>
                  <th className="py-1.5 text-right font-medium">Kâr (USD)</th>
                </tr>
              </thead>
              <tbody>
                {calc.customers.map((cu) => (
                  <tr key={cu.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 font-medium">{cu.name}</td>
                    <td className="py-2 text-gray-500">{formatDate(cu.lastDate)}</td>
                    <td className="py-2 text-right">{formatNumber(cu.ton)}</td>
                    <td className="py-2 text-right">{formatUsd(cu.satisUsd, 0)}</td>
                    <td
                      className={`py-2 text-right font-medium ${
                        cu.karUsd !== null
                          ? cu.karUsd < 0
                            ? "text-red-600"
                            : "text-emerald-700"
                          : "text-gray-400"
                      }`}
                    >
                      {cu.karUsd !== null ? formatUsd(cu.karUsd, 0) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border text-sm font-semibold">
                  <td className="py-2">TOPLAM</td>
                  <td className="py-2" />
                  <td className="py-2 text-right">{formatNumber(calc.satisTon)}</td>
                  <td className="py-2 text-right">{formatUsd(calc.satisUsd, 0)}</td>
                  <td
                    className={`py-2 text-right ${
                      calc.karUsd !== null && calc.karUsd < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {calc.karUsd !== null ? formatUsd(calc.karUsd, 0) : "-"}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Alt bilgi */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-gray-400">
          <span>Sunar Tarımsal CRM · Tutarlar TCMB kuruyla USD&apos;ye çevrilmiştir.</span>
          <span>{formatDate(new Date().toISOString())}</span>
        </div>
        {calc.fxMissing && (
          <p className="mt-2 text-[11px] text-amber-600 print:text-black">
            Uyarı: Bazı kayıtlarda TCMB kuru bulunmadığı için USD tutarları eksik olabilir.
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function FlowStat({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value: number;
  unit: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 print:border print:border-border">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`mt-0.5 text-base font-bold ${warn ? "text-amber-600" : ""}`}>
        {formatNumber(value)} <span className="text-xs font-normal text-gray-400">{unit}</span>
      </div>
    </div>
  );
}
