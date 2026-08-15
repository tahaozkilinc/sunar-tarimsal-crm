"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Input, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { exportToExcel } from "@/lib/export";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { Download } from "lucide-react";

// Her fonksiyonun (Bağlantı / Satış / Operasyon) kendi "Özet" sekmesi.
// Veriyi istemci tarafında çeker; RLS gereği rol neyi görebiliyorsa onu gösterir.

const sumBy = <T,>(rows: T[], pick: (r: T) => unknown) =>
  rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {unit && <div className="text-xs text-gray-400">{unit}</div>}
    </Card>
  );
}

function ListCard({
  title,
  empty,
  children,
  count,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {count === 0 ? (
        <div className="py-2 text-sm text-gray-500">{empty}</div>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

function useProductMap(supabase: ReturnType<typeof createClient>) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.from("products").select("id,name");
      if (!on) return;
      const m: Record<string, string> = {};
      ((data as { id: string; name: string }[] | null) || []).forEach((p) => (m[p.id] = p.name));
      setMap(m);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);
  return map;
}

// ---------------------------------------------------------------------------
// BAĞLANTI
// ---------------------------------------------------------------------------
type Contract = {
  id: string;
  status: string | null;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  created_at: string | null;
  contract_no: string | null;
  vessel: string | null;
  eta: string | null;
  product_id: string | null;
};

const OPEN_STATUSES = new Set(["draft", "active", "in_transit"]);
const CARD_COLORS = [
  "#4b5563", "#84cc16", "#22c55e", "#6b7280", "#14b8a6",
  "#ec4899", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4",
];

type ProductStat = {
  id: string;
  name: string;
  color: string;
  openCount: number;
  openTon: number;
  yearCount: number;
  yearTon: number;
  avgPrice: number;
  currency: string;
  donut: number;
};

function Donut({ pct, color }: { pct: number; color: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${p * 3.6}deg, #e5e7eb 0deg)` }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold">
        %{p}
      </div>
    </div>
  );
}

export function BaglantiSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("purchase_contracts")
        .select(
          "id,status,quantity,price,currency,created_at,contract_no,vessel,eta,product_id",
        );
      if (!on) return;
      setRows((data as Contract[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  const year = new Date().getFullYear();

  const productStats = useMemo<ProductStat[]>(() => {
    type Acc = {
      openCount: number;
      openTon: number;
      yearCount: number;
      yearTon: number;
      byCur: Record<string, { amt: number; ton: number }>;
    };
    const map = new Map<string, Acc>();
    rows.forEach((c) => {
      const key = c.product_id || "none";
      const e: Acc =
        map.get(key) || { openCount: 0, openTon: 0, yearCount: 0, yearTon: 0, byCur: {} };
      const q = Number(c.quantity) || 0;
      if (c.status && OPEN_STATUSES.has(c.status)) {
        e.openCount++;
        e.openTon += q;
      }
      const cy = c.created_at ? new Date(c.created_at).getFullYear() : null;
      if (c.status !== "cancelled" && cy === year) {
        e.yearCount++;
        e.yearTon += q;
        const price = Number(c.price) || 0;
        if (price > 0 && q > 0) {
          const cur = c.currency || "USD";
          const b = e.byCur[cur] || { amt: 0, ton: 0 };
          b.amt += price * q;
          b.ton += q;
          e.byCur[cur] = b;
        }
      }
      map.set(key, e);
    });
    const out: ProductStat[] = [];
    Array.from(map.entries())
      .sort((a, b) => b[1].yearTon - a[1].yearTon)
      .forEach(([id, v], i) => {
        if (v.yearCount === 0 && v.openCount === 0) return;
        let cur = "USD";
        let bestTon = -1;
        let avg = 0;
        for (const [c, b] of Object.entries(v.byCur)) {
          if (b.ton > bestTon) {
            bestTon = b.ton;
            cur = c;
            avg = b.ton ? b.amt / b.ton : 0;
          }
        }
        out.push({
          id,
          name: id === "none" ? "Ürünsüz" : productMap[id] || "Ürünsüz",
          color: CARD_COLORS[i % CARD_COLORS.length],
          openCount: v.openCount,
          openTon: v.openTon,
          yearCount: v.yearCount,
          yearTon: v.yearTon,
          avgPrice: avg,
          currency: cur,
          donut: v.yearTon > 0 ? Math.round((v.openTon / v.yearTon) * 100) : 0,
        });
      });
    return out;
  }, [rows, productMap, year]);

  const upcoming = useMemo(
    () =>
      rows
        .filter((r) => r.status === "active" || r.status === "in_transit")
        .sort((a, b) => (a.eta || "9999").localeCompare(b.eta || "9999"))
        .slice(0, 6),
    [rows],
  );

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      {productStats.length === 0 ? (
        <EmptyState message="Henüz bağlantı yok." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {productStats.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div
                className="px-3 py-2 text-center text-sm font-bold text-white"
                style={{ background: p.color }}
              >
                {p.name}
              </div>
              <div className="space-y-3 p-4">
                <div className="space-y-0.5 text-xs text-gray-600">
                  <div>
                    Açık Bağlantılar: <span className="font-medium">{p.openCount}</span> Ad
                  </div>
                  <div>
                    Açık Tonaj: <span className="font-medium">{formatNumber(p.openTon)}</span> Ton
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Donut pct={p.donut} color={p.color} />
                  <div className="space-y-0.5 text-xs text-gray-600">
                    <div>
                      Yıl Bağlantıları: <span className="font-medium">{p.yearCount}</span> Ad
                    </div>
                    <div>
                      Yıl Tonaj: <span className="font-medium">{formatNumber(p.yearTon)}</span> Ton
                    </div>
                  </div>
                </div>
                <div className="border-t border-border pt-2 text-xs text-gray-600">
                  Ortalama Fiyat:{" "}
                  <span className="font-semibold">
                    {p.avgPrice > 0 ? `${formatNumber(p.avgPrice)} ${p.currency}` : "-"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ListCard title="Yolda / Gelecek olanlar" empty="Yolda kayıt yok." count={upcoming.length}>
        {upcoming.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{c.vessel || c.contract_no || "—"}</span>
              <span className="text-gray-500"> · {pn(c.product_id)}</span>
            </span>
            <span className="shrink-0 text-right">
              {formatNumber(c.quantity)} ton
              <span className="ml-2 text-xs text-gray-400">ETA {formatDate(c.eta)}</span>
            </span>
          </div>
        ))}
      </ListCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SATIŞ
// ---------------------------------------------------------------------------
type Sale = {
  id: string;
  status: string | null;
  quantity: number | null;
  order_no: string | null;
  product_id: string | null;
};
type InvRow = { available_qty: number | null };
type Sellable = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  eta: string | null;
  status: string;
  principal_id: string | null;
};
// "Fire" hesaplaması: operasyoncu tonaj tam tutmadan "Sevkiyatı Bitir" dediği
// (kapanmış) satışlarda satılan - sevk edilen FARKI (yalnız EKSİK yönü —
// fazla sevkiyat fire değildir). Bir satış birden çok depodan sevk
// edilebildiği için fire, o satışın depo bazındaki sevkiyat payına ORANTILI
// dağıtılır (bkz. fireByWarehouse). Gemiden direkt / hiç sevkiyatsız kapanan
// satışların fire'ı "Gemiden Direkt / Atanamayan" kovasına düşer.
type ClosedSale = { id: string; quantity: number | null };
type OutMovement = { sale_id: string | null; warehouse_id: string | null; quantity: number | null };
type WhRef = { id: string; name: string };
const DIRECT_KEY = "_direct_";

export function SatisSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Sale[]>([]);
  const [inv, setInv] = useState<InvRow[]>([]);
  const [sellable, setSellable] = useState<Sellable[]>([]);
  const [principals, setPrincipals] = useState<Record<string, string>>({});
  const [closedSales, setClosedSales] = useState<ClosedSale[]>([]);
  const [outMovements, setOutMovements] = useState<OutMovement[]>([]);
  const [warehouses, setWarehouses] = useState<WhRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const [s, i, sc, pr, cs, om, wh] = await Promise.all([
        supabase.from("sales_orders").select("id,status,quantity,order_no,product_id"),
        supabase.from("inventory").select("available_qty"),
        supabase
          .from("sellable_contracts")
          .select("id,contract_no,vessel,product_id,quantity,eta,status,principal_id"),
        supabase.from("principals").select("id,name"),
        supabase
          .from("sales_orders")
          .select("id,quantity")
          .not("dispatch_closed_at", "is", null)
          .neq("status", "cancelled"),
        supabase
          .from("stock_movements")
          .select("sale_id,warehouse_id,quantity")
          .eq("movement_type", "outbound_sale")
          .not("sale_id", "is", null),
        supabase.from("warehouses").select("id,name"),
      ]);
      if (!on) return;
      setRows((s.data as Sale[] | null) || []);
      setInv((i.data as InvRow[] | null) || []);
      setSellable((sc.data as Sellable[] | null) || []);
      const pm: Record<string, string> = {};
      ((pr.data as { id: string; name: string }[] | null) || []).forEach((p) => (pm[p.id] = p.name));
      setPrincipals(pm);
      setClosedSales((cs.data as ClosedSale[] | null) || []);
      setOutMovements((om.data as OutMovement[] | null) || []);
      setWarehouses((wh.data as WhRef[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  if (loading) return <Loading />;

  const available = sumBy(inv, (r) => r.available_qty);
  const bekleyen = rows.filter((s) => s.status === "draft" || s.status === "confirmed");
  const bekleyenTon = sumBy(bekleyen, (s) => s.quantity);
  const teslim = sumBy(
    rows.filter((s) => s.status === "delivered" || s.status === "invoiced"),
    (s) => s.quantity,
  );

  const sellableSorted = [...sellable].sort((a, b) =>
    (a.eta || "9999").localeCompare(b.eta || "9999"),
  );

  // Depo bazlı fire: kapanmış her satışın EKSİK kalan kısmı, o satışın hangi
  // depo(lar)dan ne kadar sevk edildiğine ORANTILI dağıtılır (bkz. tip tanımı).
  const fireByWarehouse = (() => {
    const dispatchedBySale = new Map<string, number>();
    const byWhForSale = new Map<string, Map<string, number>>();
    outMovements.forEach((m) => {
      if (!m.sale_id) return;
      const q = Number(m.quantity) || 0;
      dispatchedBySale.set(m.sale_id, (dispatchedBySale.get(m.sale_id) || 0) + q);
      const key = m.warehouse_id || DIRECT_KEY;
      const inner = byWhForSale.get(m.sale_id) || new Map<string, number>();
      inner.set(key, (inner.get(key) || 0) + q);
      byWhForSale.set(m.sale_id, inner);
    });

    const fire = new Map<string, number>();
    closedSales.forEach((s) => {
      const qty = Number(s.quantity) || 0;
      const disp = dispatchedBySale.get(s.id) || 0;
      const shortfall = qty - disp;
      if (shortfall <= 0.01) return; // fazla sevkiyat ya da tam eşleşme -> fire yok
      const inner = byWhForSale.get(s.id);
      if (!inner || disp <= 0) {
        fire.set(DIRECT_KEY, (fire.get(DIRECT_KEY) || 0) + shortfall);
        return;
      }
      inner.forEach((whQty, whKey) => {
        fire.set(whKey, (fire.get(whKey) || 0) + shortfall * (whQty / disp));
      });
    });

    return Array.from(fire.entries())
      .map(([key, ton]) => ({
        key,
        name: key === DIRECT_KEY ? "Gemiden Direkt / Atanamayan" : warehouses.find((w) => w.id === key)?.name || "—",
        ton,
      }))
      .filter((r) => r.ton > 0.01)
      .sort((a, b) => b.ton - a.ton);
  })();
  const totalFire = sumBy(fireByWarehouse, (r) => r.ton);
  const maxFire = Math.max(1, ...fireByWarehouse.map((r) => r.ton));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Depodaki Satılabilir" value={formatNumber(available)} unit="ton" />
        <Stat label="Bekleyen Satış" value={formatNumber(bekleyenTon)} unit="ton" />
        <Stat label="Teslim Edilen" value={formatNumber(teslim)} unit="ton" />
        <Stat label="Satış" value={String(rows.length)} unit="adet" />
        <Stat label="Toplam Fire (Kapanan Satışlar)" value={formatNumber(totalFire)} unit="ton" />
      </div>

      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Depo Bazında Fire</div>
        <p className="mb-2 text-xs text-gray-400">
          Operasyoncunun tonaj tam eşleşmeden &quot;Sevkiyatı Bitir&quot; dediği (kapanmış) satışlardaki
          EKSİK kısım — bir satış birden çok depodan sevk edilmişse, fire de aynı oranda paylaştırılır.
        </p>
        {fireByWarehouse.length === 0 ? (
          <div className="py-2 text-sm text-gray-500">Henüz fire yok.</div>
        ) : (
          <div className="space-y-2">
            {fireByWarehouse.map((w) => (
              <div key={w.key} className="flex items-center gap-3">
                <div className="w-36 shrink-0 truncate text-sm">{w.name}</div>
                <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-red-500"
                    style={{ width: `${(w.ton / maxFire) * 100}%` }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-sm font-semibold text-red-600">
                  {formatNumber(w.ton)} ton
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ListCard
        title="Satılabilir Bağlantılar (yoldakiler dahil)"
        empty="Satılabilir bağlantı yok."
        count={sellableSorted.length}
      >
        {sellableSorted.slice(0, 10).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{pn(c.product_id)}</span>
              <span className="text-gray-500">
                {" · "}
                {c.vessel || c.contract_no || "—"}
                {c.principal_id && principals[c.principal_id]
                  ? ` · ${principals[c.principal_id]}`
                  : ""}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {formatNumber(c.quantity)} ton
              <span className="ml-2 text-xs text-gray-400">ETA {formatDate(c.eta)}</span>
            </span>
          </div>
        ))}
      </ListCard>

      <ListCard title="Bekleyen / Açık satışlar" empty="Bekleyen satış yok." count={bekleyen.length}>
        {bekleyen.slice(0, 6).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{s.order_no || "—"}</span>
              <span className="text-gray-500"> · {pn(s.product_id)}</span>
            </span>
            <span className="shrink-0">{formatNumber(s.quantity)} ton</span>
          </div>
        ))}
      </ListCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPERASYON
// ---------------------------------------------------------------------------
type Movement = {
  id: string;
  movement_type: string | null;
  quantity: number | null;
  movement_date: string | null;
  contract_id: string | null;
  product_id: string | null;
};
type ShipContract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  loading_port: string | null;
  product_id: string | null;
  quantity: number | null;
  status: string;
  eta: string | null;
};

export function OperasyonSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Movement[]>([]);
  const [contracts, setContracts] = useState<ShipContract[]>([]);
  const [loading, setLoading] = useState(true);

  // Gemi/bağlantı tablosu filtreleri (serbest metin — "gemi adı", "liman", "ürün")
  const [fVessel, setFVessel] = useState("");
  const [fPort, setFPort] = useState("");
  const [fProduct, setFProduct] = useState("");

  useEffect(() => {
    let on = true;
    (async () => {
      const [m, c] = await Promise.all([
        supabase
          .from("stock_movements")
          .select("id,movement_type,quantity,movement_date,contract_id,product_id"),
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,loading_port,product_id,quantity,status,eta"),
      ]);
      if (!on) return;
      setRows((m.data as Movement[] | null) || []);
      setContracts((c.data as ShipContract[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";

  const vesselMap = useMemo(() => {
    const vm: Record<string, string> = {};
    contracts.forEach((c) => {
      if (c.vessel) vm[c.id] = c.vessel;
    });
    return vm;
  }, [contracts]);

  // Sözleşme başına fiilen çekilen (inbound) toplam.
  const drawnByContract = useMemo(() => {
    const d: Record<string, number> = {};
    rows.forEach((m) => {
      if (m.movement_type !== "inbound" || !m.contract_id) return;
      d[m.contract_id] = (d[m.contract_id] || 0) + (Number(m.quantity) || 0);
    });
    return d;
  }, [rows]);

  // Gemi/bağlantı tablosu: gemi adı / liman / ürün serbest metin filtresi.
  const shipRows = useMemo(() => {
    const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
    const fv = norm(fVessel);
    const fp = norm(fPort);
    const fpr = norm(fProduct);
    return contracts
      .map((c) => ({
        ...c,
        drawn: drawnByContract[c.id] || 0,
        productName: (c.product_id && productMap[c.product_id]) || "Ürünsüz",
      }))
      .filter((c) => {
        if (fv && !norm(c.vessel || c.contract_no || "").includes(fv)) return false;
        if (fp && !norm(c.loading_port || "").includes(fp)) return false;
        if (fpr && !norm(c.productName).includes(fpr)) return false;
        return true;
      })
      .sort((a, b) => (b.eta || "").localeCompare(a.eta || ""));
  }, [contracts, drawnByContract, productMap, fVessel, fPort, fProduct]);

  const exportShips = () => {
    const headers = ["Gemi", "Sözleşme No", "Liman", "Ürün", "Miktar (ton)", "Çekilen (ton)", "Durum", "ETA"];
    const body = shipRows.map((c) => [
      c.vessel || "",
      c.contract_no || "",
      c.loading_port || "",
      c.productName,
      Number(c.quantity) || 0,
      c.drawn,
      CONTRACT_STATUS_OPTIONS.find((o) => o.value === c.status)?.label || c.status,
      formatDate(c.eta),
    ]);
    exportToExcel("Operasyon - Gemiler", headers, body);
  };

  if (loading) return <Loading />;

  const inbound = rows.filter((m) => m.movement_type === "inbound");
  const toplamGiris = sumBy(inbound, (m) => m.quantity);
  const now = new Date();
  const buAy = sumBy(
    inbound.filter((m) => {
      if (!m.movement_date) return false;
      const d = new Date(m.movement_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
    (m) => m.quantity,
  );
  const son = [...inbound]
    .sort((a, b) => (b.movement_date || "").localeCompare(a.movement_date || ""))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam Giriş" value={formatNumber(toplamGiris)} unit="ton" />
        <Stat label="Bu Ay Giriş" value={formatNumber(buAy)} unit="ton" />
        <Stat label="Hareket" value={String(rows.length)} unit="adet" />
      </div>
      <ListCard title="Son boşaltmalar (gemiden / araçtan)" empty="Giriş kaydı yok." count={son.length}>
        {son.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">
                {(m.contract_id && vesselMap[m.contract_id]) || pn(m.product_id)}
              </span>
              <span className="text-gray-500"> · {pn(m.product_id)}</span>
            </span>
            <span className="shrink-0 text-right">
              {formatNumber(m.quantity)} ton
              <span className="ml-2 text-xs text-gray-400">{formatDate(m.movement_date)}</span>
            </span>
          </div>
        ))}
      </ListCard>

      {/* Gemi / bağlantı tablosu: filtrele (gemi adı / liman / ürün) + Excel'e aktar */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Gemiler / Bağlantılar ({shipRows.length})</div>
          {shipRows.length > 0 && (
            <button
              type="button"
              onClick={exportShips}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" /> Excel&apos;e Aktar
            </button>
          )}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Gemi adı..." value={fVessel} onChange={(e) => setFVessel(e.target.value)} />
          <Input placeholder="Liman..." value={fPort} onChange={(e) => setFPort(e.target.value)} />
          <Input placeholder="Ürün..." value={fProduct} onChange={(e) => setFProduct(e.target.value)} />
        </div>
        {contracts.length === 0 ? (
          <div className="py-2 text-sm text-gray-500">Henüz bağlantı yok.</div>
        ) : shipRows.length === 0 ? (
          <div className="py-2 text-sm text-gray-500">Filtreyle eşleşen kayıt yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3 font-medium">Gemi</th>
                  <th className="py-2 pr-3 font-medium">Liman</th>
                  <th className="py-2 pr-3 font-medium">Ürün</th>
                  <th className="py-2 pr-3 text-right font-medium">Miktar</th>
                  <th className="py-2 pr-3 text-right font-medium">Çekilen</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 text-right font-medium">ETA</th>
                </tr>
              </thead>
              <tbody>
                {shipRows.map((c) => {
                  const st = CONTRACT_STATUS_OPTIONS.find((o) => o.value === c.status);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium">{c.vessel || c.contract_no || "—"}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.loading_port || "—"}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.productName}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(c.quantity)}</td>
                      <td className="py-2 pr-3 text-right text-brand">{formatNumber(c.drawn)}</td>
                      <td className="py-2 pr-3">{st && <Badge color={st.color}>{st.label}</Badge>}</td>
                      <td className="py-2 text-right text-gray-500">{formatDate(c.eta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length === 0 && contracts.length === 0 && <EmptyState message="Henüz operasyon hareketi yok." />}
    </div>
  );
}
