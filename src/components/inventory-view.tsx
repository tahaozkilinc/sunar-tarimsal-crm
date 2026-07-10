"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, EmptyState, Input, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { Search } from "lucide-react";

type InventoryRow = {
  warehouse_id: string;
  warehouse_name: string;
  location_type: "warehouse" | "factory" | "foreign";
  product_id: string;
  product_name: string;
  received_qty: number;
  sold_qty: number;
  available_qty: number;
};

const LOC_BADGE: Record<string, { color: "blue" | "purple" | "yellow"; label: string }> = {
  warehouse: { color: "blue", label: "Depo" },
  factory: { color: "purple", label: "Fabrika" },
  foreign: { color: "yellow", label: "Yurtdışı" },
};

export function InventoryView({ hideTitle = false }: { hideTitle?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("warehouse_name");
      if (error) setError(error.message);
      setRows((data as InventoryRow[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.warehouse_name.toLocaleLowerCase("tr").includes(q) ||
        r.product_name.toLocaleLowerCase("tr").includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-3 ${hideTitle ? "justify-end" : "justify-between"}`}>
        {!hideTitle && <h1 className="text-xl font-bold">Stok Durumu</h1>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Depo / ürün ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 pl-8 sm:w-64"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Stok bilgisi yüklenemedi: {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Stok kaydı bulunamadı. Operasyon hareketleri girildikçe burada görünür." />
      ) : (
        <>
          {/* Masaüstü */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Depo / Fabrika</th>
                  <th className="px-4 py-3 font-medium">Ürün</th>
                  <th className="px-4 py-3 text-right font-medium">Giren</th>
                  <th className="px-4 py-3 text-right font-medium">Satılan</th>
                  <th className="px-4 py-3 text-right font-medium">Kullanılabilir</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={`${r.warehouse_id}-${r.product_id}`}
                    className="border-b border-border last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <span className="mr-2">{r.warehouse_name}</span>
                      <Badge color={(LOC_BADGE[r.location_type] || LOC_BADGE.warehouse).color}>
                        {(LOC_BADGE[r.location_type] || LOC_BADGE.warehouse).label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{r.product_name}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.received_qty)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(r.sold_qty)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatNumber(r.available_qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil */}
          <div className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <div
                key={`${r.warehouse_id}-${r.product_id}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                  <span className="font-semibold">{r.product_name}</span>
                  <Badge color={(LOC_BADGE[r.location_type] || LOC_BADGE.warehouse).color}>
                    {r.warehouse_name}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Giren</div>
                    {formatNumber(r.received_qty)}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Satılan</div>
                    {formatNumber(r.sold_qty)}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Kullanılabilir</div>
                    <span className="font-semibold">{formatNumber(r.available_qty)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
