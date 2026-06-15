"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navForRole, ROLE_LABELS, type NavItem } from "@/lib/nav";
import type { Profile } from "@/lib/types";
import {
  Boxes,
  Calculator,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Settings,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wheat,
  X,
} from "lucide-react";
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  Truck,
  Boxes,
  TrendingUp,
  Settings,
  Wallet,
  Wheat,
  Calculator,
};

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
        <Leaf className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold">Sunar Tarımsal</div>
        <div className="text-xs text-gray-500">CRM & Operasyon</div>
      </div>
    </div>
  );
}

function NavLinks({
  items,
  pathname,
  onClick,
}: {
  items: NavItem[];
  pathname: string;
  onClick?: () => void;
}) {
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            prefetch
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  return (
    <div className="border-t border-border pt-3">
      <div className="px-2 pb-2">
        <div className="truncate text-sm font-medium">
          {profile.full_name || profile.email}
        </div>
        <div className="text-xs text-gray-500">{ROLE_LABELS[profile.role]}</div>
      </div>
      <button
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        <LogOut className="h-5 w-5" /> Çıkış Yap
      </button>
    </div>
  );
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = navForRole(profile.role);

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      {/* Masaüstü kenar çubuğu */}
      <aside className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border bg-white p-3 md:flex print:hidden">
        <Brand />
        <div className="mt-2 flex flex-1 flex-col">
          <NavLinks items={items} pathname={pathname} />
          <UserBox profile={profile} onLogout={logout} />
        </div>
      </aside>

      {/* Mobil çekmece */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col gap-2 bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex flex-1 flex-col">
              <NavLinks items={items} pathname={pathname} onClick={() => setOpen(false)} />
              <UserBox profile={profile} onLogout={logout} />
            </div>
          </aside>
        </div>
      )}

      {/* İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobil üst bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3 md:hidden print:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-gray-100">
            <Menu className="h-6 w-6" />
          </button>
          <Brand />
          <div className="w-8" />
        </header>

        <main className="flex-1 p-4 sm:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
