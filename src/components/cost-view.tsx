"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Input, Spinner } from "./ui";
import { formatMoney, formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { Download, FileText, Search } from "lucide-react";

// Gemi (bağlantı) bazlı maliyet / kâr-zarar: ne kadara aldık, ne kadara sattık.
// Tüm tutarlar, kaydın oluşturulduğu günkü TCMB kuruyla USD'ye çevrilir; böylece
// alış (genelde USD) ile satış (genelde TRY) tek para biriminde karşılaştırılır.
// Bu, gemiye tıklayınca açılan detay raporuyla (contract-report) AYNI mantıktır.

type PC = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  status: string;
  usd_try: number | null;
  eur_try: number | null;
};
type SO = {
  contract_id: string | null;
  customer_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  usd_try: number | null;
  eur_try: number | null;
};
type Prod = { id: string; name: string };
type Company = { id: string; name: string };

type CustomerProfit = {
  customerId: string;
  customerName: string;
  ton: number;
  satisUsd: number | null;
  karUsd: number | null;
};

type Row = {
  id: string;
  vessel: string;
  contractNo: string;
  product: string;
  alisTon: number;
  alisPrice: number;
  alisCur: string;
  alisUsd: number | null;
  satisTon: number;
  satisAvgUsd: number | null;
  satisUsd: number | null;
  kalan: number;
  karUsd: number | null;
  fxMissing: boolean;
  customers: CustomerProfit[];
};

export function CostView({ hideTitle }: { hideTitle?: boolean } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<PC[]>([]);
  const [sales, setSales] = useState<SO[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [pc, so, pr, co] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,quantity,price,currency,status,usd_try,eur_try"),
        supabase
          .from("sales_orders")
          .select("contract_id,customer_id,quantity,price,currency,usd_try,eur_try"),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name"),
      ]);
      if (pc.error) setError(pc.error.message);
      setContracts((pc.data as PC[]) || []);
      setSales((so.data as SO[]) || []);
      const m: Record<string, string> = {};
      ((pr.data as Prod[]) || []).forEach((p) => (m[p.id] = p.name));
      setProductMap(m);
      const cm: Record<string, string> = {};
      ((co.data as Company[]) || []).forEach((c) => (cm[c.id] = c.name));
      setCompanyMap(cm);
      setLoading(false);
    })();
  }, [supabase]);

  const rows = useMemo<Row[]>(() => {
    const salesByContract = new Map<string, SO[]>();
    sales.forEach((s) => {
      if (!s.contract_id) return;
      const arr = salesByContract.get(s.contract_id) || [];
      arr.push(s);
      salesByContract.set(s.contract_id, arr);
    });
    return contracts
      .filter((c) => c.status !== "cancelled")
      .map((c) => {
        const linked = salesByContract.get(c.id) || [];
        const alisTon = Number(c.quantity) || 0;
        const alisPrice = Number(c.price) || 0;
        const alisUsd = toUsd(alisTon * alisPrice, c.currency, c.usd_try, c.eur_try);
        const costPerTonUsd = alisTon > 0 && alisUsd !== null ? alisUsd / alisTon : null;
        let fxMissing = alisPrice > 0 && alisUsd === null;

        const satisTon = linked.reduce((a, s) => a + (Number(s.quantity) || 0), 0);

        // Müşteri bazlı kırılım: bu gemiden kim ne kadar aldı, ne kâr ettik (USD).
        const byCustomer = new Map<string, SO[]>();
        linked.forEach((s) => {
          const key = s.customer_id || "_";
          const arr = byCustomer.get(key) || [];
          arr.push(s);
          byCustomer.set(key, arr);
        });
        const customers: CustomerProfit[] = Array.from(byCustomer.entries())
          .map(([custId, sos]) => {
            const ton = sos.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
            let satisUsd: number | null = 0;
            sos.forEach((s) => {
              const u = toUsd(
                (Number(s.quantity) || 0) * (Number(s.price) || 0),
                s.currency,
                s.usd_try,
                s.eur_try,
              );
              if (u === null) {
                fxMissing = true;
                satisUsd = satisUsd === null ? null : satisUsd; // bilinmeyeni atla
              } else if (satisUsd !== null) {
                satisUsd += u;
              }
            });
            const allocCost = costPerTonUsd !== null ? ton * costPerTonUsd : null;
            const karUsd =
              satisUsd !== null && allocCost !== null ? satisUsd - allocCost : null;
            return {
              customerId: custId,
              customerName: custId === "_" ? "Müşteri belirtilmemiş" : companyMap[custId] || "—",
              ton,
              satisUsd,
              karUsd,
            };
          })
          .sort((a, b) => b.ton - a.ton);

        const satisUsd = customers.reduce<number | null>((acc, cu) => {
          if (acc === null || cu.satisUsd === null) return acc === null ? null : acc;
          return acc + cu.satisUsd;
        }, 0);
        const allocCostTotal = costPerTonUsd !== null ? satisTon * costPerTonUsd : null;
        const karUsd =
          satisUsd !== null && allocCostTotal !== null ? satisUsd - allocCostTotal : null;

        return {
          id: c.id,
          vessel: c.vessel || "",
          contractNo: c.contract_no || "",
          product: (c.product_id && productMap[c.product_id]) || "Ürünsüz",
          alisTon,
          alisPrice,
          alisCur: c.currency || "USD",
          alisUsd,
          satisTon,
          satisAvgUsd: satisTon > 0 && satisUsd !== null ? satisUsd / satisTon : null,
          satisUsd,
          kalan: alisTon - satisTon,
          karUsd,
          fxMissing,
          customers,
        };
      })
      .sort((a, b) => (b.karUsd ?? -Infinity) - (a.karUsd ?? -Infinity));
  }, [contracts, sales, productMap, companyMap]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLocaleLowerCase("tr");
    return (
      !q ||
      [r.vessel, r.contractNo, r.product].some((x) => x.toLocaleLowerCase("tr").includes(q))
    );
  });

  const totalAlisTon = filtered.reduce((a, r) => a + r.alisTon, 0);
  const totalSatisTon = filtered.reduce((a, r) => a + r.satisTon, 0);
  const totalAlisUsd = filtered.reduce((a, r) => a + (r.alisUsd ?? 0), 0);
  const totalSatisUsd = filtered.reduce((a, r) => a + (r.satisUsd ?? 0), 0);
  const totalKarUsd = filtered.reduce((a, r) => a + (r.karUsd ?? 0), 0);
  const anyFxMissing = filtered.some((r) => r.fxMissing);

  const downloadCsv = () => {
    const headers = [
      "Gemi", "Sözleşme No", "Ürün",
      "Alış Ton", "Alış Birim Fiyat", "Alış (USD)",
      "Satış Ton", "Satış Birim (USD/ton)", "Satış (USD)", "Kalan Ton", "Kâr (USD)",
    ];
    const body: (string | number)[][] = [];
    filtered.forEach((r) => {
      body.push([
        r.vessel, r.contractNo, r.product,
        r.alisTon, r.alisPrice > 0 ? `${r.alisPrice} ${r.alisCur}` : "",
        r.alisUsd ?? "",
        r.satisTon, r.satisAvgUsd !== null ? r.satisAvgUsd.toFixed(2) : "",
        r.satisUsd ?? "", r.kalan, r.karUsd ?? "",
      ]);
      r.customers.forEach((cu) => {
        body.push([
          `↳ ${cu.customerName}`, "", "",
          "", "", "",
          cu.ton, "", cu.satisUsd ?? "", "", cu.karUsd ?? "",
        ]);
      });
    });
    const csv = [headers, ...body]
      .map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "maliyet-kar-zarar.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-center gap-3 ${
          hideTitle ? "justify-end" : "justify-between"
        }`}
      >
        {!hideTitle && <h1 className="text-xl font-bold">Maliyet / Kâr-Zarar</h1>}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Gemi / sözleşme / ürün..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 pl-8 sm:w-56"
            />
          </div>
          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      {/* Toplu özet (USD) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs text-gray-500">Toplam Alış</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(totalAlisTon)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Toplam Satış</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(totalSatisTon)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Alış Tutarı</div>
          <div className="mt-1 text-sm font-semibold">{formatUsd(totalAlisUsd, 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Satış Tutarı</div>
          <div className="mt-1 text-sm font-semibold">{formatUsd(totalSatisUsd, 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Toplam Kâr</div>
          <div
            className={`mt-1 text-sm font-semibold ${
              totalKarUsd < 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {formatUsd(totalKarUsd, 0)}
          </div>
        </Card>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Yüklenemedi: {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Kayıt yok." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-3 font-medium">Gemi / Sözleşme</th>
                <th className="px-3 py-3 font-medium">Ürün</th>
                <th className="px-3 py-3 text-right font-medium">Alış Ton</th>
                <th className="px-3 py-3 text-right font-medium">Alış Birim</th>
                <th className="px-3 py-3 text-right font-medium">Alış (USD)</th>
                <th className="px-3 py-3 text-right font-medium">Satış Ton</th>
                <th className="px-3 py-3 text-right font-medium">Satış Birim</th>
                <th className="px-3 py-3 text-right font-medium">Satış (USD)</th>
                <th className="px-3 py-3 text-right font-medium">Kalan Ton</th>
                <th className="px-3 py-3 text-right font-medium">Kâr (USD)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.flatMap((r) => [
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <Link
                      href={`/cost/${r.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {r.vessel || r.contractNo || "—"}
                    </Link>
                    {r.vessel && r.contractNo && (
                      <div className="text-xs text-gray-400">{r.contractNo}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">{r.product}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.alisTon)}</td>
                  <td className="px-3 py-3 text-right text-gray-600">
                    {r.alisPrice > 0 ? formatMoney(r.alisPrice, r.alisCur) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">{formatUsd(r.alisUsd, 0)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.satisTon)}</td>
                  <td className="px-3 py-3 text-right text-gray-600">
                    {r.satisAvgUsd !== null ? `${formatUsd(r.satisAvgUsd)}/ton` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">{formatUsd(r.satisUsd, 0)}</td>
                  <td
                    className={`px-3 py-3 text-right font-semibold ${
                      r.kalan < 0 ? "text-amber-600" : ""
                    }`}
                  >
                    {formatNumber(r.kalan)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-semibold ${
                      r.karUsd !== null
                        ? r.karUsd < 0
                          ? "text-red-600"
                          : "text-emerald-700"
                        : ""
                    }`}
                  >
                    {r.karUsd !== null ? formatUsd(r.karUsd, 0) : "-"}
                  </td>
                </tr>,
                ...r.customers.map((cu) => (
                  <tr
                    key={`${r.id}-${cu.customerId}`}
                    className="border-b border-border bg-gray-50/60 text-xs last:border-0"
                  >
                    <td className="px-3 py-2 pl-6 text-gray-600">↳ {cu.customerName}</td>
                    <td className="px-3 py-2 text-gray-400">—</td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNumber(cu.ton)}</td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatUsd(cu.satisUsd, 0)}</td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
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
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Tüm tutarlar, her kaydın oluşturulduğu günkü TCMB kuruyla USD&apos;ye çevrilir. Kâr =
        satış geliri − (satılan ton × ton başına alış maliyeti). Satışların gemiye bağlanması için
        satış kaydında &quot;Kaynak Bağlantı&quot; seçilmelidir.
        {anyFxMissing && (
          <span className="text-amber-600">
            {" "}
            Bazı kayıtlarda TCMB kuru bulunmadığından ilgili tutarlar eksik olabilir.
          </span>
        )}
      </p>
    </div>
  );
}
