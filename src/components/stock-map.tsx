"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { TURKEY_CENTER, geocodeLocation } from "@/lib/turkey-cities";

// Stok haritası: TÜM depo/fabrikalar noktayla gösterilir (stoksuz olanlar da
// dahil — "bu liman/depo nerede" bilgisi tek başına değerlidir). Stoku olanlar
// tonaja göre büyüyen dolu baloncukla, stoksuz olanlar sabit küçük içi boş bir
// halka ile ayrılır. Konum önceliği: 1) depoya CRM → Depolar'dan haritadan
// seçilmiş TAM koordinat (lat/lng) varsa birebir onu kullanır; 2) yoksa
// city+country'den TAHMİNİ türetir (geocodeLocation: TR illeri, yurtdışı
// liman/şehirler, olmazsa ülke merkezi). Eşleşmeyenler listede kalır.
// Kapsam filtresi: Tümü/Yurtiçi/Yurtdışı.

type InvRow = {
  warehouse_id: string;
  product_name: string;
  available_qty: number | null;
};

type WhMeta = {
  name: string;
  type: "warehouse" | "factory" | "foreign";
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

type ProductQty = { name: string; ton: number };
type WhAgg = {
  id: string;
  name: string;
  type: "warehouse" | "factory" | "foreign";
  city: string | null;
  country: string | null;
  coords: [number, number] | null;
  exact: boolean; // true = haritadan seçilmiş tam koordinat, false = city/country tahmini
  total: number; // 0 ise "stok yok" olarak gösterilir
  products: ProductQty[];
};

const BRAND = "#15803d";
const FACTORY = "#7c3aed";
const FOREIGN = "#ca8a04"; // yurtdışı depo (sarı)

export function StockMap() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InvRow[]>([]);
  const [whById, setWhById] = useState<Record<string, WhMeta>>({});
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
        supabase.from("inventory").select("warehouse_id,product_name,available_qty"),
        supabase.from("warehouses").select("id,name,type,city,country,lat,lng"),
      ]);
      if (inv.error) { setError(inv.error.message); setLoading(false); return; }
      setRows((inv.data as InvRow[]) || []);
      const wmap: Record<string, WhMeta> = {};
      ((wh.data as (WhMeta & { id: string })[] | null) || []).forEach((w) => {
        wmap[w.id] = { name: w.name, type: w.type, city: w.city, country: w.country, lat: w.lat, lng: w.lng };
      });
      setWhById(wmap);
      setLoading(false);
    })();
  }, [supabase]);

  // Önce TÜM depolar (stoksuz dahil) noktaya dönüşür, sonra stok varsa üzerine eklenir.
  const warehouses = useMemo<WhAgg[]>(() => {
    const map = new Map<string, WhAgg>();
    Object.entries(whById).forEach(([id, w]) => {
      const exactCoords: [number, number] | null =
        w.lat !== null && w.lng !== null ? [w.lat, w.lng] : null;
      map.set(id, {
        id,
        name: w.name,
        type: w.type,
        city: w.city,
        country: w.country,
        coords: exactCoords ?? geocodeLocation(w.city, w.country),
        exact: exactCoords !== null,
        total: 0,
        products: [],
      });
    });
    for (const r of rows) {
      const av = Number(r.available_qty) || 0;
      if (av <= 0) continue;
      const e = map.get(r.warehouse_id);
      if (!e) continue;
      e.total += av;
      e.products.push({ name: r.product_name, ton: av });
    }
    const list = Array.from(map.values());
    list.forEach((w) => w.products.sort((a, b) => b.ton - a.ton));
    return list.sort((a, b) => b.total - a.total);
  }, [rows, whById]);

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
      // leaflet.markercluster kendi paketini import etmez; global L'ye "yapışır"
      // (klasik <script> sırası varsayımı) — bundler'da bunu garanti etmek için
      // içe aktarmadan önce elle set ediyoruz.
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (cancelled || !mapDivRef.current) return;
      map = L.map(mapDivRef.current, { scrollWheelZoom: true }).setView(TURKEY_CENTER, 6);
      mapRef.current = map;

      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      });
      tiles.on("tileerror", () => setTilesFailed(true));
      tiles.addTo(map);

      // Yakın depolar aynı noktada/çok yakında üst üste binen baloncuklar
      // yerine tek bir "N depo" kümesi olarak gösterilir; tıklanınca/yakınlaşınca
      // ayrışır (aynı noktadaysa "spiderfy" ile daireye dizilir).
      const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 });

      const bounds: [number, number][] = [];
      for (const w of onMap) {
        if (!w.coords) continue;
        const hasStock = w.total > 0;
        const color = w.type === "factory" ? FACTORY : w.type === "foreign" ? FOREIGN : BRAND;
        // circleMarker (Path) DEĞİL: markercluster kümeleme/spiderfy sırasında
        // çocuk katmanlarda setOpacity(n) çağırıyor — bu yalnızca L.Marker'da
        // var, Path/CircleMarker'da yok (yalnızca setStyle var). Aynı "tonaja
        // göre büyüklük" görünümünü divIcon'lu bir L.marker ile koruyoruz.
        // Stoku olan yerler tonaja göre büyüyen DOLU baloncuk; stoksuz yerler
        // (ör. henüz malı gelmemiş bir liman deposu) sabit küçük İÇİ BOŞ bir
        // halka — konumu göstermeye devam eder ama tonajla karışmaz.
        const icon = hasStock
          ? (() => {
              const r = 8 + 26 * Math.sqrt(w.total / maxTon);
              const d = r * 2;
              return L.divIcon({
                className: "wh-marker",
                html: `<div style="width:${d}px;height:${d}px;border-radius:50%;background:${color};opacity:0.75;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
                iconSize: [d, d],
                iconAnchor: [r, r],
              });
            })()
          : L.divIcon({
              className: "wh-marker-empty",
              html: `<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2.5px solid ${color};opacity:0.9"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            });
        const marker = L.marker(w.coords, { icon });
        clusterGroup.addLayer(marker);

        const list = w.products
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:12px">
            <span>${escapeHtml(p.name)}</span><b>${formatNumber(p.ton)} ton</b></div>`)
          .join("");
        marker.bindPopup(
          `<div style="min-width:180px">
             <div style="font-weight:700;margin-bottom:2px">${escapeHtml(w.name)}</div>
             <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
               ${w.type === "factory" ? "Fabrika" : w.type === "foreign" ? "Yurtdışı Depo" : "Depo"}${[w.city, w.country].filter(Boolean).length ? " · " + escapeHtml([w.city, w.country].filter(Boolean).join(", ")) : ""}
               ${w.exact ? '<br/><span style="color:#15803d;font-weight:600">✓ Tam konum</span>' : '<br/><span style="color:#b45309">≈ Tahmini konum (şehirden)</span>'}
             </div>
             ${
               hasStock
                 ? `${list}
             <div style="border-top:1px solid #e5e7eb;margin-top:6px;padding-top:4px;display:flex;justify-content:space-between">
               <b>Toplam</b><b>${formatNumber(w.total)} ton</b>
             </div>`
                 : '<div style="color:#9ca3af">Stok yok</div>'
             }
           </div>`,
        );
        marker.bindTooltip(
          hasStock ? `${escapeHtml(w.name)} — ${formatNumber(w.total)} ton` : escapeHtml(w.name),
          { direction: "top" },
        );
        bounds.push(w.coords);
      }
      clusterGroup.addTo(map);
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
    return <EmptyState message="Henüz depo/fabrika eklenmemiş. CRM → Depolar'dan ekleyin." />;

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
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-gray-400 bg-white" /> Stok yok
          </span>
          <span className="text-gray-400">
            Dolu daire = stoklu (büyüklük ≈ tonaj), içi boş halka = şu an stok yok · üstüne gelince /
            tıklayınca detay · yakın depolar sayı rozetiyle gruplanır, tıklayınca ayrışır
          </span>
        </div>
      </div>

      {scoped.length === 0 ? (
        <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {scope === "foreign"
            ? "Yurtdışı depo yok. CRM → Depolar'dan tür 'Yurtdışı Depo' olan bir depo ekleyin."
            : "Bu kapsamda depo yok."}
        </div>
      ) : onMap.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div ref={mapDivRef} style={{ height: 460, width: "100%" }} />
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Bu kapsamdaki depoların konumu eşleşmedi. CRM → Depolar&apos;dan şehir/ülke ekleyin
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
                  {w.coords && (
                    <Badge color={w.exact ? "green" : "yellow"}>{w.exact ? "Tam konum" : "Tahmini"}</Badge>
                  )}
                  {!w.coords && <span className="text-xs text-amber-600">(harita dışı — şehir/ülke eşleşmedi)</span>}
                </div>
                <span className={w.total > 0 ? "font-semibold" : "text-sm text-gray-400"}>
                  {w.total > 0 ? `${formatNumber(w.total)} ton` : "Stok yok"}
                </span>
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
