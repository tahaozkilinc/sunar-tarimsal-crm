import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/nav";
import type { Role } from "@/lib/types";

type StatCard = {
  label: string;
  table: string;
  href: string;
  filter?: Record<string, string>;
  color: string;
};

const STATS_BY_ROLE: Record<Role, StatCard[]> = {
  admin: [
    { label: "Sözleşmeler", table: "purchase_contracts", href: "/purchasing", color: "bg-blue-50 text-blue-700" },
    { label: "Satışlar", table: "sales_orders", href: "/sales", color: "bg-green-50 text-green-700" },
    { label: "Firmalar", table: "companies", href: "/crm", color: "bg-purple-50 text-purple-700" },
    { label: "Stok Hareketleri", table: "stock_movements", href: "/operations", color: "bg-amber-50 text-amber-700" },
    { label: "Açık Aktiviteler", table: "crm_activities", href: "/crm", filter: { status: "open" }, color: "bg-rose-50 text-rose-700" },
    { label: "Kullanıcılar", table: "profiles", href: "/admin", color: "bg-gray-50 text-gray-700" },
  ],
  purchasing: [
    { label: "Sözleşmeler", table: "purchase_contracts", href: "/purchasing", color: "bg-blue-50 text-blue-700" },
    { label: "Tedarikçiler", table: "companies", href: "/crm", color: "bg-purple-50 text-purple-700" },
    { label: "Açık Aktiviteler", table: "crm_activities", href: "/crm", filter: { status: "open" }, color: "bg-rose-50 text-rose-700" },
  ],
  operations: [
    { label: "Stok Hareketleri", table: "stock_movements", href: "/operations", color: "bg-amber-50 text-amber-700" },
    { label: "Depolar / Fabrikalar", table: "warehouses", href: "/admin", color: "bg-blue-50 text-blue-700" },
    { label: "Sözleşmeler", table: "purchase_contracts", href: "/purchasing", color: "bg-green-50 text-green-700" },
  ],
  sales: [
    { label: "Satışlar", table: "sales_orders", href: "/sales", color: "bg-green-50 text-green-700" },
    { label: "Müşteriler", table: "companies", href: "/crm", color: "bg-purple-50 text-purple-700" },
    { label: "Açık Aktiviteler", table: "crm_activities", href: "/crm", filter: { status: "open" }, color: "bg-rose-50 text-rose-700" },
  ],
  pending: [],
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const cards = STATS_BY_ROLE[profile.role] ?? [];

  const counts = await Promise.all(
    cards.map(async (c) => {
      let q = supabase.from(c.table).select("*", { count: "exact", head: true });
      if (c.filter)
        for (const [k, v] of Object.entries(c.filter)) q = q.eq(k, v);
      const { count } = await q;
      return count ?? 0;
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          Merhaba, {profile.full_name || profile.email}
        </h1>
        <p className="text-sm text-gray-500">
          {ROLE_LABELS[profile.role]} paneli
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map((c, i) => (
          <Link key={c.label} href={c.href}>
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className={`mb-3 inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${c.color}`}>
                {c.label}
              </div>
              <div className="text-3xl font-bold">{counts[i]}</div>
            </Card>
          </Link>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-gray-500">Görüntülenecek veri yok.</p>
      )}
    </div>
  );
}
