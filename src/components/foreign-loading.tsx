"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { Trash2 } from "lucide-react";
import type { Role } from "@/lib/types";

// Yurtdışı yükleme operasyonu: farklı bağlantıların malı menşe ülkedeki
// yurtdışı depoda (warehouses.type='foreign') stoklanır, sonra gemiye yüklenir.
//   Depoya Giriş   -> stock_movements 'origin_in' (+)
//     ('inbound' DEĞİL: inbound tüm ekranlarda "Türkiye'ye geldi" demektir;
//      yurtdışı girişler gemi operasyonu/Çekilen/panel sayımına karışmamalı)
//   Gemiye Yükleme -> stock_movements 'transfer'  (−)
// Türkiye'deki boşaltma mevcut gemi operasyonudur (bu ekrana dahil değil).
// Acente rolü yalnızca agent_id'si kendi firması olan bağlantıları görür (RLS).

type Wh = { id: string; name: string; city: string | null; country: string | null };
type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  eta: string | null;
};
type Ref = { id: string; name: string };
type Movement = {
  id: string;
  contract_id: string | null;
  warehouse_id: string | null;
  movement_type: string;
  quantity: number | null;
  movement_date: string | null;
  vehicle_plate: string | null;
  created_at: string;
};

export function ForeignLoading({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  // Ham rol kontrolü: _view rolleri otomatik dışarıda kalır (salt-okunur).
  const canWrite = ["admin", "operations", "acente"].includes(role);
  const isAcente = role === "acente";

  const [whs, setWhs] = useState<Wh[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [whId, setWhId] = useState("");
  const [contractId, setContractId] = useState("");
  const [dir, setDir] = useState<"in" | "load">("in");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [plate, setPlate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [w, c, p] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id,name,city,country")
        .eq("type", "foreign")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("purchase_contracts")
        .select("id,contract_no,vessel,product_id,quantity,unit,status,eta")
        .not("status", "in", "(cancelled,completed)")
        .order("eta", { ascending: true }),
      supabase.from("products").select("id,name"),
    ]);
    if (w.error) { setError(w.error.message); setLoading(false); return; }
    const whList = (w.data as Wh[]) || [];
    setWhs(whList);
    setContracts((c.data as Contract[]) || []);
    setProducts((p.data as Ref[]) || []);
    if (whList.length > 0) {
      const { data: mv, error: mvErr } = await supabase
        .from("stock_movements")
        .select("id,contract_id,warehouse_id,movement_type,quantity,movement_date,vehicle_plate,created_at")
        .in("warehouse_id", whList.map((x) => x.id))
        .in("movement_type", ["origin_in", "transfer"])
        .order("created_at", { ascending: false });
      if (mvErr) setError(mvErr.message);
      setMovements((mv as Movement[]) || []);
    } else {
      setMovements([]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const pName = (id: string | null) => products.find((x) => x.id === id)?.name || "—";
  const cLabel = (c: Contract) => c.vessel || c.contract_no || "—";
  const contractOf = (id: string | null) => contracts.find((x) => x.id === id);

  // Depo × bağlantı bazında birikim: giren (origin_in) − yüklenen (transfer)
  const stockByWhContract = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    movements.forEach((m) => {
      if (!m.warehouse_id || !m.contract_id) return;
      const key = `${m.warehouse_id}|${m.contract_id}`;
      const e = map.get(key) || { in: 0, out: 0 };
      const q = Number(m.quantity) || 0;
      if (m.movement_type === "origin_in") e.in += q;
      else e.out += q;
      map.set(key, e);
    });
    return map;
  }, [movements]);

  const whRows = useMemo(() => {
    return whs.map((w) => {
      const rows: { contract: Contract; in: number; out: number; net: number }[] = [];
      stockByWhContract.forEach((v, key) => {
        const [wid, cid] = key.split("|");
        if (wid !== w.id) return;
        const contract = contractOf(cid);
        if (!contract) return; // RLS gereği görünmeyen bağlantı (başka acente)
        rows.push({ contract, in: v.in, out: v.out, net: v.in - v.out });
      });
      rows.sort((a, b) => b.net - a.net);
      const totals = rows.reduce(
        (a, r) => ({ in: a.in + r.in, out: a.out + r.out, net: a.net + r.net }),
        { in: 0, out: 0, net: 0 },
      );
      return { wh: w, rows, totals };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whs, stockByWhContract, contracts]);

  const addMovement = async () => {
    if (!whId) { setFormErr("Yurtdışı depo seçin."); return; }
    if (!contractId) { setFormErr("Bağlantı seçin."); return; }
    const q = parseFloat(qty.replace(",", "."));
    if (!qty || isNaN(q) || q <= 0) { setFormErr("Geçerli bir miktar girin."); return; }
    const contract = contractOf(contractId);
    if (!contract) { setFormErr("Bağlantı bulunamadı."); return; }
    if (dir === "load") {
      const cur = stockByWhContract.get(`${whId}|${contractId}`);
      const net = (cur?.in || 0) - (cur?.out || 0);
      if (q > net + 0.0001) {
        setFormErr(`Bu depoda bu bağlantıdan yalnızca ${formatNumber(net)} ton var; ${formatNumber(q)} ton yüklenemez.`);
        return;
      }
    }
    setSaving(true);
    setFormErr(null);
    const { error: err } = await supabase.from("stock_movements").insert({
      contract_id: contractId,
      product_id: contract.product_id,
      warehouse_id: whId,
      movement_type: dir === "in" ? "origin_in" : "transfer",
      quantity: q,
      unit: contract.unit || "ton",
      vehicle_plate: plate.trim() || null,
      movement_date: date,
    });
    setSaving(false);
    if (err) { setFormErr(err.message); return; }
    setFlash(`${formatNumber(q)} ton ${dir === "in" ? "depoya girildi" : "gemiye yüklendi"}`);
    setQty(""); setPlate("");
    await load();
    setTimeout(() => setFlash(null), 2000);
  };

  const deleteMovement = async (id: string) => {
    if (!window.confirm("Bu hareket silinsin mi?")) return;
    await supabase.from("stock_movements").delete().eq("id", id);
    await load();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );

  if (whs.length === 0) {
    return (
      <EmptyState
        message={
          isAcente
            ? "Henüz yurtdışı depo tanımlanmamış. Lütfen Sunar yetkilinize başvurun."
            : "Yurtdışı depo yok. Stok → Depolar / Fabrikalar'dan tür olarak 'Yurtdışı Depo' seçerek ekleyin."
        }
      />
    );
  }

  const recent = movements.slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Sol: depo bazlı birikim tabloları */}
        <div className="order-2 space-y-4 lg:order-1">
          {whRows.map(({ wh, rows, totals }) => (
            <Card key={wh.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{wh.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {[wh.city, wh.country].filter(Boolean).join(", ")}
                  </span>
                </div>
                <div className="text-sm">
                  Depoda: <b>{formatNumber(totals.net)} ton</b>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="rounded-lg border border-border px-3 py-2 text-sm text-gray-500">
                  Bu depoda henüz hareket yok.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
                        <th className="py-2 pr-3 font-medium">Bağlantı</th>
                        <th className="py-2 pr-3 font-medium">Ürün</th>
                        <th className="py-2 pr-3 text-right font-medium">Depoya Giren</th>
                        <th className="py-2 pr-3 text-right font-medium">Gemiye Yüklenen</th>
                        <th className="py-2 text-right font-medium">Depoda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.contract.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-medium">{cLabel(r.contract)}</td>
                          <td className="py-2 pr-3 text-gray-600">{pName(r.contract.product_id)}</td>
                          <td className="py-2 pr-3 text-right">{formatNumber(r.in)}</td>
                          <td className="py-2 pr-3 text-right text-gray-600">{formatNumber(r.out)}</td>
                          <td className={`py-2 text-right font-semibold ${r.net < 0 ? "text-red-600" : ""}`}>
                            {formatNumber(r.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border text-sm font-semibold">
                        <td className="py-2 pr-3" colSpan={2}>TOPLAM</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(totals.in)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(totals.out)}</td>
                        <td className="py-2 text-right">{formatNumber(totals.net)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          ))}

          {/* Son hareketler */}
          {recent.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold">Son Hareketler</div>
              <div className="divide-y divide-border">
                {recent.map((m) => {
                  const c = contractOf(m.contract_id);
                  const isIn = m.movement_type === "origin_in";
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge color={isIn ? "green" : "blue"}>
                            {isIn ? "Depoya Giriş" : "Gemiye Yükleme"}
                          </Badge>
                          <span className="truncate font-medium">{c ? cLabel(c) : "—"}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {formatDate(m.movement_date)}
                          {m.vehicle_plate ? ` · ${m.vehicle_plate}` : ""}
                          {" · "}
                          {whs.find((w) => w.id === m.warehouse_id)?.name || "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold">{formatNumber(m.quantity)} ton</span>
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
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Sağ: hızlı giriş formu */}
        <div className="order-1 lg:order-2">
          {canWrite ? (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">Hareket Girişi</div>
              <Field label="Yurtdışı Depo" required>
                <Select value={whId} onChange={(e) => setWhId(e.target.value)}>
                  <option value="">Seçiniz...</option>
                  {whs.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.country ? ` (${w.country})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bağlantı" required>
                <Select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                  <option value="">Seçiniz...</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cLabel(c)} · {pName(c.product_id)} ({formatNumber(c.quantity)} t)
                    </option>
                  ))}
                </Select>
                {isAcente && contracts.length === 0 && (
                  <div className="mt-1 text-xs text-amber-600">
                    Firmanıza atanmış bağlantı yok. Sunar yetkilinize başvurun.
                  </div>
                )}
              </Field>
              <Field label="İşlem" required>
                <div className="inline-flex w-full overflow-hidden rounded-lg border border-border text-sm">
                  <button
                    type="button"
                    onClick={() => setDir("in")}
                    className={`flex-1 px-3 py-2 font-medium ${dir === "in" ? "bg-brand text-white" : "bg-white text-gray-600"}`}
                  >
                    Depoya Giriş
                  </button>
                  <button
                    type="button"
                    onClick={() => setDir("load")}
                    className={`flex-1 px-3 py-2 font-medium ${dir === "load" ? "bg-brand text-white" : "bg-white text-gray-600"}`}
                  >
                    Gemiye Yükleme
                  </button>
                </div>
              </Field>
              <Field label="Miktar (ton)" required>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={
                    dir === "load" && whId && contractId
                      ? `Depoda: ${formatNumber(
                          (stockByWhContract.get(`${whId}|${contractId}`)?.in || 0) -
                            (stockByWhContract.get(`${whId}|${contractId}`)?.out || 0),
                        )} ton`
                      : "örn. 250"
                  }
                  onKeyDown={(e) => { if (e.key === "Enter") addMovement(); }}
                />
              </Field>
              <Field label="Araç / Vagon Plakası">
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="Opsiyonel"
                />
              </Field>
              <Field label="Tarih">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
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
              <Button onClick={addMovement} disabled={saving} className="w-full">
                {saving ? "Kaydediliyor..." : "Kaydet ↵"}
              </Button>
            </Card>
          ) : (
            <Card className="p-4 text-sm text-gray-500">
              Bu ekran salt-okunur; hareket girişi admin, operasyon ve acente rollerine açıktır.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
