"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Select, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";

type Contract = {
  id: string;
  contract_no: string | null;
  supplier_id: string | null;
  product_id: string | null;
  quantity: number;
  unit: string;
  eta: string | null;
  laycan_start: string | null;
  laycan_end: string | null;
  vessel: string | null;
  status: string;
};
type Ref = { id: string; name: string };

const STATUS_COLOR: Record<string, string> = {
  draft: "#9ca3af",
  active: "#3b82f6",
  in_transit: "#f59e0b",
  arrived: "#8b5cf6",
  completed: "#22c55e",
  cancelled: "#ef4444",
};
const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function statusLabel(s: string) {
  return CONTRACT_STATUS_OPTIONS.find((o) => o.value === s)?.label || s;
}

export function ShipmentSchedule() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    (async () => {
      const [c, p, s] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select(
            "id,contract_no,supplier_id,product_id,quantity,unit,eta,laycan_start,laycan_end,vessel,status",
          ),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name"),
      ]);
      if (c.error) setError(c.error.message);
      setContracts((c.data as unknown as Contract[]) || []);
      setProducts((p.data as unknown as Ref[]) || []);
      setSuppliers((s.data as unknown as Ref[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const productName = (id: string | null) =>
    products.find((p) => p.id === id)?.name || "Ürünsüz";
  const supplierName = (id: string | null) =>
    suppliers.find((s) => s.id === id)?.name || "-";

  // "Bağlı" = iptal edilmemiş sözleşmeler
  const rows = useMemo(
    () =>
      contracts.filter(
        (c) =>
          c.status !== "cancelled" &&
          (!productFilter || c.product_id === productFilter) &&
          (!statusFilter || c.status === statusFilter),
      ),
    [contracts, productFilter, statusFilter],
  );

  const totalTon = rows.reduce((a, c) => a + (Number(c.quantity) || 0), 0);
  const inTransitTon = rows
    .filter((c) => ["active", "in_transit"].includes(c.status))
    .reduce((a, c) => a + (Number(c.quantity) || 0), 0);

  const byProduct = useMemo(() => {
    const m = new Map<string, { ton: number; count: number }>();
    rows.forEach((c) => {
      const k = c.product_id || "none";
      const cur = m.get(k) || { ton: 0, count: 0 };
      cur.ton += Number(c.quantity) || 0;
      cur.count++;
      m.set(k, cur);
    });
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, name: productName(id), ...v }))
      .sort((a, b) => b.ton - a.ton);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, products]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((c) => {
      if (!c.eta) return;
      const d = new Date(c.eta);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) || 0) + (Number(c.quantity) || 0));
    });
    return Array.from(m.entries())
      .map(([k, ton]) => ({ k, ton }))
      .sort((a, b) => a.k.localeCompare(b.k));
  }, [rows]);
  const maxMonthTon = Math.max(1, ...byMonth.map((x) => x.ton));

  // --- Gantt verisi ---
  const dated = useMemo(
    () =>
      rows
        .map((c) => {
          const startStr = c.laycan_start || c.eta;
          const endStr = c.laycan_end || c.eta;
          return {
            c,
            start: startStr ? new Date(startStr) : null,
            end: endStr ? new Date(endStr) : null,
          };
        })
        .filter((x) => x.start && !isNaN(x.start.getTime()))
        .sort((a, b) => a.start!.getTime() - b.start!.getTime()),
    [rows],
  );

  const months = useMemo(() => {
    if (dated.length === 0) return [] as { y: number; m: number }[];
    let min = dated[0].start!;
    let max = dated[0].end || dated[0].start!;
    dated.forEach((x) => {
      if (x.start! < min) min = x.start!;
      const e = x.end || x.start!;
      if (e > max) max = e;
    });
    const arr: { y: number; m: number }[] = [];
    let y = min.getFullYear();
    let mo = min.getMonth();
    while (y < max.getFullYear() || (y === max.getFullYear() && mo <= max.getMonth())) {
      arr.push({ y, m: mo });
      mo++;
      if (mo > 11) {
        mo = 0;
        y++;
      }
    }
    return arr;
  }, [dated]);

  const pct = (d: Date) => {
    if (months.length === 0) return 0;
    const idx = months.findIndex((mm) => mm.y === d.getFullYear() && mm.m === d.getMonth());
    if (idx < 0) return d < new Date(months[0].y, months[0].m, 1) ? 0 : 100;
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return ((idx + (d.getDate() - 1) / dim) / months.length) * 100;
  };

  const today = new Date();
  const todayInRange =
    months.length > 0 &&
    today >= new Date(months[0].y, months[0].m, 1) &&
    today <= new Date(months[months.length - 1].y, months[months.length - 1].m + 1, 0);

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Veri yüklenemedi: {error}
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Filtreler */}
      <div className="flex flex-wrap gap-2">
        <Select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Tüm ürünler</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Tüm durumlar</option>
          {CONTRACT_STATUS_OPTIONS.filter((o) => o.value !== "cancelled").map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-gray-500">Toplam Bağlı Tonaj</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(totalTon)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Aktif + Yolda</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(inTransitTon)}</div>
          <div className="text-xs text-gray-400">ton</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Bağlantı Sayısı</div>
          <div className="mt-1 text-2xl font-bold">{rows.length}</div>
          <div className="text-xs text-gray-400">sözleşme</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500">Ürün Çeşidi</div>
          <div className="mt-1 text-2xl font-bold">{byProduct.length}</div>
          <div className="text-xs text-gray-400">ürün</div>
        </Card>
      </div>

      {/* Ürün bazında bağlı tonaj */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Ürün Bazında Bağlı Tonaj</h2>
        {byProduct.length === 0 ? (
          <EmptyState message="Kayıt yok." />
        ) : (
          <div className="space-y-2">
            {byProduct.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 truncate text-sm">{p.name}</div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-brand"
                    style={{ width: `${(p.ton / byProduct[0].ton) * 100}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right text-sm font-semibold">
                  {formatNumber(p.ton)} ton
                </div>
                <div className="hidden w-16 shrink-0 text-right text-xs text-gray-400 sm:block">
                  {p.count} adet
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Aya göre gelecek miktar */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Aya Göre Gelecek Miktar (ETA)</h2>
        {byMonth.length === 0 ? (
          <EmptyState message="ETA tarihli sözleşme yok." />
        ) : (
          <div className="space-y-2">
            {byMonth.map((x) => {
              const [yy, mm] = x.k.split("-");
              const label = `${MONTHS_TR[Number(mm) - 1]} ${yy}`;
              return (
                <div key={x.k} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-sm">{label}</div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-amber-500"
                      style={{ width: `${(x.ton / maxMonthTon) * 100}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm font-semibold">
                    {formatNumber(x.ton)} ton
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Gantt zaman çizelgesi */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sevkiyat Zaman Çizelgesi (ETA / Laycan)</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {CONTRACT_STATUS_OPTIONS.filter((o) => o.value !== "cancelled").map((o) => (
              <span key={o.value} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: STATUS_COLOR[o.value] }}
                />
                {o.label}
              </span>
            ))}
          </div>
        </div>

        {dated.length === 0 ? (
          <EmptyState message="Tarihli (ETA/laycan) sözleşme yok." />
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${176 + months.length * 80}px` }}>
              {/* Ay başlıkları */}
              <div className="flex border-b border-border text-xs text-gray-500">
                <div className="w-44 shrink-0 px-2 py-2 font-medium">Gemi / Sözleşme</div>
                <div className="flex flex-1">
                  {months.map((mm, i) => (
                    <div
                      key={i}
                      className="flex-1 border-l border-border px-2 py-2"
                    >
                      {MONTHS_TR[mm.m]} {String(mm.y).slice(2)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Satırlar */}
              {dated.map(({ c, start, end }) => {
                const left = pct(start!);
                const right = end ? pct(end) : left;
                const width = Math.max(right - left, 1.5);
                return (
                  <div
                    key={c.id}
                    className="flex items-center border-b border-border last:border-0"
                  >
                    <div className="w-44 shrink-0 px-2 py-2">
                      <div className="truncate text-sm font-medium">
                        {c.vessel || c.contract_no || "—"}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {productName(c.product_id)} · {formatNumber(c.quantity)} {c.unit}
                      </div>
                    </div>
                    <div className="relative h-10 flex-1">
                      {/* ay ızgarası */}
                      <div className="absolute inset-0 flex">
                        {months.map((_, i) => (
                          <div key={i} className="flex-1 border-l border-border/60" />
                        ))}
                      </div>
                      {/* bugün çizgisi */}
                      {todayInRange && (
                        <div
                          className="absolute top-0 bottom-0 z-10 w-px bg-red-400"
                          style={{ left: `${pct(today)}%` }}
                          title="Bugün"
                        />
                      )}
                      {/* bar */}
                      <div
                        className="absolute top-2.5 flex h-5 items-center justify-center rounded px-1 text-[10px] font-medium text-white"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: STATUS_COLOR[c.status] || "#6b7280",
                        }}
                        title={`${supplierName(c.supplier_id)} · ${statusLabel(c.status)} · ETA ${formatDate(c.eta)}`}
                      >
                        <span className="truncate">{formatNumber(c.quantity)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
