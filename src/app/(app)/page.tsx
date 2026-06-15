import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/nav";
import { formatNumber } from "@/lib/format";
import { ShoppingCart, TrendingUp, Truck, Wallet } from "lucide-react";

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

  const canB = ["admin", "purchasing"].includes(role);
  const canS = ["admin", "sales"].includes(role);
  const canO = ["admin", "operations"].includes(role);
  const canF = ["admin", "finans"].includes(role);

  const [c, s, inv, mv] = await Promise.all([
    canB
      ? supabase.from("purchase_contracts").select("status,quantity")
      : Promise.resolve({ data: null }),
    canS
      ? supabase.from("sales_orders").select("status,quantity")
      : Promise.resolve({ data: null }),
    canS ? supabase.from("inventory").select("available_qty") : Promise.resolve({ data: null }),
    canO
      ? supabase.from("stock_movements").select("movement_type,quantity,movement_date")
      : Promise.resolve({ data: null }),
  ]);

  const contracts = (c.data as { status: string | null; quantity: number | null }[] | null) || [];
  const sales = (s.data as { status: string | null; quantity: number | null }[] | null) || [];
  const inventory = (inv.data as { available_qty: number | null }[] | null) || [];
  const movements =
    (mv.data as
      | { movement_type: string | null; quantity: number | null; movement_date: string | null }[]
      | null) || [];

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

  const cards: FunctionCard[] = [];
  if (canB)
    cards.push({
      title: "Bağlantı",
      href: "/purchasing",
      icon: ShoppingCart,
      tone: "bg-blue-50 text-blue-700",
      main: `${formatNumber(baglantiTon)} ton`,
      sub: `${baglantiActive.length} aktif sözleşme · yolda ${formatNumber(yolda)} ton`,
    });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          Merhaba, {profile.full_name || profile.email}
        </h1>
        <p className="text-sm text-gray-500">{ROLE_LABELS[role]} paneli</p>
      </div>

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
