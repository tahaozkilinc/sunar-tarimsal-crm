"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, Select } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { translateDbError } from "@/lib/db-errors";
import {
  attributeByWarehouse,
  buildLedger,
  UNASSIGNED_KEY,
  type AttributionMovement,
  type LedgerMovement,
} from "@/lib/stock-attribution";
import { MOVEMENT_TYPE_OPTIONS, STOCK_STATUS_OPTIONS } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

// Depo Detayı sayfasının (warehouse-detail-view.tsx) "Stok Özeti" ve "Hareket
// Geçmişi" sekmelerine karşılık gelir — Stok'ta (InventoryView) ve CRM'de
// ("Depolar" modülü) AYNI bileşen kullanılır, tek veri kaynağı, ikisi
// birbirinden kopuk değil. Depo fotoğrafları/yetkilileri ve alt depolar
// (kendi başına, bu ortak movements verisine ihtiyaç duymayan bölümler)
// warehouse-detail-view.tsx'te doğrudan render edilir, burada değil.
//
// section="stock":
//   1) "Hangi Gemiden Geldi" kırılımı — depoya giren malın hangi bağlantı
//      (gemi/parti) hangi oranda kaynaklık ettiği (bkz. attributeByWarehouse:
//      çıkış hareketleri belirli bir gemiye ait değildir, giren payına
//      ORANTILI düşülür — kesin değil, tahminidir).
//   2) "Tedarikçi Bazlı Dağılım" — AYNI teknik, gemi yerine sözleşmenin
//      tedarikçi firmasına göre ("depo bazlı kiminle ne kadar çalıştık").
//   3) "Milli / Yerli" kırılımı — AYNI teknik, stock_status'e göre.
// section="ledger":
//   Giriş / Çıkış Geçmişi — HER hareketi kendi tarihiyle, ürün bazında koşan
//   bakiyeyle listeler (buildLedger; tahmini değil, gerçek veri). Bu bilgi
//   operasyondan (gemi boşaltma / sevkiyat) OTOMATİK gelir — elle ayrıca bir
//   şey girilmez.

type Movement = AttributionMovement &
  LedgerMovement & { contract_id: string | null; stock_status: string | null; sale_id: string | null };
type ContractRef = { id: string; vessel: string | null; contract_no: string | null; supplier_id: string | null };
type ProductRef = { id: string; name: string };
type SaleRef = { id: string; order_no: string | null };
type CompanyRef = { id: string; name: string };

export function WarehouseDetailExtra({
  warehouseId,
  role,
  section,
}: {
  warehouseId: string;
  role: Role;
  section: "stock" | "ledger";
}) {
  const supabase = useMemo(() => createClient(), []);
  const canWrite = ["admin", "operations"].includes(baseRole(role));

  const [movements, setMovements] = useState<Movement[]>([]);
  const [contracts, setContracts] = useState<ContractRef[]>([]);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [sales, setSales] = useState<SaleRef[]>([]);
  const [suppliers, setSuppliers] = useState<CompanyRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const [{ data }, { data: pData }] = await Promise.all([
        supabase
          .from("stock_movements")
          .select("id,warehouse_id,product_id,movement_type,quantity,contract_id,stock_status,movement_date,movement_time,created_at,sale_id")
          .eq("warehouse_id", warehouseId),
        supabase.from("products").select("id,name"),
      ]);
      if (!on) return;
      const rows = (data as Movement[] | null) || [];
      setMovements(rows);
      setProducts((pData as ProductRef[] | null) || []);

      const contractIds = Array.from(new Set(rows.map((r) => r.contract_id).filter(Boolean))) as string[];
      const saleIds = Array.from(new Set(rows.map((r) => r.sale_id).filter(Boolean))) as string[];
      const [cRes, sRes] = await Promise.all([
        contractIds.length > 0
          ? supabase.from("purchase_contracts").select("id,vessel,contract_no,supplier_id").in("id", contractIds)
          : Promise.resolve({ data: [] as ContractRef[] }),
        saleIds.length > 0
          ? supabase.from("sales_orders").select("id,order_no").in("id", saleIds)
          : Promise.resolve({ data: [] as SaleRef[] }),
      ]);
      if (!on) return;
      const contractRows = (cRes.data as ContractRef[] | null) || [];
      setContracts(contractRows);
      setSales((sRes.data as SaleRef[] | null) || []);

      const supplierIds = Array.from(new Set(contractRows.map((c) => c.supplier_id).filter(Boolean))) as string[];
      const { data: coData } = supplierIds.length > 0
        ? await supabase.from("companies").select("id,name").in("id", supplierIds)
        : { data: [] as CompanyRef[] };
      if (!on) return;
      setSuppliers((coData as CompanyRef[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, warehouseId]);

  const updateStockStatus = async (movementId: string, status: string) => {
    // .select() ile geri okunuyor: RLS (can_access_ship) satırı sessizce
    // reddedebilir (0 satır günceller, hata DÖNMEZ) — ör. operasyon kullanıcısı
    // kendisine atanmamış başka bir gemiye ait hareketi düzeltmeye çalışırsa.
    // data null ise güncelleme aslında UYGULANMAMIŞTIR; iyimser UI güncellemesi
    // YANLIŞ bilgi göstermesin diye burada ayırt edilir.
    const { data, error } = await supabase
      .from("stock_movements")
      .update({ stock_status: status || null })
      .eq("id", movementId)
      .select("id")
      .maybeSingle();
    if (error) { window.alert("Güncellenemedi: " + translateDbError(error)); return; }
    if (!data) { window.alert("Bu hareketi güncelleme yetkiniz yok (başka bir gemiye atanmış olabilir)."); return; }
    setMovements((prev) => prev.map((m) => (m.id === movementId ? { ...m, stock_status: status || null } : m)));
  };

  const contractLabel = (id: string) =>
    contracts.find((c) => c.id === id)?.vessel || contracts.find((c) => c.id === id)?.contract_no || "—";
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";
  const productName = (id: string | null) => (id && products.find((p) => p.id === id)?.name) || "—";
  const saleLabel = (id: string | null) => (id && sales.find((s) => s.id === id)?.order_no) || null;
  const movementLabel = (t: string) => MOVEMENT_TYPE_OPTIONS.find((o) => o.value === t)?.label || t;

  const byShip = useMemo(() => {
    const map = attributeByWarehouse(movements, (r) => r.contract_id).get(warehouseId) || new Map();
    return Array.from(map.entries())
      .map(([key, ton]) => ({ key, name: key === UNASSIGNED_KEY ? "Kaynağı belirsiz" : contractLabel(key), ton }))
      .sort((a, b) => b.ton - a.ton);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouseId, contracts]);

  // "Depo bazlı kiminle ne kadar çalıştık" — gemi yerine sözleşmenin tedarikçi
  // firmasına göre AYNI orantılı kırılım (attributeByWarehouse).
  const bySupplier = useMemo(() => {
    const supplierOf = (r: Movement) =>
      (r.contract_id && contracts.find((c) => c.id === r.contract_id)?.supplier_id) || null;
    const map = attributeByWarehouse(movements, supplierOf).get(warehouseId) || new Map();
    return Array.from(map.entries())
      .map(([key, ton]) => ({ key, name: key === UNASSIGNED_KEY ? "Kaynağı belirsiz" : supplierName(key), ton }))
      .sort((a, b) => b.ton - a.ton);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouseId, contracts, suppliers]);

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

  // Yeniden eskiye (en son hareket üstte) — koşan bakiye eski->yeni
  // hesaplanıp sonra ters çevrilir, sayılar yine doğru kalır.
  const ledger = useMemo(() => [...buildLedger(movements)].reverse(), [movements]);

  return (
    <div className="space-y-4">
      {section === "stock" && (
        <>
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
        <div className="mb-1 text-sm font-medium">Tedarikçi Bazlı Dağılım (depo bazlı kiminle ne kadar çalıştık)</div>
        <p className="mb-2 text-xs text-gray-400">
          Yukarıdaki gemi kırılımıyla aynı orantılı yönteme göre, hangi tedarikçi firmadan gelen malın
          bu depoda ne kadarının hâlâ durduğu.
        </p>
        {loading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : bySupplier.length === 0 ? (
          <div className="text-xs text-gray-400">Bu depoda kayıtlı giriş yok.</div>
        ) : (
          <div className="space-y-1.5">
            {bySupplier.map((r) =>
              r.key === UNASSIGNED_KEY ? (
                <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-sm">
                  <span className="truncate text-gray-500">{r.name}</span>
                  <span className="shrink-0 font-semibold">{formatNumber(r.ton)} ton</span>
                </div>
              ) : (
                <Link
                  key={r.key}
                  href={`/crm/${r.key}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <span className="truncate text-brand hover:underline">{r.name}</span>
                  <span className="shrink-0 font-semibold">{formatNumber(r.ton)} ton</span>
                </Link>
              ),
            )}
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
                  <Badge color={r.key === "MİLLİ" ? "blue" : r.key === "ANTREPO" ? "purple" : "gray"}>
                    {r.name}
                  </Badge>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className={`h-full rounded ${r.key === "MİLLİ" ? "bg-blue-500" : r.key === "ANTREPO" ? "bg-purple-500" : "bg-gray-400"}`}
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
        </>
      )}

      {section === "ledger" && (
      <div>
        <div className="mb-1 text-sm font-medium">Giriş / Çıkış Geçmişi</div>
        <p className="mb-2 text-xs text-gray-400">
          Operasyon ve sevkiyat kayıtlarından otomatik — her giriş hangi gemiden geldiğini, her çıkış
          nereye gittiğini gösterir. Kalan, o hareketten SONRAKİ ürün bakiyesidir.
          {canWrite && " Giriş satırlarındaki Milli/Yerli durumunu buradan düzeltebilirsiniz."}
        </p>
        {loading ? (
          <div className="text-xs text-gray-400">Yükleniyor...</div>
        ) : ledger.length === 0 ? (
          <div className="text-xs text-gray-400">Bu depoda kayıtlı hareket yok.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Tarih</th>
                  <th className="px-3 py-2 font-medium">Yön</th>
                  <th className="px-3 py-2 font-medium">Ürün</th>
                  <th className="px-3 py-2 font-medium">Milli / Yerli</th>
                  <th className="px-3 py-2 font-medium">Kaynak / Hedef</th>
                  <th className="px-3 py-2 text-right font-medium">Miktar</th>
                  <th className="px-3 py-2 text-right font-medium">Kalan</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => {
                  const saleNo = r.movement_type === "outbound_sale" ? saleLabel(r.sale_id) : null;
                  const source =
                    r.direction === "in"
                      ? (r.contract_id && contractLabel(r.contract_id)) || "—"
                      : r.movement_type === "outbound_sale"
                        ? saleNo
                          ? `Satış: ${saleNo}`
                          : "Satış"
                        : movementLabel(r.movement_type);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(r.movement_date)}
                        {r.movement_time ? ` ${r.movement_time}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <Badge color={r.direction === "in" ? "green" : "red"}>
                          {r.direction === "in" ? "Giriş" : "Çıkış"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{productName(r.product_id)}</td>
                      <td className="px-3 py-2">
                        {r.direction !== "in" ? (
                          <span className="text-gray-400">—</span>
                        ) : canWrite ? (
                          <Select
                            value={r.stock_status || ""}
                            onChange={(e) => updateStockStatus(r.id, e.target.value)}
                          >
                            <option value="">Belirtilmemiş</option>
                            {STOCK_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </Select>
                        ) : r.stock_status ? (
                          <Badge color={r.stock_status === "MİLLİ" ? "blue" : r.stock_status === "ANTREPO" ? "purple" : "gray"}>
                            {r.stock_status}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 truncate">{source}</td>
                      <td className={`px-3 py-2 text-right font-medium ${r.direction === "in" ? "text-emerald-700" : "text-red-600"}`}>
                        {r.direction === "in" ? "+" : ""}
                        {formatNumber(r.signedQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.runningBalance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
