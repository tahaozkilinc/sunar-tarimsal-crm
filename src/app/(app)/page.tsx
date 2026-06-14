import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/nav";
import { formatDate, formatNumber } from "@/lib/format";

const sum = <T,>(rows: T[], pick: (r: T) => unknown) =>
  rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);

type ContractRow = {
  id: string;
  status: string | null;
  quantity: number | null;
  contract_no: string | null;
  vessel: string | null;
  eta: string | null;
  product_id: string | null;
};
type SalesRow = {
  status: string | null;
  quantity: number | null;
  order_no: string | null;
  product_id: string | null;
};
type MovementRow = {
  movement_type: string | null;
  quantity: number | null;
  movement_date: string | null;
  contract_id: string | null;
  product_id: string | null;
};
type InvRow = { available_qty: number | null };
type ProductRow = { id: string; name: string };

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {unit && <div className="text-xs text-gray-400">{unit}</div>}
    </Card>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      <Link href={href} className="text-xs font-medium text-brand hover:underline">
        Tümünü gör →
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const role = profile.role;
  const supabase = await createClient();

  const canBaglanti = ["admin", "purchasing", "operations"].includes(role);
  const canSatis = ["admin", "sales"].includes(role);
  const canOperasyon = ["admin", "operations"].includes(role);

  const [contractsRes, salesRes, movementsRes, invRes, productsRes] = await Promise.all([
    canBaglanti
      ? supabase
          .from("purchase_contracts")
          .select("id,status,quantity,contract_no,vessel,eta,product_id")
      : Promise.resolve({ data: null }),
    canSatis
      ? supabase.from("sales_orders").select("status,quantity,order_no,product_id")
      : Promise.resolve({ data: null }),
    canOperasyon
      ? supabase
          .from("stock_movements")
          .select("movement_type,quantity,movement_date,contract_id,product_id")
      : Promise.resolve({ data: null }),
    canSatis
      ? supabase.from("inventory").select("available_qty")
      : Promise.resolve({ data: null }),
    supabase.from("products").select("id,name"),
  ]);

  const contracts = (contractsRes.data as ContractRow[] | null) || [];
  const sales = (salesRes.data as SalesRow[] | null) || [];
  const movements = (movementsRes.data as MovementRow[] | null) || [];
  const inventory = (invRes.data as InvRow[] | null) || [];
  const productMap: Record<string, string> = {};
  ((productsRes.data as ProductRow[] | null) || []).forEach((p) => (productMap[p.id] = p.name));
  const productName = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  const vesselMap: Record<string, string> = {};
  contracts.forEach((c) => {
    if (c.vessel) vesselMap[c.id] = c.vessel;
  });

  // ---- Bağlantı ----
  const baglantiTotal = sum(
    contracts.filter((c) => c.status !== "cancelled"),
    (c) => c.quantity,
  );
  const yolda = sum(
    contracts.filter((c) => c.status === "active" || c.status === "in_transit"),
    (c) => c.quantity,
  );
  const geldi = sum(
    contracts.filter((c) => c.status === "arrived" || c.status === "completed"),
    (c) => c.quantity,
  );
  const upcoming = contracts
    .filter((c) => c.status === "active" || c.status === "in_transit")
    .sort((a, b) => (a.eta || "9999").localeCompare(b.eta || "9999"))
    .slice(0, 5);

  // ---- Satış ----
  const bekleyenSatis = sum(
    sales.filter((s) => s.status === "draft" || s.status === "confirmed"),
    (s) => s.quantity,
  );
  const teslim = sum(
    sales.filter((s) => s.status === "delivered" || s.status === "invoiced"),
    (s) => s.quantity,
  );
  const satilabilirStok = sum(inventory, (r) => r.available_qty);
  const bekleyenList = sales
    .filter((s) => s.status === "draft" || s.status === "confirmed")
    .slice(0, 5);

  // ---- Operasyon ----
  const inbound = movements.filter((m) => m.movement_type === "inbound");
  const toplamGiris = sum(inbound, (m) => m.quantity);
  const now = new Date();
  const buAyGiris = sum(
    inbound.filter((m) => {
      if (!m.movement_date) return false;
      const d = new Date(m.movement_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
    (m) => m.quantity,
  );
  const sonBosaltma = [...inbound]
    .sort((a, b) => (b.movement_date || "").localeCompare(a.movement_date || ""))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">
          Merhaba, {profile.full_name || profile.email}
        </h1>
        <p className="text-sm text-gray-500">{ROLE_LABELS[role]} paneli</p>
      </div>

      {/* BAĞLANTI */}
      {canBaglanti && (
        <section className="space-y-3">
          <SectionHeader title="Bağlantı" href="/purchasing" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Toplam Bağlı" value={formatNumber(baglantiTotal)} unit="ton" />
            <Stat label="Yolda / Aktif" value={formatNumber(yolda)} unit="ton" />
            <Stat label="Gelen" value={formatNumber(geldi)} unit="ton" />
            <Stat label="Sözleşme" value={String(contracts.filter((c) => c.status !== "cancelled").length)} unit="adet" />
          </div>
          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">Yolda / Gelecek olanlar</div>
            {upcoming.length === 0 ? (
              <div className="text-sm text-gray-500">Yolda kayıt yok.</div>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{c.vessel || c.contract_no || "—"}</span>
                      <span className="text-gray-500"> · {productName(c.product_id)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {formatNumber(c.quantity)} ton
                      <span className="ml-2 text-xs text-gray-400">ETA {formatDate(c.eta)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {/* SATIŞ */}
      {canSatis && (
        <section className="space-y-3">
          <SectionHeader title="Satış" href="/sales" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Satılabilir Stok" value={formatNumber(satilabilirStok)} unit="ton (satılmamış)" />
            <Stat label="Bekleyen Satış" value={formatNumber(bekleyenSatis)} unit="ton" />
            <Stat label="Teslim Edilen" value={formatNumber(teslim)} unit="ton" />
            <Stat label="Satış" value={String(sales.length)} unit="adet" />
          </div>
          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">Bekleyen / Açık satışlar</div>
            {bekleyenList.length === 0 ? (
              <div className="text-sm text-gray-500">Bekleyen satış yok.</div>
            ) : (
              <div className="divide-y divide-border">
                {bekleyenList.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{s.order_no || "—"}</span>
                      <span className="text-gray-500"> · {productName(s.product_id)}</span>
                    </span>
                    <span className="shrink-0">{formatNumber(s.quantity)} ton</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {/* OPERASYON */}
      {canOperasyon && (
        <section className="space-y-3">
          <SectionHeader title="Operasyon" href="/operations" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Toplam Giriş" value={formatNumber(toplamGiris)} unit="ton" />
            <Stat label="Bu Ay Giriş" value={formatNumber(buAyGiris)} unit="ton" />
            <Stat label="Hareket" value={String(movements.length)} unit="adet" />
          </div>
          <Card className="p-4">
            <div className="mb-2 text-sm font-medium">Son boşaltmalar (gemiden/araçtan)</div>
            {sonBosaltma.length === 0 ? (
              <div className="text-sm text-gray-500">Giriş kaydı yok.</div>
            ) : (
              <div className="divide-y divide-border">
                {sonBosaltma.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">
                        {(m.contract_id && vesselMap[m.contract_id]) || productName(m.product_id)}
                      </span>
                      <span className="text-gray-500"> · {productName(m.product_id)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {formatNumber(m.quantity)} ton
                      <span className="ml-2 text-xs text-gray-400">{formatDate(m.movement_date)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
