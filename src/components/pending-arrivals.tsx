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
// SADECE operasyonel veri gösterir (liman/gemi, ürün, tonaj, ETA) — satış verisi yok.
// Giriş ETA tarihinden önce yapılamaz; giriş yapılınca bağlantı "Geldi" olur.

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

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

export function PendingArrivals({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [warehouses, setWarehouses] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<Contract | null>(null);
  const [whId, setWhId] = useState("");
  const [qty, setQty] = useState("");
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const etaReady = (eta: string | null) => {
    if (!eta) return true; // ETA girilmemişse kilitleme
    const d = new Date(eta);
    return !Number.isNaN(d.getTime()) && d <= today;
  };

  const openArrival = (c: Contract) => {
    setTarget(c);
    setWhId("");
    setQty(c.quantity != null ? String(c.quantity) : "");
    setDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
  };

  const submitArrival = async () => {
    if (!target) return;
    if (!whId) {
      setFormError("Depo / Fabrika seçin.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error: insErr } = await supabase.from("stock_movements").insert({
      contract_id: target.id,
      product_id: target.product_id,
      warehouse_id: whId,
      movement_type: "inbound",
      quantity: qty === "" ? 0 : Number(qty),
      unit: target.unit || "ton",
      movement_date: date || new Date().toISOString().slice(0, 10),
    });
    if (insErr) {
      setSaving(false);
      setFormError(insErr.message);
      return;
    }
    // DB tetikleyicisi kuruluysa otomatik olur; admin/satın alma için ayrıca garanti et.
    await supabase.from("purchase_contracts").update({ status: "arrived" }).eq("id", target.id);
    setSaving(false);
    setTarget(null);
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

  const renderRow = (c: Contract) => {
    const ready = etaReady(c.eta);
    const st = statusOpt(c.status);
    return (
      <div
        key={c.id}
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
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
          {canArrive &&
            c.status !== "arrived" &&
            (ready ? (
              <Button size="sm" onClick={() => openArrival(c)}>
                Giriş Yap
              </Button>
            ) : (
              <span className="text-xs text-gray-400">ETA bekleniyor</span>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Bekleyen Gelişler</div>
        <div className="mb-2 text-xs text-gray-500">
          Bağlantısı yapılmış, henüz gelmemiş yükler. Giriş ETA tarihinden önce yapılamaz; giriş
          yapılınca bağlantı otomatik &quot;Geldi&quot; olur (kısmi giriş yapılabilir).
        </div>
        {pending.length === 0 ? (
          <EmptyState message="Bekleyen geliş yok." />
        ) : (
          pending.map(renderRow)
        )}
      </Card>

      {arrived.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Gelenler</div>
          {arrived.map(renderRow)}
        </Card>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title="Giriş (Boşaltma) Kaydı">
        {target && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {target.vessel || target.contract_no || "—"} · {productName(target.product_id)} · bağlı{" "}
              {formatNumber(target.quantity)} {target.unit || "ton"}
            </div>
            <Field label="Depo / Fabrika" required>
              <Select value={whId} onChange={(e) => setWhId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gelen Miktar (kısmi olabilir)" required>
              <Input
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
            <Field label="Tarih" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setTarget(null)}>
                İptal
              </Button>
              <Button onClick={submitArrival} disabled={saving}>
                {saving ? "Kaydediliyor..." : "Geldi olarak kaydet"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
