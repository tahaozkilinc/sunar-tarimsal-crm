"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Select, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { translateDbError } from "@/lib/db-errors";

// Gantt zaman çizelgesi buradan Bağlantı -> Özet'e taşındı (kullanıcı isteği,
// bkz. BaglantiSummary — yalnızca "yolda" olanlarla, aynı ekranın diğer
// kartlarıyla birlikte). Burada ürün/ay bazlı özet + takvim kalıyor.

type Contract = {
  id: string;
  contract_no: string | null;
  product_id: string | null;
  quantity: number;
  unit: string;
  eta: string | null;
  vessel: string | null;
  status: string;
  origin_country: string | null;
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
const MONTHS_TR_FULL = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function ShipmentSchedule() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    (async () => {
      const [c, p] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,product_id,quantity,unit,eta,vessel,status,origin_country"),
        supabase.from("products").select("id,name"),
      ]);
      if (c.error) setError(translateDbError(c.error));
      setContracts((c.data as unknown as Contract[]) || []);
      setProducts((p.data as unknown as Ref[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const productName = (id: string | null) =>
    products.find((p) => p.id === id)?.name || "Ürünsüz";

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

  // Tarih-yalnızca (YYYY-MM-DD) string'ler "T00:00:00" olmadan new Date() ile
  // parse edilirse UTC gece yarısı sayılır — tarayıcı saat dilimi UTC'nin
  // gerisindeyse bir gün (ay sınırındaysa bir AY) geriye kayar. Bu yüzden hep
  // yerel saatle parse ediyoruz (bkz. warehouse-ship-summary.tsx aynı desen).
  const parseLocalDate = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((c) => {
      if (!c.eta) return;
      const d = parseLocalDate(c.eta);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) || 0) + (Number(c.quantity) || 0));
    });
    return Array.from(m.entries())
      .map(([k, ton]) => ({ k, ton }))
      .sort((a, b) => a.k.localeCompare(b.k));
  }, [rows]);
  const maxMonthTon = Math.max(1, ...byMonth.map((x) => x.ton));

  // Takvim: seçili ayda ETA'sı olan sevkiyatları güne göre grupla
  const calItems = useMemo(() => {
    const map = new Map<string, Contract[]>();
    rows.forEach((c) => {
      if (!c.eta) return;
      const d = parseLocalDate(c.eta);
      if (isNaN(d.getTime())) return;
      if (
        d.getFullYear() === calMonth.getFullYear() &&
        d.getMonth() === calMonth.getMonth()
      ) {
        const key = String(d.getDate());
        const arr = map.get(key) || [];
        arr.push(c);
        map.set(key, arr);
      }
    });
    return map;
  }, [rows, calMonth]);

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
                    style={{ width: `${(p.ton / Math.max(byProduct[0].ton, 1)) * 100}%` }}
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

      {/* Takvim görünümü */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Takvim — Gelecek Sevkiyatlar (ETA)</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
              }
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
              aria-label="Önceki ay"
            >
              ‹
            </button>
            <span className="w-32 text-center text-sm font-medium">
              {MONTHS_TR_FULL[calMonth.getMonth()]} {calMonth.getFullYear()}
            </span>
            <button
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
              }
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
              aria-label="Sonraki ay"
            >
              ›
            </button>
          </div>
        </div>
        {(() => {
          const year = calMonth.getFullYear();
          const month = calMonth.getMonth();
          const leading = (new Date(year, month, 1).getDay() + 6) % 7;
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells: (number | null)[] = [];
          for (let i = 0; i < leading; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);
          const now = new Date();
          const todayDay =
            now.getFullYear() === year && now.getMonth() === month ? now.getDate() : -1;
          return (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_TR.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-medium text-gray-500">
                  {w}
                </div>
              ))}
              {cells.map((d, i) => {
                if (d === null)
                  return <div key={i} className="min-h-[88px] rounded bg-gray-50/40" />;
                const items = calItems.get(String(d)) || [];
                return (
                  <div
                    key={i}
                    className={`min-h-[88px] rounded border p-1 ${
                      d === todayDay ? "border-brand bg-brand/5" : "border-border"
                    }`}
                  >
                    <div className="mb-0.5 text-right text-xs text-gray-400">{d}</div>
                    <div className="space-y-0.5">
                      {items.slice(0, 2).map((c) => (
                        <div
                          key={c.id}
                          className="rounded px-1 py-0.5 text-[10px] leading-tight text-white"
                          style={{ background: STATUS_COLOR[c.status] || "#6b7280" }}
                          title={`${productName(c.product_id)} · ${formatNumber(c.quantity)} ${c.unit} · ${
                            c.origin_country || ""
                          } · ${c.vessel || c.contract_no || ""}`}
                        >
                          <div className="truncate font-medium">
                            {productName(c.product_id)} · {formatNumber(c.quantity)}
                          </div>
                          <div className="truncate opacity-90">{c.origin_country || "menşe yok"}</div>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <div className="text-[10px] text-gray-500">+{items.length - 2} daha</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
