import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { baseRole, ROLE_LABELS } from "@/lib/nav";
import { formatDate, formatNumber } from "@/lib/format";
import { AlertTriangle, BarChart3, Calculator, ShoppingCart, TrendingUp, Truck, Users, Wallet } from "lucide-react";

const sum = <T,>(rows: T[], pick: (r: T) => unknown) =>
  rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);

type FunctionCard = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  main: string;
  sub: string;
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const role = profile.role;
  const supabase = await createClient();

  // viewer: her şeyi görür. *_view rolleri taban rolüyle aynı kartları görür.
  // Hepsi salt-okunur; kartlar yalnızca özet/yönlendirme amaçlıdır.
  const v = role === "viewer";
  const base = baseRole(role);
  const canB = v || ["admin", "purchasing"].includes(base);
  const canS = v || ["admin", "sales"].includes(base);
  const canO = v || ["admin", "operations", "nakliyeci", "gozetim", "acente"].includes(base);
  const canF = v || ["admin", "finans"].includes(base);
  const canM = v || ["admin", "maliyet"].includes(base);
  const canCrm = v || ["admin", "purchasing", "sales"].includes(base);

  const year = new Date().getFullYear();
  const [c, s, inv, mv, crm, tuik] = await Promise.all([
    canB || canO
      ? supabase
          .from("purchase_contracts")
          .select("id,vessel,contract_no,status,quantity,eta,payment_due_date,is_paid,surveyor_id,port_id,carrier_id")
      : Promise.resolve({ data: null }),
    canS || canF
      ? supabase.from("sales_orders").select("status,quantity,is_paid,price")
      : Promise.resolve({ data: null }),
    canS ? supabase.from("inventory").select("available_qty") : Promise.resolve({ data: null }),
    canO
      ? supabase.from("stock_movements").select("movement_type,quantity,movement_date")
      : Promise.resolve({ data: null }),
    canCrm
      ? supabase.from("crm_activities").select("status,due_date")
      : Promise.resolve({ data: null }),
    canB
      ? supabase.from("tuik_monthly_imports").select("hs_code").eq("year", year)
      : Promise.resolve({ data: null }),
  ]);

  type PCRow = {
    id: string;
    vessel: string | null;
    contract_no: string | null;
    status: string | null;
    quantity: number | null;
    eta: string | null;
    payment_due_date: string | null;
    is_paid: boolean | null;
    surveyor_id: string | null;
    port_id: string | null;
    carrier_id: string | null;
  };
  const contracts = (c.data as PCRow[] | null) || [];
  const sales =
    (s.data as
      | { status: string | null; quantity: number | null; is_paid: boolean | null; price: number | null }[]
      | null) || [];
  const inventory = (inv.data as { available_qty: number | null }[] | null) || [];
  const movements =
    (mv.data as
      | { movement_type: string | null; quantity: number | null; movement_date: string | null }[]
      | null) || [];
  const activities =
    (crm.data as { status: string | null; due_date: string | null }[] | null) || [];

  const baglantiActive = contracts.filter((r) => r.status !== "cancelled");
  const baglantiTon = sum(baglantiActive, (r) => r.quantity);
  const yolda = sum(
    contracts.filter((r) => r.status === "active" || r.status === "in_transit"),
    (r) => r.quantity,
  );

  const satilabilir = sum(inventory, (r) => r.available_qty);
  const bekleyen = sum(
    sales.filter((r) => r.status === "draft" || r.status === "confirmed"),
    (r) => r.quantity,
  );

  const now = new Date();
  const inbound = movements.filter((m) => m.movement_type === "inbound");
  const buAy = sum(
    inbound.filter((m) => {
      if (!m.movement_date) return false;
      const d = new Date(m.movement_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
    (m) => m.quantity,
  );

  const acikAktivite = activities.filter((a) => a.status === "open");
  const todayStr = now.toISOString().slice(0, 10);
  const gecikenAktivite = acikAktivite.filter((a) => a.due_date && a.due_date < todayStr);

  // ── Uyarılar: rolüne göre "bugün bakılması gerekenler" ──────────────────────
  type Alert = { tone: "red" | "amber" | "blue"; text: string; href: string };
  const alerts: Alert[] = [];
  const in3 = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const shipName = (r: PCRow) => r.vessel || r.contract_no || "—";
  const shipHref = (r: PCRow) => (canO ? `/operations/${r.id}` : "/purchasing");
  const enRoute = contracts.filter((r) =>
    ["draft", "active", "in_transit"].includes(r.status || ""),
  );
  if (canO || canB) {
    enRoute
      .filter((r) => r.eta && r.eta < todayStr)
      .forEach((r) =>
        alerts.push({
          tone: "red",
          text: `${shipName(r)}: ETA geçti (${formatDate(r.eta)}), gemi hâlâ gelmedi`,
          href: shipHref(r),
        }),
      );
    enRoute
      .filter((r) => r.eta && r.eta >= todayStr && r.eta <= in3)
      .forEach((r) => {
        const eksik = [
          !r.surveyor_id && "gözetim",
          !r.port_id && "liman",
          !r.carrier_id && "nakliyeci",
        ]
          .filter(Boolean)
          .join(", ");
        alerts.push({
          tone: "amber",
          text: `${shipName(r)}: ETA yaklaşıyor (${formatDate(r.eta)})${eksik ? ` — atanmamış: ${eksik}` : ""}`,
          href: shipHref(r),
        });
      });
  }
  if (canF || canB) {
    contracts
      .filter((r) => r.status !== "cancelled" && !r.is_paid && r.payment_due_date && r.payment_due_date < todayStr)
      .forEach((r) =>
        alerts.push({
          tone: "red",
          text: `${shipName(r)}: ödeme vadesi geçti (${formatDate(r.payment_due_date)})`,
          href: "/finance",
        }),
      );
    contracts
      .filter(
        (r) =>
          r.status !== "cancelled" &&
          !r.is_paid &&
          r.payment_due_date &&
          r.payment_due_date >= todayStr &&
          r.payment_due_date <= in7,
      )
      .forEach((r) =>
        alerts.push({
          tone: "amber",
          text: `${shipName(r)}: ödeme vadesi yaklaşıyor (${formatDate(r.payment_due_date)})`,
          href: "/finance",
        }),
      );
  }
  if (canCrm && gecikenAktivite.length > 0)
    alerts.push({ tone: "amber", text: `${gecikenAktivite.length} CRM aktivitesi gecikmiş durumda`, href: "/crm" });
  if (canF) {
    const acikTahsilat = sales.filter(
      (x) => x.status !== "cancelled" && !x.is_paid && (Number(x.price) || 0) > 0,
    ).length;
    if (acikTahsilat > 0)
      alerts.push({ tone: "blue", text: `${acikTahsilat} satışın tahsilatı bekliyor`, href: "/finance" });
  }
  if (canS) {
    const negStok = inventory.filter((r) => (Number(r.available_qty) || 0) < -0.001).length;
    if (negStok > 0)
      alerts.push({
        tone: "red",
        text: `${negStok} depo/ürün satırında negatif stok — kayıtları kontrol edin`,
        href: "/inventory",
      });
  }
  const shownAlerts = alerts.slice(0, 8);
  const toneDot: Record<Alert["tone"], string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
  };

  const cards: FunctionCard[] = [];
  if (canCrm)
    cards.push({
      title: "CRM",
      href: "/crm",
      icon: Users,
      tone: "bg-purple-50 text-purple-700",
      main: `${acikAktivite.length}`,
      sub:
        gecikenAktivite.length > 0
          ? `açık aktivite · ${gecikenAktivite.length} gecikmiş`
          : "açık aktivite",
    });
  if (canB)
    cards.push({
      title: "Bağlantı",
      href: "/purchasing",
      icon: ShoppingCart,
      tone: "bg-blue-50 text-blue-700",
      main: `${formatNumber(baglantiTon)} ton`,
      sub: `${baglantiActive.length} aktif sözleşme · yolda ${formatNumber(yolda)} ton`,
    });
  if (canB) {
    // Farklı GTİP'lerin tonu toplanmaz (mısır + yağ + küspe anlamsız);
    // kart bu yıl verisi girilmiş GTİP sayısını gösterir.
    const tuikRows = (tuik.data as { hs_code: string }[] | null) || [];
    const gtipCount = new Set(tuikRows.map((r) => r.hs_code)).size;
    cards.push({
      title: "İthalat",
      href: "/imports",
      icon: BarChart3,
      tone: "bg-emerald-50 text-emerald-700",
      main: gtipCount > 0 ? `${gtipCount} GTİP` : "TÜİK",
      sub:
        gtipCount > 0
          ? `${year} TÜİK verisi girildi · payımızı gör`
          : "TÜİK karşılaştırması · aylık ithalat",
    });
  }
  if (canS)
    cards.push({
      title: "Satış",
      href: "/sales",
      icon: TrendingUp,
      tone: "bg-green-50 text-green-700",
      main: `${formatNumber(satilabilir)} ton`,
      sub: `satılabilir stok · bekleyen ${formatNumber(bekleyen)} ton`,
    });
  if (canO)
    cards.push({
      title: "Operasyon",
      href: "/operations",
      icon: Truck,
      tone: "bg-amber-50 text-amber-700",
      main: `${formatNumber(buAy)} ton`,
      sub: `bu ay giriş · ${inbound.length} giriş hareketi`,
    });
  if (canF)
    cards.push({
      title: "Finans",
      href: "/finance",
      icon: Wallet,
      tone: "bg-rose-50 text-rose-700",
      main: "Ödemeler",
      sub: "öngörülen ödeme tarihleri",
    });
  if (canM)
    cards.push({
      title: "Maliyet",
      href: "/cost",
      icon: Calculator,
      tone: "bg-slate-100 text-slate-700",
      main: "Kâr / Zarar",
      sub: "gemi bazlı al / sat",
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          Merhaba, {profile.full_name || profile.email}
        </h1>
        <p className="text-sm text-gray-500">{ROLE_LABELS[role]} paneli</p>
      </div>

      {shownAlerts.length > 0 && (
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Dikkat Gerekenler</h2>
            <span className="text-xs text-gray-400">({alerts.length})</span>
          </div>
          <div className="divide-y divide-border">
            {shownAlerts.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="-mx-2 flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${toneDot[a.tone]}`} />
                <span className="min-w-0 truncate">{a.text}</span>
              </Link>
            ))}
            {alerts.length > shownAlerts.length && (
              <div className="px-2 py-1.5 text-xs text-gray-400">
                +{alerts.length - shownAlerts.length} uyarı daha
              </div>
            )}
          </div>
        </Card>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-gray-500">Görüntülenecek veri yok.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} href={card.href}>
                <Card className="p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${card.tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-semibold">{card.title}</span>
                  </div>
                  <div className="mt-4 text-3xl font-bold">{card.main}</div>
                  <div className="mt-1 text-sm text-gray-500">{card.sub}</div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
