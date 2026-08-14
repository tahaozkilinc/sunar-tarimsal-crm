"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Input, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { WarehouseShipSummary } from "./warehouse-ship-summary";

// Depo bazlı stok görünümü: her depo tek satır (toplam kullanılabilir tonaj +
// ürün sayısı), tıklanınca hemen altında açılır (ör. pending-arrivals.tsx'teki
// aynı akordeon deseni) — açılan kısım BİLEREK SADE: yalnızca gemi/hammadde/
// depoya ilk giriş tarihi/miktar (WarehouseShipSummary). Depo yönetiminin
// tamamı (fotoğraf, yetkililer, milli/yerli, tam geçmiş, tedarikçi dağılımı)
// artık CRM -> Depolar'da (bkz. crm-tabs.tsx, WarehouseDetailExtra) — burada
// tekrarlanmıyor.
//
// Üstte AYRICA ürün bazlı "Rezerve Stok" özeti var: henüz fiilen sevk
// edilmemiş (taslak/onaylı, dispatch tamamlanmamış) satışların tonajı —
// inventory view'ı (0043) yalnızca FİİLİ sevkiyatı düştüğünden bu tonaj
// "kullanılabilir" görünür ama aslında bir müşteriye söz verilmiştir. Bu
// depo-bazlı DEĞİL ürün-bazlıdır (satış hangi depodan çıkacağı henüz belli
// olmayabilir — bkz. sale_warehouses), bu yüzden ayrı bir bölümde gösterilir.

type InventoryRow = {
  warehouse_id: string;
  warehouse_name: string;
  location_type: "warehouse" | "factory" | "foreign";
  product_id: string;
  product_name: string;
  received_qty: number;
  sold_qty: number;
  available_qty: number;
};
type Reservation = { id: string; product_id: string | null; quantity: number | null; status: string };
type DispatchRow = { sale_id: string | null; quantity: number | null };

const LOC_BADGE: Record<string, { color: "blue" | "purple" | "yellow"; label: string }> = {
  warehouse: { color: "blue", label: "Depo" },
  factory: { color: "purple", label: "Fabrika" },
  foreign: { color: "yellow", label: "Yurtdışı" },
};

export function InventoryView({ hideTitle = false }: { hideTitle?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dispatched, setDispatched] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedWh, setExpandedWh] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [inv, res, disp] = await Promise.all([
        supabase.from("inventory").select("*").order("warehouse_name"),
        // Rezerve hesabı: fiyat/müşteri İÇERMEYEN dar görünüm (bkz. 0063) —
        // operasyon/satış operasyon gibi sales_orders'ı okuyamayan roller de
        // "ne kadarı rezerve" görebilsin diye.
        supabase.from("sales_reservations").select("id,product_id,quantity,status"),
        supabase
          .from("stock_movements")
          .select("sale_id,quantity")
          .eq("movement_type", "outbound_sale")
          .not("sale_id", "is", null),
      ]);
      if (inv.error) setError(inv.error.message);
      setRows((inv.data as InventoryRow[]) || []);
      setReservations((res.data as Reservation[]) || []);
      const d: Record<string, number> = {};
      ((disp.data as DispatchRow[] | null) || []).forEach((m) => {
        if (!m.sale_id) return;
        d[m.sale_id] = (d[m.sale_id] || 0) + (Number(m.quantity) || 0);
      });
      setDispatched(d);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.warehouse_name.toLocaleLowerCase("tr").includes(q) ||
        r.product_name.toLocaleLowerCase("tr").includes(q),
    );
  }, [rows, search]);

  // Depo bazlı gruplama — panelin ilk bakışta gösterdiği "hangi depoda ne kadar var".
  const warehouses = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; type: string; total: number; products: InventoryRow[] }
    >();
    filtered.forEach((r) => {
      const e = map.get(r.warehouse_id) || {
        id: r.warehouse_id,
        name: r.warehouse_name,
        type: r.location_type,
        total: 0,
        products: [] as InventoryRow[],
      };
      e.total += Number(r.available_qty) || 0;
      e.products.push(r);
      map.set(r.warehouse_id, e);
    });
    return Array.from(map.values());
  }, [filtered]);

  // Ürün bazlı toplam kullanılabilir (TÜM depolar, arama kutusundan bağımsız —
  // rezerve özeti her zaman tüm resmi gösterir).
  const totalAvailableByProduct = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.product_id, (map.get(r.product_id) || 0) + (Number(r.available_qty) || 0)));
    return map;
  }, [rows]);

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.product_id, r.product_name));
    return map;
  }, [rows]);

  // Rezerve: her satışın SÖZ VERİLEN tonajından fiilen sevk edileni düş; kalan
  // (varsa) o ürün için hâlâ "rezerve" — SalesFulfillmentPanel'deki aynı mantık.
  const reservedByProduct = useMemo(() => {
    const map = new Map<string, { reserved: number; count: number }>();
    reservations.forEach((s) => {
      if (!s.product_id) return;
      const qty = Number(s.quantity) || 0;
      const disp = dispatched[s.id] || 0;
      const remaining = Math.round((qty - disp) * 100) / 100;
      if (remaining <= 0.01) return;
      const e = map.get(s.product_id) || { reserved: 0, count: 0 };
      e.reserved += remaining;
      e.count += 1;
      map.set(s.product_id, e);
    });
    return Array.from(map.entries())
      .map(([productId, v]) => ({
        productId,
        name: productNames.get(productId) || "—",
        reserved: v.reserved,
        count: v.count,
        available: totalAvailableByProduct.get(productId) || 0,
      }))
      .sort((a, b) => b.reserved - a.reserved);
  }, [reservations, dispatched, productNames, totalAvailableByProduct]);

  const toggle = (id: string) => setExpandedWh((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-3 ${hideTitle ? "justify-end" : "justify-between"}`}>
        {!hideTitle && <h1 className="text-xl font-bold">Stok Durumu</h1>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Depo / ürün ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-8 sm:w-64"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Stok bilgisi yüklenemedi: {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Rezerve stok özeti — henüz fiilen sevk edilmemiş satışlar */}
          {reservedByProduct.length > 0 && (
            <Card className="p-4">
              <div className="mb-1 text-sm font-semibold">Rezerve Stok (bekleyen satışlar)</div>
              <p className="mb-3 text-xs text-gray-400">
                Bu ürünlerden bir kısmı satış kaydı açılmış ama henüz araç fiilen çıkmamış — fiziksel
                stokta &quot;kullanılabilir&quot; görünse de bir müşteriye söz verilmiştir.
              </p>
              <div className="space-y-2.5">
                {reservedByProduct.map((r) => {
                  const free = Math.max(0, r.available - r.reserved);
                  const total = r.available > 0 ? r.available : r.reserved;
                  const reservedPct = total > 0 ? Math.min(100, (r.reserved / total) * 100) : 0;
                  return (
                    <div key={r.productId}>
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-xs text-gray-500">
                          <span className="font-semibold text-amber-600">{formatNumber(r.reserved)} ton rezerve</span>
                          {" "}({r.count} satış) · {formatNumber(free)} ton serbest / {formatNumber(r.available)} ton mevcut
                        </span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${100 - reservedPct}%` }} />
                        <div className="h-full bg-amber-400" style={{ width: `${reservedPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Serbest
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Rezerve (bekleyen satış)
                </span>
              </div>
            </Card>
          )}

          {/* Depo bazlı liste — tıklayınca hemen altında açılır */}
          {warehouses.length === 0 ? (
            <EmptyState message="Stok kaydı bulunamadı. Operasyon hareketleri girildikçe burada görünür." />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {warehouses.map((w) => {
                const isOpen = expandedWh === w.id;
                const loc = LOC_BADGE[w.type] || LOC_BADGE.warehouse;
                return (
                  <div key={w.id}>
                    <button
                      onClick={() => toggle(w.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        )}
                        <span className="truncate font-medium">{w.name}</span>
                        <Badge color={loc.color}>{loc.label}</Badge>
                        <span className="shrink-0 text-xs text-gray-400">{w.products.length} ürün</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${w.total < 0 ? "text-red-600" : ""}`}>
                          {formatNumber(w.total)} <span className="text-xs font-normal text-gray-400">ton</span>
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border bg-gray-50/50 px-3 py-4 sm:px-4">
                        <WarehouseShipSummary warehouseId={w.id} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
