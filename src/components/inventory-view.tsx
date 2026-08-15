"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Input, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { WarehouseShipSummary } from "./warehouse-ship-summary";

// Depo bazlı stok görünümü: her depo tek satır (SATILABİLİR tonaj + ürün
// sayısı), tıklanınca hemen altında açılır (ör. pending-arrivals.tsx'teki
// aynı akordeon deseni) — açılan kısım BİLEREK SADE: yalnızca gemi/hammadde/
// depoya ilk giriş tarihi/miktar (WarehouseShipSummary). Depo yönetiminin
// tamamı (fotoğraf, yetkililer, milli/yerli, tam geçmiş, tedarikçi dağılımı)
// artık CRM -> Depolar'da (bkz. crm-tabs.tsx, WarehouseDetailExtra) — burada
// tekrarlanmıyor.
//
// Üstte AYRICA ürün bazlı "Rezerve Stok" özeti var: henüz fiilen sevk
// edilmemiş (taslak+fiyatlı veya onaylı/teslim/fatura, dispatch tamamlanmamış
// — bkz. 0065 sales_reservations WHERE koşulu) satışların tonajı — inventory
// view'ı (0043) yalnızca FİİLİ sevkiyatı düştüğünden bu tonaj "kullanılabilir"
// görünür ama aslında bir müşteriye söz verilmiştir. Satış gerçekleşirse zaten
// fiili sevkiyatla (outbound_sale) doğrudan düşülür; gerçekleşmezse zaten hiç
// fiziki hareket olmadığından stok orada görünmeye devam eder — burada
// yalnızca "rezerve" bilgisi ayrıca gösteriliyor.
//
// Depo satırındaki büyük rakam artık SATILABİLİR (mevcut - rezerve): bir
// satışın hangi depo(lar)dan çıkabileceği sale_warehouses beyaz listesinden
// gelir; liste tek depoysa rezervasyon doğrudan ona, birden fazlaysa o
// üründen depodaki mevcut miktarla ORANTILI dağıtılır (attributeByWarehouse'
// daki ile aynı "elde veriyle en iyi tahmin" yaklaşımı) — kesin değil ama
// depo seçilene kadar elde başka veri yok. Depo hiç seçilmemişse o kısım
// hiçbir depoya yazılmaz, yalnızca üstteki ürün bazlı özette görünür.

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
type SaleWarehouseRow = { sale_id: string; warehouse_id: string };

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
  const [allowedByS, setAllowedByS] = useState<Record<string, string[]>>({});
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
      const resRows = (res.data as Reservation[]) || [];
      setReservations(resRows);
      const d: Record<string, number> = {};
      ((disp.data as DispatchRow[] | null) || []).forEach((m) => {
        if (!m.sale_id) return;
        d[m.sale_id] = (d[m.sale_id] || 0) + (Number(m.quantity) || 0);
      });
      setDispatched(d);

      // Rezervasyonların hangi depo(lar)a düşebileceği (beyaz liste) —
      // depo bazlı satılabilir tonaj hesabı için gerekli (bkz. üst not).
      if (resRows.length > 0) {
        const { data: swData } = await supabase
          .from("sale_warehouses")
          .select("sale_id,warehouse_id")
          .in("sale_id", resRows.map((r) => r.id));
        const am: Record<string, string[]> = {};
        ((swData as SaleWarehouseRow[] | null) || []).forEach((r) => {
          (am[r.sale_id] ||= []).push(r.warehouse_id);
        });
        setAllowedByS(am);
      }
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

  // Ürün bazlı toplam kullanılabilir (TÜM depolar, arama kutusundan bağımsız —
  // rezerve özeti her zaman tüm resmi gösterir).
  const totalAvailableByProduct = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.product_id, (map.get(r.product_id) || 0) + (Number(r.available_qty) || 0)));
    return map;
  }, [rows]);

  // Depo×ürün mevcut miktar — rezervasyonu birden fazla izinli depo arasında
  // orantılı dağıtırken kullanılır (bkz. reservedByWarehouse).
  const availableByWhProduct = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(`${r.warehouse_id}|${r.product_id}`, Number(r.available_qty) || 0));
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

  // Rezervasyonu depo(lar)a dağıt: satışın izinli deposu (sale_warehouses)
  // tekse doğrudan ona, birden fazlaysa o üründen depodaki mevcut miktarla
  // ORANTILI (hepsi 0'sa eşit) — depo hiç seçilmemişse "unassigned"da kalır,
  // hiçbir depo satırına yazılmaz.
  const { reservedByWarehouse, unassignedReserved } = useMemo(() => {
    const byWh = new Map<string, number>();
    let unassigned = 0;
    reservations.forEach((s) => {
      if (!s.product_id) return;
      const qty = Number(s.quantity) || 0;
      const disp = dispatched[s.id] || 0;
      const remaining = Math.round((qty - disp) * 100) / 100;
      if (remaining <= 0.01) return;
      const allowed = allowedByS[s.id] || [];
      if (allowed.length === 0) {
        unassigned += remaining;
        return;
      }
      const avails = allowed.map((whId) => Math.max(0, availableByWhProduct.get(`${whId}|${s.product_id}`) || 0));
      const totalAvail = avails.reduce((a, b) => a + b, 0);
      allowed.forEach((whId, i) => {
        const share = totalAvail > 0 ? avails[i] / totalAvail : 1 / allowed.length;
        byWh.set(whId, (byWh.get(whId) || 0) + remaining * share);
      });
    });
    return { reservedByWarehouse: byWh, unassignedReserved: unassigned };
  }, [reservations, dispatched, allowedByS, availableByWhProduct]);

  // Depo bazlı gruplama — panelin ilk bakışta gösterdiği "hangi depoda ne kadar
  // satılabilir". sellable = fiziki mevcut - depoya düşen rezerve payı.
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
    return Array.from(map.values()).map((w) => {
      const reserved = Math.round((reservedByWarehouse.get(w.id) || 0) * 100) / 100;
      return { ...w, reserved, sellable: Math.round((w.total - reserved) * 100) / 100 };
    });
  }, [filtered, reservedByWarehouse]);

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
          {/* Rezerve stok özeti — henüz fiilen sevk edilmemiş satışlar. Bar YOK
              (toplam ürün tonajı bazlı görsel kaldırıldı) — görsel kırılım artık
              aşağıdaki depo satırlarında (depo + gemi bazlı). */}
          {reservedByProduct.length > 0 && (
            <Card className="p-4">
              <div className="mb-1 text-sm font-semibold">Rezerve Stok (bekleyen satışlar)</div>
              <p className="mb-3 text-xs text-gray-400">
                Bu ürünlerden bir kısmı satış kaydı açılmış ama henüz araç fiilen çıkmamış — fiziksel
                stokta &quot;kullanılabilir&quot; görünse de bir müşteriye söz verilmiştir.
              </p>
              <div className="space-y-1.5">
                {reservedByProduct.map((r) => {
                  const free = Math.max(0, r.available - r.reserved);
                  return (
                    <div
                      key={r.productId}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-gray-500">
                        <span className="font-semibold text-amber-600">{formatNumber(r.reserved)} ton rezerve</span>
                        {" "}({r.count} satış) · {formatNumber(free)} ton serbest / {formatNumber(r.available)} ton mevcut
                      </span>
                    </div>
                  );
                })}
              </div>
              {unassignedReserved > 0.01 && (
                <p className="mt-3 border-t border-border pt-2 text-[11px] text-gray-400">
                  Bunun {formatNumber(unassignedReserved)} tonu için satışta henüz depo seçilmemiş — depo
                  seçilince aşağıdaki depo satırlarına yansır.
                </p>
              )}
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
                      <div className="w-36 shrink-0 text-right">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">Satılabilir</div>
                        <div className={`text-lg font-bold ${w.sellable < 0 ? "text-red-600" : ""}`}>
                          {formatNumber(w.sellable)} <span className="text-xs font-normal text-gray-400">ton</span>
                        </div>
                        {w.reserved > 0.01 && w.total > 0 && (
                          <>
                            <div className="text-xs text-gray-400">
                              {formatNumber(w.total)} mevcut ·{" "}
                              <span className="font-medium text-amber-600">{formatNumber(w.reserved)} rezerve</span>
                            </div>
                            <div className="mt-1 ml-auto flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${Math.max(0, Math.min(100, (w.sellable / w.total) * 100))}%` }}
                              />
                              <div
                                className="h-full bg-amber-400"
                                style={{ width: `${Math.max(0, Math.min(100, (w.reserved / w.total) * 100))}%` }}
                              />
                            </div>
                          </>
                        )}
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
