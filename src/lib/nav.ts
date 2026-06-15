import type { Role } from "./types";

// Her menü öğesi hangi rollere görünür? Rol bazlı izolasyonun UI tarafı.
// (Asıl güvenlik veritabanındaki RLS politikalarıyla sağlanır.)

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide-react ikon adı
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Panel",
    icon: "LayoutDashboard",
    roles: ["admin", "purchasing", "operations", "sales"],
  },
  {
    href: "/crm",
    label: "CRM",
    icon: "Users",
    roles: ["admin", "purchasing", "sales"],
  },
  {
    href: "/purchasing",
    label: "Bağlantı",
    icon: "Wheat",
    roles: ["admin", "purchasing"],
  },
  {
    href: "/operations",
    label: "Operasyon",
    icon: "Truck",
    roles: ["admin", "operations"],
  },
  {
    href: "/inventory",
    label: "Stok",
    icon: "Boxes",
    roles: ["admin", "operations", "sales"],
  },
  {
    href: "/sales",
    label: "Satış",
    icon: "TrendingUp",
    roles: ["admin", "sales"],
  },
  {
    href: "/admin",
    label: "Yönetim",
    icon: "Settings",
    roles: ["admin"],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Yönetici",
  purchasing: "Satın Alma",
  operations: "Operasyon",
  sales: "Satış",
  pending: "Onay Bekliyor",
};

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function canAccess(role: Role, href: string): boolean {
  // En uzun eşleşen yolu bul (örn. /purchasing/x -> /purchasing).
  const match = NAV_ITEMS.filter(
    (item) => href === item.href || (item.href !== "/" && href.startsWith(item.href)),
  ).sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return true; // tanımsız yollar (örn. /profile) serbest
  return match.roles.includes(role);
}
