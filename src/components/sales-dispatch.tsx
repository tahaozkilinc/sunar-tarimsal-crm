"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, DeadlineBadge, EmptyState, Field, Input, Select, Spinner } from "./ui";
import { MovementPhotos, type MovementPhoto } from "./movement-photos";
import { formatDate, formatNumber } from "@/lib/format";
import { baseRole } from "@/lib/nav";
import { Trash2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import type { Role } from "@/lib/types";

// Satış Operasyon: depodan veya gemiden doğrudan satılan malın FİİLİ çıkışını
// (araç araç) kaydeder. Bu ekran, alım tarafındaki gemi operasyonunun (sözleşme
// ≠ fiili boşaltma) satış tarafındaki simetriğidir: satış kaydı (sales_orders)
// TİCARİ kayıttır; buradaki her satır stock_movements'a 'outbound_sale' olarak
// yazılır ve depo stoğunu (inventory) SATIŞ ANINDA değil, araç ÇIKTIĞINDA düşer.
//
//   Depodan        -> warehouse_id dolu, contract_id BOŞ. Yalnızca Satışlar
//                      ekranında o satışa seçilen depo(lar)dan biri olabilir
//                      (sale_warehouses beyaz listesi — DB'de sert kural).
//   Gemiden Direkt -> warehouse_id BOŞ, contract_id = satışın bağlı gemisi.
//
// sales_ops rolü fiyatı hiç görmez: satışlar 'dispatch_sales' (fiyatsız)
// görünümünden okunur; admin/sales tam 'sales_orders' tablosunu kullanır.
//
// Sevkiyatı Bitir: tonaj tam eşleşmese bile operasyoncu satışı kapatabilir;
// kapatılan satışa yeni kayıt girilemez (DB kilidi) ve fark varsa hem burada
// hem Satışlar ekranındaki panelde açıkça gösterilir.

type Sale = {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  contract_id: string | null;
  product_id: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  dispatch_closed_at: string | null;
  final_sale_date: string | null;
};
type Ref = { id: string; name: string };
type Wh = { id: string; name: string };
type InvRow = { warehouse_id: string; product_id: string; available_qty: number | null };
type Movement = {
  id: string;
  sale_id: string | null;
  contract_id: string | null;
  warehouse_id: string | null;
  quantity: number | null;
  movement_date: string | null;
  movement_time: string | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export function SalesDispatch({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const base = baseRole(role);
  const isSalesOps = base === "sales_ops";
  const canWrite = ["admin", "sales", "sales_ops"].includes(base) && !role.endsWith("_view");

  const [sales, setSales] = useState<Sale[]>([]);
  const [allowedByS, setAllowedByS] = useState<Record<string, string[]>>({}); // sale_id -> izinli depo id'leri
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [companies, setCompanies] = useState<Ref[]>([]);
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [photosByMovement, setPhotosByMovement] = useState<Record<string, MovementPhoto[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  // form
  const [saleId, setSaleId] = useState("");
  const [mode, setMode] = useState<"warehouse" | "ship">("warehouse");
  const [warehouseId, setWarehouseId] = useState("");
  const [qty, setQty] = useState("");
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  // Saat alanı, kullanıcı elle değiştirmediği sürece "şimdi"yi izlemeye devam
  // eder — form açık kalsa da sabit kalmaz (bkz. ship-ops-page.tsx aynı desen).
  const timeTouchedRef = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      if (!timeTouchedRef.current) setTime(new Date().toTimeString().slice(0, 5));
    }, 15000);
    return () => clearInterval(id);
  }, []);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const loadPhotos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) { setPhotosByMovement({}); return; }
      const { data } = await supabase
        .from("movement_photos")
        .select("id,movement_id,path,label,created_at")
        .in("movement_id", ids)
        .order("created_at", { ascending: true });
      const map: Record<string, MovementPhoto[]> = {};
      ((data as MovementPhoto[] | null) || []).forEach((p) => {
        (map[p.movement_id] ||= []).push(p);
      });
      setPhotosByMovement(map);
    },
    [supabase],
  );

  const load = useCallback(async () => {
    setError(null);
    const [saleRes, whRes, prRes, coRes, invRes] = await Promise.all([
      supabase
        .from(isSalesOps ? "dispatch_sales" : "sales_orders")
        .select("id,order_no,customer_id,contract_id,product_id,quantity,unit,status,dispatch_closed_at,final_sale_date")
        .neq("status", "cancelled")
        .order("id"),
      // Sevkiyat yurtiçi depo/fabrikadan yapılır; yurtdışı depolar bu listede yer almaz.
      supabase.from("warehouses").select("id,name").eq("is_active", true).neq("type", "foreign").order("name"),
      supabase.from("products").select("id,name"),
      supabase.from("companies").select("id,name"),
      supabase.from("inventory").select("warehouse_id,product_id,available_qty"),
    ]);
    if (saleRes.error) { setError(saleRes.error.message); setLoading(false); return; }
    const saleRows = (saleRes.data as Sale[]) || [];
    setSales(saleRows);
    setWarehouses((whRes.data as Wh[]) || []);
    setProducts((prRes.data as Ref[]) || []);
    setCompanies((coRes.data as Ref[]) || []);
    setInventory((invRes.data as InvRow[]) || []);

    // Her satışın sevkiyata izinli depoları (beyaz liste — DB'de fn_sm_guard aynısını zorunlu kılar).
    if (saleRows.length > 0) {
      const { data: swData } = await supabase
        .from("sale_warehouses")
        .select("sale_id,warehouse_id")
        .in("sale_id", saleRows.map((s) => s.id));
      const am: Record<string, string[]> = {};
      ((swData as { sale_id: string; warehouse_id: string }[] | null) || []).forEach((r) => {
        (am[r.sale_id] ||= []).push(r.warehouse_id);
      });
      setAllowedByS(am);
    } else {
      setAllowedByS({});
    }

    const { data: mv, error: mvErr } = await supabase
      .from("stock_movements")
      .select("id,sale_id,contract_id,warehouse_id,quantity,movement_date,movement_time,vehicle_plate,driver_name,notes,created_at,created_by")
      .eq("movement_type", "outbound_sale")
      .order("created_at", { ascending: false });
    if (mvErr) setError(mvErr.message);
    const rows = (mv as Movement[]) || [];
    setMovements(rows);
    await loadPhotos(rows.map((r) => r.id));
    setLoading(false);
  }, [supabase, isSalesOps, loadPhotos]);

  useEffect(() => { load(); }, [load]);

  const pName = (id: string | null) => products.find((x) => x.id === id)?.name || "—";
  const cName = (id: string | null) => (id && companies.find((x) => x.id === id)?.name) || "Müşteri belirtilmemiş";
  const whName = (id: string | null) => (id && warehouses.find((x) => x.id === id)?.name) || "—";
  const saleOf = (id: string | null) => sales.find((s) => s.id === id);

  // Satış başına şimdiye kadar sevk edilen toplam
  const dispatchedBySale = useMemo(() => {
    const m = new Map<string, number>();
    movements.forEach((mv) => {
      if (!mv.sale_id) return;
      m.set(mv.sale_id, (m.get(mv.sale_id) || 0) + (Number(mv.quantity) || 0));
    });
    return m;
  }, [movements]);

  const availableAt = (whId: string, productId: string | null) =>
    Number(inventory.find((r) => r.warehouse_id === whId && r.product_id === productId)?.available_qty) || 0;

  const selectedSale = saleOf(saleId);
  const selectedAllowed = saleId ? allowedByS[saleId] || [] : [];
  const dispatched = saleId ? dispatchedBySale.get(saleId) || 0 : 0;
  const remaining = selectedSale ? (Number(selectedSale.quantity) || 0) - dispatched : 0;

  const addDispatch = async () => {
    if (!saleId) { setFormErr("Satış seçin."); return; }
    const sale = saleOf(saleId);
    if (!sale) { setFormErr("Satış bulunamadı."); return; }
    if (mode === "warehouse" && !warehouseId) { setFormErr("Depo seçin."); return; }
    if (mode === "ship" && !sale.contract_id) { setFormErr("Bu satışın bağlı olduğu gemi yok; gemiden direkt seçilemez."); return; }
    const q = parseFloat(qty.replace(",", "."));
    if (!qty || isNaN(q) || q <= 0) { setFormErr("Geçerli bir miktar girin."); return; }
    if (mode === "warehouse") {
      const avail = availableAt(warehouseId, sale.product_id);
      if (q > avail + 0.0001) {
        setFormErr(`Bu depoda yalnızca ${formatNumber(avail)} ton mevcut; ${formatNumber(q)} ton çıkarılamaz.`);
        return;
      }
    }
    setSaving(true);
    setFormErr(null);
    const { error: err } = await supabase.from("stock_movements").insert({
      sale_id: saleId,
      contract_id: mode === "ship" ? sale.contract_id : null,
      warehouse_id: mode === "warehouse" ? warehouseId : null,
      product_id: sale.product_id,
      movement_type: "outbound_sale",
      quantity: q,
      unit: sale.unit || "ton",
      vehicle_plate: plate.trim() || null,
      driver_name: driver.trim() || null,
      movement_date: date,
      movement_time: time || null,
    });
    setSaving(false);
    if (err) { setFormErr(err.message); return; }
    setFlash(`${formatNumber(q)} ton çıkış kaydedildi`);
    setQty(""); setPlate(""); setDriver("");
    timeTouchedRef.current = false;
    setTime(new Date().toTimeString().slice(0, 5));
    await load();
    setTimeout(() => setFlash(null), 2000);
  };

  const deleteMovement = async (id: string) => {
    if (!window.confirm("Bu çıkış kaydı silinsin mi?")) return;
    const { error: err } = await supabase.from("stock_movements").delete().eq("id", id);
    if (err) { window.alert("Silinemedi: " + err.message); return; }
    await load();
  };

  const closeDispatch = async (s: Sale) => {
    const disp = dispatchedBySale.get(s.id) || 0;
    const diff = Math.round(((Number(s.quantity) || 0) - disp) * 1000) / 1000;
    const msg =
      diff === 0
        ? `${formatNumber(disp)} ton tam sevk edildi. Sevkiyatı kapatmak istiyor musunuz? Kapatıldıktan sonra yeni kayıt eklenemez.`
        : diff > 0
          ? `${formatNumber(disp)} / ${formatNumber(s.quantity)} ton sevk edildi — ${formatNumber(diff)} ton EKSİK kalacak. Yine de sevkiyatı kapatmak istiyor musunuz?`
          : `${formatNumber(disp)} / ${formatNumber(s.quantity)} ton sevk edildi — ${formatNumber(-diff)} ton FAZLA. Yine de sevkiyatı kapatmak istiyor musunuz?`;
    if (!window.confirm(msg)) return;
    setClosingId(s.id);
    const { error: err } = await supabase.rpc("close_sale_dispatch", { p_sale_id: s.id });
    setClosingId(null);
    if (err) { window.alert("Kapatılamadı: " + err.message); return; }
    if (saleId === s.id) setSaleId("");
    await load();
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );

  const openSales = sales.filter((s) => !s.dispatch_closed_at);
  const closedSales = sales.filter((s) => s.dispatch_closed_at);
  // Forma yalnızca AÇIK satışlar + sevk edilecek bir şeyi kalan satışlar girilebilir.
  const dispatchableSales = openSales;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Sol: satış bazlı sevkiyat durumu */}
        <div className="order-2 space-y-3 lg:order-1">
          {openSales.length === 0 ? (
            <EmptyState message="Sevkiyat bekleyen satış yok." />
          ) : (
            openSales.map((s) => {
              const disp = dispatchedBySale.get(s.id) || 0;
              const rem = (Number(s.quantity) || 0) - disp;
              const rows = movements.filter((m) => m.sale_id === s.id);
              const isOpen = expanded.has(s.id);
              const allowedCount = (allowedByS[s.id] || []).length;
              return (
                <Card key={s.id} className="p-4">
                  <button
                    onClick={() => toggle(s.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                  >
                    <div>
                      <span className="font-semibold">{cName(s.customer_id)}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {s.order_no || "—"} · {pName(s.product_id)}
                      </span>
                      {!isSalesOps && allowedCount === 0 && (
                        <Badge color="yellow">Depo atanmamış</Badge>
                      )}
                      <div className="mt-1">
                        <DeadlineBadge date={s.final_sale_date} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">
                        Sevk: <b className="text-gray-900">{formatNumber(disp)}</b> / {formatNumber(s.quantity)} ton
                      </span>
                      <span className={`font-semibold ${rem < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        Kalan: {formatNumber(rem)} t
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>
                  {/* İlerleme çubuğu */}
                  {(Number(s.quantity) || 0) > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (disp / (Number(s.quantity) || 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {rows.length === 0 ? (
                        <div className="text-xs text-gray-400">Henüz çıkış kaydı yok.</div>
                      ) : (
                        rows.map((m) => (
                          <div key={m.id} className="rounded-lg border border-border p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <div className="min-w-0">
                                <span className="font-medium">{formatNumber(m.quantity)} ton</span>
                                <span className="ml-2 text-xs text-gray-500">
                                  {formatDate(m.movement_date)}
                                  {m.movement_time ? ` ${m.movement_time.slice(0, 5)}` : ""}
                                  {m.vehicle_plate ? ` · ${m.vehicle_plate}` : ""}
                                  {m.driver_name ? ` · ${m.driver_name}` : ""}
                                  {" · "}
                                  {m.warehouse_id ? whName(m.warehouse_id) : "Gemiden direkt"}
                                </span>
                              </div>
                              {canWrite && (
                                <button
                                  onClick={() => deleteMovement(m.id)}
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  title="Sil"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="mt-1.5">
                              <MovementPhotos
                                movementId={m.id}
                                photos={photosByMovement[m.id]}
                                canWrite={canWrite}
                                onChanged={load}
                              />
                            </div>
                          </div>
                        ))
                      )}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => closeDispatch(s)}
                          disabled={closingId === s.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {closingId === s.id ? "Kapatılıyor..." : "Sevkiyatı Bitir"}
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* Kapatılan sevkiyatlar: salt-okunur, fark varsa belirgin uyarı */}
          {closedSales.length > 0 && (
            <Card className="p-4">
              <button
                onClick={() => setShowClosed((o) => !o)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-semibold">Kapatılan Sevkiyatlar ({closedSales.length})</span>
                <span className="text-xs text-brand">{showClosed ? "Gizle" : "Göster"}</span>
              </button>
              {showClosed && (
                <div className="mt-3 space-y-2">
                  {closedSales.map((s) => {
                    const disp = dispatchedBySale.get(s.id) || 0;
                    const diff = Math.round(((Number(s.quantity) || 0) - disp) * 1000) / 1000;
                    const mismatch = Math.abs(diff) > 0.001;
                    return (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{cName(s.customer_id)}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {pName(s.product_id)} · {formatNumber(disp)} / {formatNumber(s.quantity)} ton
                          </span>
                        </div>
                        {mismatch ? (
                          <Badge color="red">
                            ⚠ {diff > 0 ? `${formatNumber(diff)} ton eksik` : `${formatNumber(-diff)} ton fazla`}
                          </Badge>
                        ) : (
                          <Badge color="green">✓ Tam sevk edildi</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sağ: hızlı çıkış formu */}
        <div className="order-1 lg:order-2">
          {canWrite ? (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">Araç Çıkışı</div>
              <Field label="Satış" required>
                <Select value={saleId} onChange={(e) => { setSaleId(e.target.value); setWarehouseId(""); }}>
                  <option value="">Seçiniz...</option>
                  {dispatchableSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {cName(s.customer_id)} · {pName(s.product_id)} ({s.order_no || "no"})
                    </option>
                  ))}
                </Select>
                {dispatchableSales.length === 0 && (
                  <div className="mt-1 text-xs text-amber-600">Sevkiyata açık satış yok.</div>
                )}
              </Field>

              {selectedSale && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Bağlı: {formatNumber(selectedSale.quantity)} t · Sevk edilen: {formatNumber(dispatched)} t ·{" "}
                  <span className={remaining < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                    Kalan: {formatNumber(remaining)} t
                  </span>
                </div>
              )}

              <Field label="Çıkış Yeri" required>
                <div className="inline-flex w-full overflow-hidden rounded-lg border border-border text-sm">
                  <button
                    type="button"
                    disabled={!!selectedSale && selectedAllowed.length === 0}
                    onClick={() => setMode("warehouse")}
                    className={`flex-1 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === "warehouse" ? "bg-brand text-white" : "bg-white text-gray-600"}`}
                  >
                    Depodan
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSale?.contract_id}
                    onClick={() => setMode("ship")}
                    className={`flex-1 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === "ship" ? "bg-brand text-white" : "bg-white text-gray-600"}`}
                  >
                    Gemiden Direkt
                  </button>
                </div>
                {selectedSale && selectedAllowed.length === 0 && mode === "warehouse" && (
                  <div className="mt-1 text-xs text-amber-600">
                    Bu satış için henüz depo seçilmemiş (Satışlar ekranından eklenir) — şimdilik yalnızca
                    &quot;Gemiden Direkt&quot; kullanılabilir.
                  </div>
                )}
              </Field>

              {mode === "warehouse" && (
                <Field label="Depo (yalnızca bu satış için seçilenler)" required>
                  <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    <option value="">Seçiniz...</option>
                    {warehouses
                      .filter((w) => selectedAllowed.includes(w.id))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {selectedSale ? ` — mevcut ${formatNumber(availableAt(w.id, selectedSale.product_id))} t` : ""}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}

              <Field label="Miktar (ton)" required>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="örn. 25"
                  onKeyDown={(e) => { if (e.key === "Enter") addDispatch(); }}
                />
              </Field>
              <Field label="Araç Plakası">
                <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Opsiyonel" />
              </Field>
              <Field label="Şoför">
                <Input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Opsiyonel" />
              </Field>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Tarih">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                </div>
                <div className="w-28 shrink-0">
                  <Field label="Saat">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => { timeTouchedRef.current = true; setTime(e.target.value); }}
                    />
                  </Field>
                </div>
              </div>

              {formErr && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formErr}
                </div>
              )}
              {flash && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  ✓ {flash}
                </div>
              )}
              <Button onClick={addDispatch} disabled={saving} className="w-full">
                {saving ? "Kaydediliyor..." : "Kaydet ↵"}
              </Button>
            </Card>
          ) : (
            <Card className="p-4 text-sm text-gray-500">
              Bu ekran salt-okunur; araç çıkışı admin, satış ve satış operasyon rollerine açıktır.
            </Card>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Depo stoğu, satış kaydı oluşturulduğu an değil araç fiilen çıktığında düşer. &quot;Depodan&quot;
        yalnızca Satışlar ekranında o satış için seçilen depo(lar)da çalışır ve mevcut stok aşılamaz;
        &quot;Gemiden Direkt&quot; satışın bağlı gemisi iptal/tamamlanmış değilse kullanılabilir.
        &quot;Sevkiyatı Bitir&quot; dediğinizde tonaj tam eşleşmese bile satış kapanır; fark varsa hem burada
        hem Satışlar ekranındaki sevkiyat panelinde işaretlenir.
      </p>
    </div>
  );
}
