"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, SearchableSelect, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { TURKEY_CENTER, geocodeLocation } from "@/lib/turkey-cities";

// Stok haritası: TÜM aktif depo/fabrika/limanlar noktayla gösterilir (stoksuz
// olanlar da dahil — "bu liman/depo nerede" bilgisi tek başına değerlidir).
// Limanlar (companies, type='port') KENDİ konumunda AYRI bir nokta olarak
// gösterilir; o limana warehouses.port_id ile bağlı depoların stoğu limanın
// noktasında TOPLANIR (bir depo hem kendi noktasında hem bağlı olduğu limanın
// toplamında görünür — stok hâlâ yalnızca depoda tutulur, bu yalnızca görünüm
// toplamasıdır). Stoku olanlar tonaja göre büyüyen dolu şekille, stoksuz
// olanlar sabit küçük içi boş bir şekille ayrılır (daire = depo/fabrika/
// yurtdışı, kare = liman). Ürün kırılımı yalnızca popup'ta (Stok Durumu
// sekmesiyle mükerrer bir liste haritanın altında tutulmuyor). Konum önceliği:
// 1) CRM'den haritadan seçilmiş TAM koordinat (lat/lng) varsa birebir onu
// kullanır; 2) yoksa city+country'den TAHMİNİ türetir (geocodeLocation).
// Arama + kapsam filtresi (Tümü/Yurtiçi/Yurtdışı/Liman) haritanın üzerinde,
// sabit bir kontrol kutusunda durur. Kümeleme (yakın noktaları "N" rozetiyle
// gruplama) kasıtlı olarak KULLANILMIYOR — her nokta her zaman ayrı görünür.

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
  is_active: boolean;
  port_id: string | null;
};

type PortMeta = {
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

type ProductQty = { name: string; ton: number };
type MapPoint = {
  id: string;
  kind: "warehouse" | "port";
  name: string;
  type: "warehouse" | "factory" | "foreign" | "port";
  city: string | null;
  country: string | null;
  coords: [number, number] | null;
  exact: boolean; // true = haritadan seçilmiş tam koordinat, false = city/country tahmini
  total: number; // 0 ise "stok yok" olarak gösterilir
  products: ProductQty[];
  sourceWarehouses: number; // liman noktaları için: kaç bağlı depodan toplandığı
};

const BRAND = "#15803d";
const FACTORY = "#7c3aed";
const FOREIGN = "#ca8a04"; // yurtdışı depo (sarı)
const PORT = "#0891b2"; // liman (camgöbeği) — depo renklerinden ayrı

// Ürün adına göre sabit bir renk türetir (popup'taki segment barı + nokta
// etiketi aynı rengi kullansın diye) — ürünler açık uçlu (kullanıcı ekliyor),
// önceden tanımlı bir renk paleti yok, bu yüzden isimden deterministik üretilir.
function productColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
}

const TYPE_LABEL = (w: Pick<MapPoint, "kind" | "type">) =>
  w.kind === "port" ? "Liman" : w.type === "factory" ? "Fabrika" : w.type === "foreign" ? "Yurtdışı" : "Depo";

type Scope = "all" | "domestic" | "foreign" | "port";
function inScope(w: MapPoint, s: Scope): boolean {
  if (s === "all") return true;
  if (s === "port") return w.kind === "port";
  if (w.kind === "port") return false;
  return s === "foreign" ? w.type === "foreign" : w.type !== "foreign";
}

export function StockMap() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InvRow[]>([]);
  const [whById, setWhById] = useState<Record<string, WhMeta>>({});
  const [portById, setPortById] = useState<Record<string, PortMeta>>({});
  const [scope, setScope] = useState<Scope>("all");
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersById = useRef<Record<string, any>>({});
  const appliedSearchId = useRef<string>("");

  useEffect(() => {
    (async () => {
      const [inv, wh, ports] = await Promise.all([
        supabase.from("inventory").select("warehouse_id,product_name,available_qty"),
        supabase.from("warehouses").select("id,name,type,city,country,lat,lng,is_active,port_id"),
        supabase.from("companies").select("id,name,city,country,lat,lng").eq("type", "port"),
      ]);
      if (inv.error) { setError(inv.error.message); setLoading(false); return; }
      setRows((inv.data as InvRow[]) || []);
      const wmap: Record<string, WhMeta> = {};
      ((wh.data as (WhMeta & { id: string })[] | null) || []).forEach((w) => {
        wmap[w.id] = {
          name: w.name, type: w.type, city: w.city, country: w.country,
          lat: w.lat, lng: w.lng, is_active: w.is_active, port_id: w.port_id,
        };
      });
      setWhById(wmap);
      const pmap: Record<string, PortMeta> = {};
      ((ports.data as (PortMeta & { id: string })[] | null) || []).forEach((p) => {
        pmap[p.id] = { name: p.name, city: p.city, country: p.country, lat: p.lat, lng: p.lng };
      });
      setPortById(pmap);
      setLoading(false);
    })();
  }, [supabase]);

  // 1) Depo noktaları (pasif depolar hariç) + depo bazlı stok. 2) Liman
  // noktaları: kendi konumu + o limana port_id ile bağlı depoların TOPLAMI.
  const points = useMemo<MapPoint[]>(() => {
    const whPoints = new Map<string, MapPoint>();
    Object.entries(whById).forEach(([id, w]) => {
      if (w.is_active === false) return;
      const exactCoords: [number, number] | null =
        w.lat !== null && w.lng !== null ? [w.lat, w.lng] : null;
      whPoints.set(id, {
        id,
        kind: "warehouse",
        name: w.name,
        type: w.type,
        city: w.city,
        country: w.country,
        coords: exactCoords ?? geocodeLocation(w.city, w.country),
        exact: exactCoords !== null,
        total: 0,
        products: [],
        sourceWarehouses: 1,
      });
    });
    for (const r of rows) {
      const av = Number(r.available_qty) || 0;
      if (av <= 0) continue;
      const e = whPoints.get(r.warehouse_id);
      if (!e) continue;
      e.total += av;
      e.products.push({ name: r.product_name, ton: av });
    }

    const portPoints = new Map<string, MapPoint>();
    Object.entries(portById).forEach(([id, p]) => {
      const exactCoords: [number, number] | null =
        p.lat !== null && p.lng !== null ? [p.lat, p.lng] : null;
      portPoints.set(id, {
        id,
        kind: "port",
        name: p.name,
        type: "port",
        city: p.city,
        country: p.country,
        coords: exactCoords ?? geocodeLocation(p.city, p.country),
        exact: exactCoords !== null,
        total: 0,
        products: [],
        sourceWarehouses: 0,
      });
    });
    whPoints.forEach((wp, whId) => {
      const portId = whById[whId]?.port_id;
      if (!portId || wp.total <= 0) return;
      const port = portPoints.get(portId);
      if (!port) return;
      port.total += wp.total;
      port.products.push(...wp.products);
      port.sourceWarehouses += 1;
    });

    // Aynı ürün birden fazla depodan bir limana toplanınca TEK satıra birleşir.
    const mergeProducts = (products: ProductQty[]): ProductQty[] => {
      const byName = new Map<string, number>();
      products.forEach((p) => byName.set(p.name, (byName.get(p.name) || 0) + p.ton));
      return Array.from(byName, ([name, ton]) => ({ name, ton })).sort((a, b) => b.ton - a.ton);
    };

    const list = [...whPoints.values(), ...portPoints.values()];
    list.forEach((pt) => { pt.products = mergeProducts(pt.products); });
    return list.sort((a, b) => b.total - a.total);
  }, [rows, whById, portById]);

  const scoped = useMemo(() => points.filter((w) => inScope(w, scope)), [points, scope]);
  const onMap = useMemo(() => scoped.filter((w) => w.coords), [scoped]);
  const maxTon = useMemo(() => Math.max(1, ...onMap.map((w) => w.total)), [onMap]);

  // Arama: bir nokta seçilince, o an filtrelenmiş kapsamda görünmüyorsa
  // kapsam otomatik "Tümü"ne genişler (aksi halde nokta haritada yok demektir).
  const searchOptions = useMemo(
    () =>
      points
        .filter((p) => p.coords)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .map((p) => ({ value: p.id, label: `${p.name} — ${TYPE_LABEL(p)}` })),
    [points],
  );
  const handleSearchChange = (id: string) => {
    setSearchId(id);
    if (!id) return;
    const pt = points.find((p) => p.id === id);
    if (pt && !inScope(pt, scope)) setScope("all");
  };

  // Leaflet haritasını kur (yalnızca tarayıcıda, dinamik import ile).
  useEffect(() => {
    if (loading || onMap.length === 0 || !mapDivRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapDivRef.current) return;
      map = L.map(mapDivRef.current, { scrollWheelZoom: true }).setView(TURKEY_CENTER, 6);
      mapRef.current = map;

      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      });
      tiles.on("tileerror", () => setTilesFailed(true));
      tiles.addTo(map);

      markersById.current = {};
      const bounds: [number, number][] = [];
      for (const w of onMap) {
        if (!w.coords) continue;
        const hasStock = w.total > 0;
        const color = w.kind === "port" ? PORT : w.type === "factory" ? FACTORY : w.type === "foreign" ? FOREIGN : BRAND;
        // Şekil = tür (kare -> liman, daire -> depo/fabrika/yurtdışı), dolu/boş = stok durumu.
        const radius = w.kind === "port" ? "6px" : "50%";
        const icon = hasStock
          ? (() => {
              const r = 8 + 26 * Math.sqrt(w.total / maxTon);
              const d = r * 2;
              return L.divIcon({
                className: "wh-marker",
                html: `<div style="width:${d}px;height:${d}px;border-radius:${radius};background:${color};opacity:0.75;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
                iconSize: [d, d],
                iconAnchor: [r, r],
              });
            })()
          : L.divIcon({
              className: "wh-marker-empty",
              html: `<div style="width:12px;height:12px;border-radius:${radius};background:#fff;border:2.5px solid ${color};opacity:0.9"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            });
        const marker = L.marker(w.coords, { icon }).addTo(map);
        markersById.current[w.id] = marker;

        const productRows = w.products
          .map(
            (p) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${productColor(p.name)};margin-right:6px"></span>${escapeHtml(p.name)}</span><b>${formatNumber(p.ton)} ton</b></div>`,
          )
          .join("");
        const segmentBar = w.products
          .map((p) => `<div style="width:${(p.ton / w.total) * 100}%;background:${productColor(p.name)}"></div>`)
          .join("");
        const sourceNote =
          w.kind === "port" && w.sourceWarehouses > 0 ? ` · ${w.sourceWarehouses} depodan toplam` : "";
        marker.bindPopup(
          `<div style="min-width:180px">
             <div style="font-weight:700;margin-bottom:2px">${escapeHtml(w.name)}</div>
             <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
               ${TYPE_LABEL(w)}${sourceNote}${[w.city, w.country].filter(Boolean).length ? " · " + escapeHtml([w.city, w.country].filter(Boolean).join(", ")) : ""}
               ${w.exact ? '<br/><span style="color:#15803d;font-weight:600">✓ Tam konum</span>' : '<br/><span style="color:#b45309">≈ Tahmini konum (şehirden)</span>'}
             </div>
             ${
               hasStock
                 ? `<div style="display:flex;height:6px;width:100%;border-radius:3px;overflow:hidden;margin-bottom:6px">${segmentBar}</div>
             ${productRows}
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

      const focusPt =
        searchId && searchId !== appliedSearchId.current ? onMap.find((p) => p.id === searchId) : undefined;
      if (focusPt?.coords) {
        map.setView(focusPt.coords, 12);
        markersById.current[searchId]?.openPopup();
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 7);
      }
      if (searchId) appliedSearchId.current = searchId;
      // Konteyner boyutu geç oturursa yeniden ölç.
      setTimeout(() => map && map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      if (map) { map.remove(); mapRef.current = null; }
    };
  }, [loading, onMap, maxTon, searchId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Harita verisi yüklenemedi: {error}
    </div>
  );
  if (points.length === 0)
    return <EmptyState message="Henüz depo/fabrika/liman eklenmemiş. CRM'den ekleyin." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
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
          <span className="h-3 w-3 rounded border-2 border-white" style={{ background: PORT }} /> Liman
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-gray-400 bg-white" /> Stok yok
        </span>
        <span className="text-gray-400">
          Daire = depo/fabrika, kare = liman · dolu = stoklu (büyüklük ≈ tonaj), içi boş = şu an stok
          yok · üstüne gelince / tıklayınca ürün kırılımı
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border">
        {/* Arama + kapsam filtresi: haritanın üzerinde sabit bir kontrol kutusu. */}
        <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2 rounded-lg border border-border bg-white/95 p-2 shadow-md backdrop-blur-sm">
          <SearchableSelect
            value={searchId}
            onChange={handleSearchChange}
            options={searchOptions}
            placeholder="Liman/depo ara..."
            className="w-56"
          />
          <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
            {(
              [
                ["all", "Tümü"],
                ["domestic", "Yurtiçi"],
                ["foreign", "Yurtdışı"],
                ["port", "Liman"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                className={`flex-1 px-3 py-1.5 font-medium ${scope === k ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {scoped.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center bg-gray-50 px-6 text-center text-sm text-gray-500">
            {scope === "foreign"
              ? "Yurtdışı depo yok. CRM → Depolar'dan tür 'Yurtdışı Depo' olan bir depo ekleyin."
              : scope === "port"
                ? "Liman yok. CRM'den tür 'Liman' olan bir firma ekleyip konumunu haritadan işaretleyin."
                : "Bu kapsamda depo/liman yok."}
          </div>
        ) : onMap.length > 0 ? (
          <div ref={mapDivRef} style={{ height: 460, width: "100%" }} />
        ) : (
          <div className="flex h-[460px] items-center justify-center bg-amber-50 px-6 text-center text-sm text-amber-700">
            Bu kapsamdaki noktaların konumu eşleşmedi. CRM&apos;den şehir/ülke ekleyin veya haritadan
            tam konum işaretleyin.
          </div>
        )}
      </div>

      {tilesFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Harita altlığı (karolar) yüklenemedi.
        </div>
      )}
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
