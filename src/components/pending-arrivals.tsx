"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import type { Role } from "@/lib/types";

// Operasyonun çekirdeği: bağlantısı yapılmış yüklerin gelişini takip eder.
// Bir geminin malı birden çok yere (fabrika / dış depo) bölünebilir => çoklu çekim.
// Her çekimde hedef depo seçilir; başta bir "varsayılan depo" belirlenir ve her
// çekimde otomatik gelir, farklıysa o çekimde değiştirilebilir.
// Giriş ETA tarihinden önce yapılamaz; ilk giriş yapılınca bağlantı "Geldi" olur.

type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  origin_country: string | null;
  product_id: string | null;
  quantity: number | null;
  unit: string | null;
  eta: string | null;
  status: string;
};
type Ref = { id: string; name: string };
type Draw = {
  id: string;
  warehouse_id: string | null;
  quantity: number | null;
  vehicle_plate: string | null;
  movement_date: string | null;
};

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

export function PendingArrivals({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [warehouses, setWarehouses] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Operasyon (çoklu çekim) modalı
  const [target, setTarget] = useState<Contract | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [drawsLoading, setDrawsLoading] = useState(false);
  const [defaultWh, setDefaultWh] = useState("");
  const [wh, setWh] = useState("");
  const [qty, setQty] = useState("");
  const [plate, setPlate] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canArrive = role === "admin" || role === "operations";

  const load = async () => {
    setLoading(true);
    setError(null);
    const [c, p, w] = await Promise.all([
      supabase
        .from("purchase_contracts")
        .select("id,contract_no,vessel,origin_country,product_id,quantity,unit,eta,status")
        .order("eta", { ascending: true }),
      supabase.from("products").select("id,name"),
      supabase.from("warehouses").select("id,name"),
    ]);
    if (c.error) setError(c.error.message);
    setRows((c.data as Contract[]) || []);
    setProducts((p.data as Ref[]) || []);
    setWarehouses((w.data as Ref[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name || "Ürünsüz";
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || "-";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const etaReady = (eta: string | null) => {
    if (!eta) return true; // ETA girilmemişse kilitleme
    const d = new Date(eta);
    return !Number.isNaN(d.getTime()) && d <= today;
  };

  const loadDraws = async (contractId: string) => {
    setDrawsLoading(true);
    const { data } = await supabase
      .from("stock_movements")
      .select("id,warehouse_id,quantity,vehicle_plate,movement_date")
      .eq("contract_id", contractId)
      .eq("movement_type", "inbound")
      .order("movement_date", { ascending: true });
    setDraws((data as Draw[]) || []);
    setDrawsLoading(false);
  };

  const openOperation = (c: Contract) => {
    setTarget(c);
    setDefaultWh("");
    setWh("");
    setQty("");
    setPlate("");
    setDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setDraws([]);
    loadDraws(c.id);
  };

  const pickDefault = (id: string) => {
    setDefaultWh(id);
    setWh(id); // yeni çekim varsayılan olarak buraya gelir
  };

  const addDraw = async () => {
    if (!target) return;
    const useWh = wh || defaultWh;
    if (!useWh) {
      setFormError("Hedef depo/fabrika seçin (ya da varsayılan belirleyin).");
      return;
    }
    if (!qty || Number(qty) <= 0) {
      setFormError("Çekilen miktarı girin.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error: insErr } = await supabase.from("stock_movements").insert({
      contract_id: target.id,
      product_id: target.product_id,
      warehouse_id: useWh,
      movement_type: "inbound",
      quantity: Number(qty),
      unit: target.unit || "ton",
      vehicle_plate: plate || null,
      movement_date: date || new Date().toISOString().slice(0, 10),
    });
    if (insErr) {
      setSaving(false);
      setFormError(insErr.message);
      return;
    }
    // Tetikleyici kuruluysa otomatik; admin/satın alma için ayrıca garanti et.
    await supabase.from("purchase_contracts").update({ status: "arrived" }).eq("id", target.id);
    setQty("");
    setPlate("");
    setWh(defaultWh);
    setSaving(false);
    await loadDraws(target.id);
    load();
  };

  const deleteDraw = async (id: string) => {
    if (!window.confirm("Bu çekim kaydı silinsin mi?")) return;
    const { error: delErr } = await supabase.from("stock_movements").delete().eq("id", id);
    if (delErr) {
      alert("Silinemedi: " + delErr.message);
      return;
    }
    setDraws((prev) => prev.filter((d) => d.id !== id));
    load();
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Yüklenemedi: {error}
      </div>
    );

  const visible = rows.filter((r) => r.status !== "cancelled" && r.status !== "completed");
  const pending = visible.filter((r) => r.status !== "arrived");
  const arrived = visible.filter((r) => r.status === "arrived");

  const drawnTotal = draws.reduce((a, d) => a + (Number(d.quantity) || 0), 0);
  const targetReady = target ? etaReady(target.eta) : false;

  const renderRow = (c: Contract) => {
    const st = statusOpt(c.status);
    return (
      <button
        key={c.id}
        onClick={() => openOperation(c)}
        className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-left last:border-0 hover:bg-gray-50"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {c.vessel || c.origin_country || c.contract_no || "—"}
          </div>
          <div className="truncate text-xs text-gray-500">
            {productName(c.product_id)} · {formatNumber(c.quantity)} {c.unit || "ton"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">ETA {formatDate(c.eta)}</span>
          {st && <Badge color={st.color}>{st.label}</Badge>}
          {canArrive && (
            <span className="text-xs font-medium text-brand">Operasyon →</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Bekleyen Gelişler</div>
        <div className="mb-2 text-xs text-gray-500">
          Gemiye tıkla, operasyonu aç. Mal birden çok yere bölünebilir (çoklu çekim); her çekimde
          hedef depo seçilir. Giriş ETA tarihinden önce yapılamaz.
        </div>
        {pending.length === 0 ? <EmptyState message="Bekleyen geliş yok." /> : pending.map(renderRow)}
      </Card>

      {arrived.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Gelenler (çekim eklenebilir)</div>
          {arrived.map(renderRow)}
        </Card>
      )}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `Operasyon — ${target.vessel || target.contract_no || "Gemi"}` : "Operasyon"}
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {productName(target.product_id)} · bağlı {formatNumber(target.quantity)}{" "}
              {target.unit || "ton"} · ETA {formatDate(target.eta)}
            </div>

            {/* Varsayılan hedef */}
            <Field label="Varsayılan Depo / Fabrika (her çekimde gelir)">
              <Select value={defaultWh} onChange={(e) => pickDefault(e.target.value)}>
                <option value="">Seçiniz...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Mevcut çekimler */}
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">Çekimler</span>
                <span className="text-xs text-gray-500">
                  Çekilen {formatNumber(drawnTotal)} / {formatNumber(target.quantity)}{" "}
                  {target.unit || "ton"} · Kalan{" "}
                  {formatNumber((Number(target.quantity) || 0) - drawnTotal)}
                </span>
              </div>
              {drawsLoading ? (
                <div className="py-3 text-sm text-gray-500">Yükleniyor...</div>
              ) : draws.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-3 text-center text-sm text-gray-400">
                  Henüz çekim yok.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {draws.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{whName(d.warehouse_id)}</div>
                        <div className="text-xs text-gray-500">
                          {formatNumber(d.quantity)} {target.unit || "ton"}
                          {d.vehicle_plate ? ` · ${d.vehicle_plate}` : ""} ·{" "}
                          {formatDate(d.movement_date)}
                        </div>
                      </div>
                      {canArrive && (
                        <button
                          onClick={() => deleteDraw(d.id)}
                          className="shrink-0 text-xs text-red-500 hover:underline"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Yeni çekim */}
            {canArrive &&
              (targetReady ? (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="text-sm font-medium">Yeni Çekim</div>
                  <Field label="Hedef Depo / Fabrika" required>
                    <Select value={wh} onChange={(e) => setWh(e.target.value)}>
                      <option value="">Seçiniz...</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Miktar" required>
                      <Input
                        type="number"
                        step="any"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                      />
                    </Field>
                    <Field label="Araç Plakası">
                      <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Tarih" required>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {formError}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={addDraw} disabled={saving}>
                      {saving ? "Ekleniyor..." : "Çekim Ekle"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Bu yük için ETA ({formatDate(target.eta)}) gelmeden operasyon verisi girilemez.
                </div>
              ))}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setTarget(null)}>
                Kapat
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
