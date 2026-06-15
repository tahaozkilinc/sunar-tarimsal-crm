"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Input, Spinner } from "./ui";
import { formatMoney, formatNumber } from "@/lib/format";
import { Download, Search } from "lucide-react";

// Gemi (bağlantı) bazlı maliyet / kâr-zarar: ne kadara aldık, ne kadara sattık.
// Alış fiyatları sözleşmeden, satışlar contract_id ile eşleşen satışlardan gelir.
// (Alış genelde USD, satış TRY olabildiğinden tutarlar para birimiyle gösterilir.)

type PC = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  status: string;
};
type SO = {
  contract_id: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
};
type Prod = { id: string; name: string };

type Row = {
  id: string;
  vessel: string;
  contractNo: string;
  product: string;
  alisTon: number;
  alisPrice: number;
  alisCur: string;
  alisTutar: number;
  satisTon: number;
  satisCur: string;
  satisTutar: number;
  kalan: number;
};

export function CostView() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<PC[]>([]);
  const [sales, setSales] = useState<SO[]>([]);
  const [productMap, setProductMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [pc, so, pr] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,quantity,price,currency,status"),
        supabase.from("sales_orders").select("contract_id,quantity,price,currency"),
        supabase.from("products").select("id,name"),
      ]);
      if (pc.error) setError(pc.error.message);
      setContracts((pc.data as PC[]) || []);
      setSales((so.data as SO[]) || []);
      const m: Record<string, string> = {};
      ((pr.data as Prod[]) || []).forEach((p) => (m[p.id] = p.name));
      setProductMap(m);
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
        const satisTon = linked.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
        const revByCur: Record<string, number> = {};
        linked.forEach((s) => {
          const cur = s.currency || "TRY";
          revByCur[cur] = (revByCur[cur] || 0) + (Number(s.quantity) || 0) * (Number(s.price) || 0);
        });
        const satisCur = Object.keys(revByCur)[0] || "";
        const alisTon = Number(c.quantity) || 0;
        const alisPrice = Number(c.price) || 0;
        return {
          id: c.id,
          vessel: c.vessel || "",
          contractNo: c.contract_no || "",
          product: (c.product_id && productMap[c.product_id]) || "Ürünsüz",
          alisTon,
          alisPrice,
          alisCur: c.currency || "USD",
          alisTutar: alisTon * alisPrice,
          satisTon,
          satisCur,
          satisTutar: satisCur ? revByCur[satisCur] : 0,
          kalan: alisTon - satisTon,
        };
      })
      .sort((a, b) => b.alisTon - a.alisTon);
  }, [contracts, sales, productMap]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLocaleLowerCase("tr");
    return (
      !q ||
      [r.vessel, r.contractNo, r.product].some((x) => x.toLocaleLowerCase("tr").includes(q))
    );
  });

  const totalAlisTon = filtered.reduce((a, r) => a + r.alisTon, 0);
  const totalSatisTon = filtered.reduce((a, r) => a + r.satisTon, 0);
  const alisByCur: Record<string, number> = {};
  const satisByCur: Record<string, number> = {};
  filtered.forEach((r) => {
    alisByCur[r.alisCur] = (alisByCur[r.alisCur] || 0) + r.alisTutar;
    if (r.satisCur) satisByCur[r.satisCur] = (satisByCur[r.satisCur] || 0) + r.satisTutar;
  });
  const curLine = (m: Record<string, number>) =>
    Object.entries(m)
      .filter(([, v]) => v > 0)
      .map(([cur, v]) => formatMoney(v, cur))
      .join(" · ") || "-";

  const downloadCsv = () => {
    const headers = [
      "Gemi", "Sözleşme No", "Ürün",
      "Alış Ton", "Alış Birim Fiyat", "Alış Tutarı", "Alış PB",
      "Satış Ton", "Satış Tutarı", "Satış PB", "Kalan Ton",
    ];
    const body = filtered.map((r) => [
      r.vessel, r.contractNo, r.product,
      r.alisTon, r.alisPrice, r.alisTutar, r.alisCur,
      r.satisTon, r.satisTutar, r.satisCur, r.kalan,
    ]);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Maliyet / Kâr-Zarar</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
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

      {/* Toplu özet */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <div className="mt-1 text-sm font-semibold">{curLine(alisByCur)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Satış Tutarı</div>
          <div className="mt-1 text-sm font-semibold">{curLine(satisByCur)}</div>
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
                <th className="px-3 py-3 text-right font-medium">Alış Tutarı</th>
                <th className="px-3 py-3 text-right font-medium">Satış Ton</th>
                <th className="px-3 py-3 text-right font-medium">Satış Tutarı</th>
                <th className="px-3 py-3 text-right font-medium">Kalan Ton</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.vessel || r.contractNo || "—"}</div>
                    {r.vessel && r.contractNo && (
                      <div className="text-xs text-gray-400">{r.contractNo}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">{r.product}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.alisTon)}</td>
                  <td className="px-3 py-3 text-right">
                    {r.alisTutar > 0 ? formatMoney(r.alisTutar, r.alisCur) : "-"}
                  </td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.satisTon)}</td>
                  <td className="px-3 py-3 text-right">
                    {r.satisTutar > 0 ? formatMoney(r.satisTutar, r.satisCur) : "-"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-semibold ${
                      r.kalan < 0 ? "text-amber-600" : ""
                    }`}
                  >
                    {formatNumber(r.kalan)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Not: Alış ve satış farklı para biriminde olabildiği için kâr, tutarlar ayrı para birimleriyle
        gösterilir. Satışların gemiye bağlanması için satış kaydında &quot;Kaynak Bağlantı&quot; seçilmelidir.
      </p>
    </div>
  );
}
