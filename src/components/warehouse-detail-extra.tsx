"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card } from "./ui";
import { PhotoGallery } from "./photo-gallery";
import { formatNumber } from "@/lib/format";
import { attributeByWarehouse, UNASSIGNED_KEY, type AttributionMovement } from "@/lib/stock-attribution";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

// Depo Detayı görünümüne (ResourceManager detailExtra) enjekte edilir:
//   1) Depo fotoğrafları (PhotoGallery, warehouse_photos)
//   2) "Hangi Gemiden Geldi" kırılımı — depoya giren malın hangi bağlantı
//      (gemi/parti) hangi oranda kaynaklık ettiği (bkz. attributeByWarehouse:
//      çıkış hareketleri belirli bir gemiye ait değildir, giren payına
//      ORANTILI düşülür — kesin değil, tahminidir).
//   3) "Milli / Yerli" kırılımı — AYNI teknik, stock_status'e göre.

type Movement = AttributionMovement & { contract_id: string | null; stock_status: string | null };
type ContractRef = { id: string; vessel: string | null; contract_no: string | null };

export function WarehouseDetailExtra({ warehouseId, role }: { warehouseId: string; role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canWrite = ["admin", "operations"].includes(baseRole(role));

  const [movements, setMovements] = useState<Movement[]>([]);
  const [contracts, setContracts] = useState<ContractRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("warehouse_id,movement_type,quantity,contract_id,stock_status")
        .eq("warehouse_id", warehouseId);
      if (!on) return;
      const rows = (data as Movement[] | null) || [];
      setMovements(rows);
      const contractIds = Array.from(new Set(rows.map((r) => r.contract_id).filter(Boolean))) as string[];
      if (contractIds.length > 0) {
        const { data: cData } = await supabase
          .from("purchase_contracts")
          .select("id,vessel,contract_no")
          .in("id", contractIds);
        if (on) setContracts((cData as ContractRef[] | null) || []);
      } else {
        setContracts([]);
      }
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, warehouseId]);

  const contractLabel = (id: string) =>
    contracts.find((c) => c.id === id)?.vessel || contracts.find((c) => c.id === id)?.contract_no || "—";

  const byShip = useMemo(() => {
    const map = attributeByWarehouse(movements, (r) => r.contract_id).get(warehouseId) || new Map();
    return Array.from(map.entries())
      .map(([key, ton]) => ({ key, name: key === UNASSIGNED_KEY ? "Kaynağı belirsiz" : contractLabel(key), ton }))
      .sort((a, b) => b.ton - a.ton);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouseId, contracts]);

  const byStatus = useMemo(() => {
    const map = attributeByWarehouse(movements, (r) => r.stock_status).get(warehouseId) || new Map();
    return Array.from(map.entries())
      .map(([key, ton]) => ({
        key,
        name: key === UNASSIGNED_KEY ? "Sınıflandırılmamış" : key,
        ton,
      }))
      .sort((a, b) => b.ton - a.ton);
  }, [movements, warehouseId]);

  const totalStatus = byStatus.reduce((a, r) => a + r.ton, 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-medium">Depo Fotoğrafları</div>
        <PhotoGallery
          bucket="warehouse-photos"
          table="warehouse_photos"
          fkColumn="warehouse_id"
          fkValue={warehouseId}
          canWrite={canWrite}
          labels={["Depo", "Belge"]}
          emptyText="Bu depoya ait görsel / dosya yok."
        />
      </div>

      <div>
        <div className="mb-1 text-sm font-medium">Hangi Gemiden Geldi (mevcut stok, tahmini)</div>
        <p className="mb-2 text-xs text-gray-400">
          Aynı depoda birden fazla geminin malı aynı anda bulunabilir. Çıkış hareketleri belirli bir gemiye
          ait değildir — bu yüzden kırılım, o depoya giren tonaj payına orantılı hesaplanır.
        </p>
        {loading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : byShip.length === 0 ? (
          <div className="text-xs text-gray-400">Bu depoda kayıtlı giriş yok.</div>
        ) : (
          <div className="space-y-1.5">
            {byShip.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-sm">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 font-semibold">{formatNumber(r.ton)} ton</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-medium">Milli / Yerli Kırılımı (mevcut stok, tahmini)</div>
        {loading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : byStatus.length === 0 ? (
          <div className="text-xs text-gray-400">Bu depoda kayıtlı giriş yok.</div>
        ) : (
          <Card className="p-3">
            <div className="space-y-2">
              {byStatus.map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <Badge color={r.key === "MİLLİ" ? "blue" : r.key === "YERLİ" ? "green" : "gray"}>
                    {r.name}
                  </Badge>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className={`h-full rounded ${r.key === "MİLLİ" ? "bg-blue-500" : r.key === "YERLİ" ? "bg-emerald-500" : "bg-gray-400"}`}
                      style={{ width: `${totalStatus > 0 ? (r.ton / totalStatus) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold">{formatNumber(r.ton)} ton</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
