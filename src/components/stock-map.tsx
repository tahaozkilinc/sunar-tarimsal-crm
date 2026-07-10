"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { TURKEY_CENTER, geocodeLocation } from "@/lib/turkey-cities";

// Stok haritası: her depo/fabrika konumunda toplam tonaj + ürün kırılımı.
// Konum, deponun city+country alanından türetilir (geocodeLocation): TR illeri,
// yurtdışı liman/şehirler, olmazsa ülke merkezi. Eşleşmeyenler listede kalır.
// Kapsam filtresi: Tümü / Yurtiçi / Yurtdışı.

type InvRow = {
  warehouse_id: string;
  warehouse_name: string;
  location_type: "warehouse" | "factory" | "foreign";
  product_name: string;
  available_qty: number | null;
};

type ProductQty = { name: string; ton: number };
type WhAgg = {
  id: string;
  name: string;
  type: "warehouse" | "factory" | "foreign";
  city: string | null;
  country: string | null;
  coords: [number, number] | null;
  total: number;
  products: ProductQty[];
};

const BRAND = "#15803d";
const FACTORY = "#7c3aed";
const FOREIGN = "#ca8a04"; // yurtdışı depo (sarı)

export function StockMap() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InvRow[]>([]);
  const [locByWh, setLocByWh] = useState<Record<string, { city: string | null; country: string | null }>>({});
  const [scope, setScope] = useState<"all" | "domestic" | "foreign">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const [inv, wh] = await Promise.all([
        supabase
          .from("inventory")
          .select("warehouse_id,warehouse_name,location_type,product_name,available_qty"),
        supabase.from("warehouses").select("id,city,country"),
      ]);
      if (inv.error) { setError(inv.error.message); setLoading(false); return; }
      setRows((inv.data as InvRow[]) || []);
      const cmap: Record<string, { city: string | null; country: string | null }> = {};
      ((wh.data as { id: string; city: string | null; country: string | null }[] | null) || []).forEach((w) => {
        cmap[w.id] = { city: w.city, country: w.country };
      });
      setLocByWh(cmap);
      setLoading(false);
    })();
  }, [supabase]);

  // Depo bazlı toplama: toplam mevcut tonaj + ürün kırılımı (yalnızca stok > 0).
  const warehouses = useMemo<WhAgg[]>(() => {
    const map = new Map<string, WhAgg>();
    for (const r of rows) {
      const av = Number(r.available_qty) || 0;
      if (av <= 0) continue;
      let e = map.get(r.warehouse_id);
      if (!e) {
        const loc = locByWh[r.warehouse_id] ?? { city: null, country: null };
        e = {
          id: r.warehouse_id,
          name: r.warehouse_name,
          type: r.location_type,
          city: loc.city,
          country: loc.country,
          coords: geocodeLocation(loc.city, loc.country),
          total: 0,
          products: [],
        };
        map.set(r.warehouse_id, e);
      }
      e.total += av;
      e.products.push({ name: r.product_name, ton: av });
    }
    const list = Array.from(map.values());
    list.forEach((w) => w.products.sort((a, b) => b.ton - a.ton));
    return list.sort((a, b) => b.total - a.total);
  }, [rows, locByWh]);

  const scoped = useMemo(
    () =>
      warehouses.filter((w) =>
        scope === "all" ? true : scope === "foreign" ? w.type === "foreign" : w.type !== "foreign",
      ),
    [warehouses, scope],
  );
  const onMap = useMemo(() => scoped.filter((w) => w.coords), [scoped]);
  const maxTon = useMemo(() => Math.max(1, ...onMap.map((w) => w.total)), [onMap]);

  // Leaflet haritasını kur (yalnızca tarayıcıda, dinamik import ile).
  useEffect(() => {
    if (loading || onMap.length === 0 || !mapDivRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapDivRef.current) return;
      map = L.map(mapDivRef.current, { scrollWheelZoom: false }).setView(TURKEY_CENTER, 6);
      mapRef.current = map;

      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      });
      tiles.on("tileerror", () => setTilesFailed(true));
      tiles.addTo(map);

      const bounds: [number, number][] = [];
      for (const w of onMap) {
        if (!w.coords) continue;
        const r = 8 + 26 * Math.sqrt(w.total / maxTon);
        const color = w.type === "factory" ? FACTORY : w.type === "foreign" ? FOREIGN : BRAND;
        const marker = L.circleMarker(w.coords, {
          radius: r,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.75,
        }).addTo(map);

        const list = w.products
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:12px">
            <span>${escapeHtml(p.name)}</span><b>${formatNumber(p.ton)} ton</b></div>`)
          .join("");
        marker.bindPopup(
          `<div style="min-width:180px">
             <div style="font-weight:700;margin-bottom:2px">${escapeHtml(w.name)}</div>
             <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
               ${w.type === "factory" ? "Fabrika" : w.type === "foreign" ? "Yurtdışı Depo" : "Depo"}${[w.city, w.country].filter(Boolean).length ? " · " + escapeHtml([w.city, w.country].filter(Boolean).join(", ")) : ""}
             </div>
             ${list}
             <div style="border-top:1px solid #e5e7eb;margin-top:6px;padding-top:4px;display:flex;justify-content:space-between">
               <b>Toplam</b><b>${formatNumber(w.total)} ton</b>
             </div>
           </div>`,
        );
        marker.bindTooltip(`${escapeHtml(w.name)} — ${formatNumber(w.total)} ton`, { direction: "top" });
        bounds.push(w.coords);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
      else if (bounds.length === 1) map.setView(bounds[0], 7);
      // Konteyner boyutu geç oturursa yeniden ölç.
      setTimeout(() => map && map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      if (map) { map.remove(); mapRef.current = null; }
    };
  }, [loading, onMap, maxTon]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Harita verisi yüklenemedi: {error}
    </div>
  );
  if (warehouses.length === 0)
    return <EmptyState message="Stoklu depo/fabrika yok. Operasyon veya stok hareketleri girildikçe burada görünür." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
          {([["all", "Tümü"], ["domestic", "Yurtiçi"], ["foreign", "Yurtdışı"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={`px-3 py-1.5 font-medium ${scope === k ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: BRAND }} /> Depo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: FACTORY }} /> Fabrika
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: FOREIGN }} /> Yurtdışı
          </span>
          <span className="text-gray-400">Daire büyüklüğü ≈ tonaj · üstüne gelince / tıklayınca ürün kırılımı</span>
        </div>
      </div>

      {scoped.length === 0 ? (
        <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {scope === "foreign"
            ? "Stoklu yurtdışı depo yok. Stok → Depolar / Fabrikalar'dan tür 'Yurtdışı Depo' olan bir depo ekleyin; Operasyon → Yurtdışı Yükleme ile stok girildiğinde burada görünür."
            : "Bu kapsamda stoklu depo yok."}
        </div>
      ) : onMap.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div ref={mapDivRef} style={{ height: 460, width: "100%" }} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Bu kapsamdaki depoların konumu eşleşmedi. Depolara Stok → Depolar&apos;dan şehir/ülke ekleyin
          (yurtdışı için liman şehri veya ülke adı yeterli).
        </div>
      )}

      {tilesFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Harita altlığı (karolar) yüklenemedi; konumlar ve tonajlar aşağıdaki listede tam olarak görünür.
        </div>
      )}

      {/* Konum + ürün kırılımı listesi (haritanın metinsel karşılığı, her zaman görünür) */}
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border bg-gray-50 px-4 py-2 text-xs font-medium uppercase text-gray-500">
          Konum bazında stok
        </div>
        <div className="divide-y divide-border">
          {scoped.map((w) => (
            <div key={w.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.name}</span>
                  <Badge color={w.type === "factory" ? "purple" : w.type === "foreign" ? "yellow" : "blue"}>
                    {w.type === "factory" ? "Fabrika" : w.type === "foreign" ? "Yurtdışı" : "Depo"}
                  </Badge>
                  {(w.city || w.country) && (
                    <span className="text-xs text-gray-500">{[w.city, w.country].filter(Boolean).join(", ")}</span>
                  )}
                  {!w.coords && <span className="text-xs text-amber-600">(harita dışı — şehir/ülke eşleşmedi)</span>}
                </div>
                <span className="font-semibold">{formatNumber(w.total)} ton</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                {w.products.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className="text-gray-500">{p.name}:</span>
                    <span className="font-medium text-gray-900">{formatNumber(p.ton)} ton</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
