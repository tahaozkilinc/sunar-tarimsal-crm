"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Select, Spinner } from "./ui";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { Plus, X } from "lucide-react";

// Bir satışın satış Detayı görünümüne (ResourceManager detailExtra) enjekte
// edilir: sevkiyatçının hangi depo(lar)dan çıkış yapabileceğini (çoklu seçim)
// yönetir. Bu liste boşsa Satış Operasyon ekranında "Depodan" modu hiçbir
// depo göstermez (yalnızca "Gemiden Direkt" varsa o çalışır) — ve DB
// (fn_sm_guard) burada olmayan bir depodan sevkiyatı zaten sert şekilde
// reddeder; bu bileşen o beyaz listeyi düzenleyen ekrandır.

type Wh = { id: string; name: string; type: string };
type SaleWh = { warehouse_id: string };

export function SaleWarehousesManager({ saleId, role }: { saleId: string; role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canWrite = ["admin", "sales"].includes(baseRole(role));

  const [allWarehouses, setAllWarehouses] = useState<Wh[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [addPick, setAddPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const [whRes, swRes] = await Promise.all([
      supabase.from("warehouses").select("id,name,type").eq("is_active", true).order("name"),
      supabase.from("sale_warehouses").select("warehouse_id").eq("sale_id", saleId),
    ]);
    setAllWarehouses((whRes.data as Wh[]) || []);
    setSelected(((swRes.data as SaleWh[]) || []).map((r) => r.warehouse_id));
    setLoading(false);
  };

  useEffect(() => { load(); }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const whName = (id: string) => allWarehouses.find((w) => w.id === id)?.name || "—";
  const available = allWarehouses.filter((w) => !selected.includes(w.id));

  const add = async () => {
    if (!addPick) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("sale_warehouses").insert({ sale_id: saleId, warehouse_id: addPick });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setAddPick("");
    await load();
  };

  const remove = async (warehouseId: string) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("sale_warehouses")
      .delete()
      .eq("sale_id", saleId)
      .eq("warehouse_id", warehouseId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await load();
  };

  if (loading) return <div className="flex justify-center py-3"><Spinner /></div>;

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
        Sevkiyat Depoları
      </div>
      <p className="mb-2 text-xs text-gray-400">
        Sevkiyatçı yalnızca aşağıdaki depo(lar)dan çıkış yapabilir; listede olmayan bir depo
        seçilirse sistem reddeder. Boşsa ve gemi bağlantısı varsa yalnızca &quot;Gemiden Direkt&quot;
        sevkiyat mümkündür.
      </p>
      {selected.length === 0 ? (
        <div className="mb-2 text-sm text-amber-600">Henüz depo seçilmedi.</div>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <Badge key={id} color="blue">
              <span className="inline-flex items-center gap-1">
                {whName(id)}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    disabled={busy}
                    className="rounded-full hover:bg-blue-200"
                    title="Kaldır"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            </Badge>
          ))}
        </div>
      )}
      {canWrite && available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={addPick} onChange={(e) => setAddPick(e.target.value)} className="text-sm">
            <option value="">Depo ekle...</option>
            {available.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}{w.type === "foreign" ? " (yurtdışı)" : ""}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={add}
            disabled={!addPick || busy}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Ekle
          </button>
        </div>
      )}
      {err && <div className="mt-1.5 text-xs text-red-600">{err}</div>}
    </div>
  );
}
