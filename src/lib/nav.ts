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
    roles: ["admin", "purchasing", "operations", "sales", "finans", "maliyet", "viewer", "nakliyeci", "gozetim"],
  },
  {
    href: "/crm",
    label: "CRM",
    icon: "Users",
    roles: ["admin", "purchasing", "sales", "operations", "viewer"],
  },
  {
    href: "/purchasing",
    label: "Bağlantı",
    icon: "Wheat",
    roles: ["admin", "purchasing", "viewer"],
  },
  {
    href: "/imports",
    label: "İthalat",
    icon: "BarChart3",
    roles: ["admin", "purchasing", "viewer"],
  },
  {
    href: "/operations",
    label: "Operasyon",
    icon: "Truck",
    roles: ["admin", "operations", "viewer", "nakliyeci", "gozetim"],
  },
  {
    href: "/inventory",
    label: "Stok",
    icon: "Boxes",
    roles: ["admin", "operations", "sales", "viewer"],
  },
  {
    href: "/sales",
    label: "Satış",
    icon: "TrendingUp",
    roles: ["admin", "sales", "viewer"],
  },
  {
    href: "/finance",
    label: "Finans",
    icon: "Wallet",
    roles: ["admin", "finans", "viewer"],
  },
  {
    href: "/cost",
    label: "Maliyet",
    icon: "Calculator",
    roles: ["admin", "maliyet", "viewer"],
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
  finans: "Finans",
  maliyet: "Maliyet",
  viewer: "Görüntüleyici (Tümü)",
  nakliyeci: "Nakliyeci",
  gozetim: "Gözetim",
  purchasing_view: "Satın Alma (Görüntüleme)",
  operations_view: "Operasyon (Görüntüleme)",
  sales_view: "Satış (Görüntüleme)",
  pending: "Onay Bekliyor",
};

// "_view" salt-okunur roller, taban rolüyle aynı menüleri/erişimi alır
// (yetki farkı yazma tarafındadır: RLS ve writeRoles _view'i içermez).
export function baseRole(role: Role): Role {
  return (role.endsWith("_view") ? role.slice(0, -"_view".length) : role) as Role;
}

export function navForRole(role: Role): NavItem[] {
  const base = baseRole(role);
  return NAV_ITEMS.filter((item) => item.roles.includes(base));
}

export function canAccess(role: Role, href: string): boolean {
  const base = baseRole(role);
  // En uzun eşleşen yolu bul (örn. /purchasing/x -> /purchasing).
  const match = NAV_ITEMS.filter(
    (item) => href === item.href || (item.href !== "/" && href.startsWith(item.href)),
  ).sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return true; // tanımsız yollar (örn. /profile) serbest
  return match.roles.includes(base);
}
