"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from "./ui";
import { MovementPhotos, type MovementPhoto } from "./movement-photos";
import { PhotoGallery } from "./photo-gallery";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { ArrowLeft, Camera, CheckCircle, Download, Leaf, Printer, Trash2 } from "lucide-react";

type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  supplier_id: string | null;
  quantity: number | null;
  unit: string | null;
  eta: string | null;
  status: string;
  surveyor_id: string | null;
  port_id: string | null;
  carrier_id: string | null;
  agent_id: string | null;
  combined_shipment_id: string | null;
};
type Movement = {
  id: string;
  contract_id: string;
  warehouse_id: string | null;
  quantity: number | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  movement_date: string | null;
  created_at: string;
  created_by: string | null;
};
type Ref = { id: string; name: string };
type CompanyRef = { id: string; name: string; type: string };

// Bir araç en fazla 40 ton (40.000 kg) yük taşıyabilir.
const MAX_TON = 40;

function durFmt(ms: number, showSec = false): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  if (showSec) {
    if (h > 0) return `${h}sa ${m}dk ${s}sn`;
    if (m > 0) return `${m}dk ${s}sn`;
    return `${s}sn`;
  }
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}
function timeFmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
function dtFmt(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ShipOpsPage({
  contractId,
  embedded = false,
}: {
  contractId: string;
  embedded?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [contract, setContract]   = useState<Contract | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [photosByMovement, setPhotosByMovement] = useState<Record<string, MovementPhoto[]>>({});
  const [openPhotos, setOpenPhotos] = useState<Set<string>>(new Set());
  const [warehouses, setWarehouses] = useState<Ref[]>([]);
  const [products, setProducts]   = useState<Ref[]>([]);
  const [companies, setCompanies] = useState<CompanyRef[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [canWrite, setCanWrite]   = useState(false); // araç tonajı + irsaliye (admin/operations/nakliyeci/gozetim)
  const [canManage, setCanManage] = useState(false); // taraf atama, gemiyi bitir, numune galerisi (admin/operations)
  // Kombine gemi desteği
  const siblingIdsRef = useRef<string[]>([]);
  const [siblings, setSiblings]   = useState<Contract[]>([]);
  const [combinedName, setCombinedName] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState(contractId);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Live clock — ticks every second when operation is ongoing
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // form
  const [plate,  setPlate]  = useState("");
  const [driver, setDriver] = useState("");
  const [wh,     setWh]     = useState("");
  const [qty,    setQty]    = useState("");
  const [qtyUnit, setQtyUnit] = useState<"ton" | "kg">("ton");
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [flash, setFlash]   = useState<string | null>(null);

  // Gemiye gözetim / liman / nakliyeci / acente atama
  const [surveyorId, setSurveyorId] = useState("");
  const [portId,     setPortId]     = useState("");
  const [carrierId,  setCarrierId]  = useState("");
  const [agentId,    setAgentId]    = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [assignFlash, setAssignFlash] = useState<string | null>(null);

  const loadPhotos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setPhotosByMovement({});
        return;
      }
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

  const loadMovements = useCallback(async () => {
    const ids = [contractId, ...siblingIdsRef.current];
    const { data } = await supabase
      .from("stock_movements")
      .select("id,contract_id,warehouse_id,quantity,vehicle_plate,driver_name,movement_date,created_at,created_by")
      .in("contract_id", ids)
      .eq("movement_type", "inbound")
      .order("created_at", { ascending: true });
    const rows = (data as Movement[]) || [];
    setMovements(rows);
    await loadPhotos(rows.map((r) => r.id));
  }, [supabase, contractId, loadPhotos]);

  useEffect(() => {
    (async () => {
      const [c, w, p, co, pn, { data: au }] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,product_id,supplier_id,quantity,unit,eta,status,surveyor_id,port_id,carrier_id,agent_id,combined_shipment_id")
          .eq("id", contractId)
          .maybeSingle(),
        supabase.from("warehouses").select("id,name").eq("is_active", true).order("name"),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name,type").order("name"),
        supabase.from("profile_names").select("id,full_name"),
        supabase.auth.getUser(),
      ]);
      if (c.error) { setError(c.error.message); setLoading(false); return; }
      const cd = c.data as Contract | null;
      setContract(cd ?? null);
      setWarehouses((w.data as Ref[]) || []);
      setProducts((p.data as Ref[]) || []);
      setCompanies((co.data as CompanyRef[]) || []);
      setSurveyorId(cd?.surveyor_id ?? "");
      setPortId(cd?.port_id ?? "");
      setCarrierId(cd?.carrier_id ?? "");
      setAgentId(cd?.agent_id ?? "");
      const names: Record<string, string> = {};
      ((pn.data as { id: string; full_name: string | null }[] | null) || []).forEach((x) => {
        names[x.id] = x.full_name || "—";
      });
      setCreatorNames(names);
      if (au.user) {
        const { data: prof } = await supabase
          .from("profiles").select("role").eq("id", au.user.id).maybeSingle();
        const r = (prof as { role?: string } | null)?.role || "";
        setCanManage(r === "admin" || r === "operations");
        setCanWrite(r === "admin" || r === "operations" || r === "nakliyeci" || r === "gozetim");
      }
      // Kombine gemi: diğer sözleşmeleri yükle
      if (cd?.combined_shipment_id) {
        const [sibRes, csRes] = await Promise.all([
          supabase
            .from("purchase_contracts")
            .select("id,contract_no,vessel,product_id,supplier_id,quantity,unit,eta,status,surveyor_id,port_id,carrier_id,agent_id,combined_shipment_id")
            .eq("combined_shipment_id", cd.combined_shipment_id)
            .neq("id", contractId),
          supabase.from("combined_shipments").select("name").eq("id", cd.combined_shipment_id).maybeSingle(),
        ]);
        const sibs = (sibRes.data as Contract[] | null) || [];
        siblingIdsRef.current = sibs.map((s) => s.id);
        setSiblings(sibs);
        setCombinedName((csRes.data as { name: string } | null)?.name ?? null);
      } else {
        siblingIdsRef.current = [];
        setSiblings([]);
        setCombinedName(null);
      }
      await loadMovements();
      setLoading(false);
    })();
  }, [supabase, contractId, loadMovements]);

  const pName = (id: string | null) => products.find(p => p.id === id)?.name || "—";
  const wName = (id: string | null) => warehouses.find(w => w.id === id)?.name || "—";
  const cName = (id: string | null) => companies.find(c => c.id === id)?.name || "—";
  const creatorName = (id: string | null) => (id && creatorNames[id]) || "—";

  const surveyors = useMemo(() => companies.filter(c => c.type === "surveyor"), [companies]);
  const ports     = useMemo(() => companies.filter(c => c.type === "port"), [companies]);
  const carriers  = useMemo(() => companies.filter(c => c.type === "carrier"), [companies]);
  const agents    = useMemo(() => companies.filter(c => c.type === "agent"), [companies]);
  const partiesDirty =
    surveyorId !== (contract?.surveyor_id ?? "") ||
    portId     !== (contract?.port_id ?? "") ||
    carrierId  !== (contract?.carrier_id ?? "") ||
    agentId    !== (contract?.agent_id ?? "");

  const totalDrawn = useMemo(
    () => movements.reduce((a, m) => a + (Number(m.quantity) || 0), 0),
    [movements],
  );
  const isCombined = !!(contract?.combined_shipment_id && siblings.length > 0);
  const allContracts = useMemo(
    () => (contract ? [contract, ...siblings] : siblings),
    [contract, siblings],
  );
  const contracted = isCombined
    ? allContracts.reduce((a, c) => a + (Number(c.quantity) || 0), 0)
    : Number(contract?.quantity) || 0;
  const remaining  = contracted - totalDrawn;
  const unit       = contract?.unit || "ton";

  // Per-contract breakdown for kombine view
  const perContractStats = useMemo(() => {
    if (!isCombined) return new Map<string, { contracted: number; drawn: number; unit: string }>();
    const map = new Map<string, { contracted: number; drawn: number; unit: string }>();
    allContracts.forEach((c) => {
      map.set(c.id, { contracted: Number(c.quantity) || 0, drawn: 0, unit: c.unit || "ton" });
    });
    movements.forEach((m) => {
      const s = map.get(m.contract_id);
      if (s) s.drawn += Number(m.quantity) || 0;
    });
    return map;
  }, [isCombined, allContracts, movements]);

  const byWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    movements.forEach(m => {
      const k = m.warehouse_id || "_none_";
      map.set(k, (map.get(k) || 0) + (Number(m.quantity) || 0));
    });
    return Array.from(map.entries())
      .map(([id, qty]) => ({ id, name: id === "_none_" ? "Depo belirtilmemiş" : wName(id), qty }))
      .sort((a, b) => b.qty - a.qty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouses]);

  const opStats = useMemo(() => {
    if (!movements.length) return null;
    const sorted = [...movements].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = sorted[0].created_at;
    const last  = sorted[sorted.length - 1].created_at;
    return { first, last, durationMs: new Date(last).getTime() - new Date(first).getTime(), count: movements.length };
  }, [movements]);

  // Elapsed time from first vehicle entry (live, counts up)
  const elapsedMs = opStats ? Math.max(0, now.getTime() - new Date(opStats.first).getTime()) : null;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const etaReady = !contract?.eta || new Date(contract.eta.slice(0, 10) + "T00:00:00") <= today;

  const addVehicle = async () => {
    if (!contract) return;
    if (!wh)  { setFormErr("Hedef depo / fabrika seçin."); return; }
    const raw = parseFloat(qty.replace(",", "."));
    if (!qty || isNaN(raw) || raw <= 0) { setFormErr("Geçerli bir miktar girin."); return; }
    const q = qtyUnit === "kg" ? raw / 1000 : raw;
    if (q > MAX_TON) {
      setFormErr(`Bir araç en fazla ${MAX_TON} ton (40.000 kg) olabilir.`);
      return;
    }
    setSaving(true);
    setFormErr(null);
    const isCombined = !!(contract.combined_shipment_id && siblings.length > 0);
    const targetId = isCombined ? selectedContractId : contract.id;
    const targetContract = isCombined
      ? ([contract, ...siblings].find((c) => c.id === targetId) ?? contract)
      : contract;
    const { error: err } = await supabase.from("stock_movements").insert({
      contract_id:    targetId,
      product_id:     targetContract.product_id,
      warehouse_id:   wh,
      movement_type:  "inbound",
      quantity:       q,
      unit:           targetContract.unit || unit,
      vehicle_plate:  plate.trim() || null,
      driver_name:    driver.trim() || null,
      movement_date:  date,
    });
    if (err) { setSaving(false); setFormErr(err.message); return; }
    if (targetContract.status !== "arrived" && targetContract.status !== "completed") {
      await supabase.from("purchase_contracts").update({ status: "arrived" }).eq("id", targetId);
      if (targetId === contract.id) {
        setContract(prev => prev ? { ...prev, status: "arrived" } : prev);
      } else {
        setSiblings(prev => prev.map((s) => s.id === targetId ? { ...s, status: "arrived" } : s));
      }
    }
    const msg = `${formatNumber(q)} ${unit} eklendi`;
    setFlash(msg);
    setPlate(""); setDriver(""); setQty("");
    setSaving(false);
    await loadMovements();
    setTimeout(() => {
      setFlash(null);
      document.getElementById("ship-ops-plate")?.focus();
    }, 1800);
  };

  const deleteMov = async (id: string) => {
    if (!window.confirm("Bu çekim kaydı silinsin mi?")) return;
    // Araca bağlı fotoğrafları depolamadan temizle (DB satırları cascade ile gider).
    const paths = (photosByMovement[id] || []).map((p) => p.path);
    if (paths.length) await supabase.storage.from("movement-photos").remove(paths);
    await supabase.from("stock_movements").delete().eq("id", id);
    await loadMovements();
  };

  const togglePhotos = (id: string) => {
    setOpenPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finishShip = async () => {
    if (!contract) return;
    const isCombined = !!(contract.combined_shipment_id && siblings.length > 0);
    if (remaining > 0 && !window.confirm(
      `${formatNumber(remaining)} ${unit} hâlâ boşaltılmadı. Gemiyi tamamlandı olarak işaretlemek istiyor musunuz?`
    )) return;
    if (isCombined) {
      const allIds = [contract.id, ...siblings.map((s) => s.id)];
      await supabase.from("purchase_contracts").update({ status: "completed" }).in("id", allIds);
      setContract(prev => prev ? { ...prev, status: "completed" } : prev);
      setSiblings(prev => prev.map((s) => ({ ...s, status: "completed" })));
    } else {
      await supabase.from("purchase_contracts").update({ status: "completed" }).eq("id", contract.id);
      setContract(prev => prev ? { ...prev, status: "completed" } : prev);
    }
  };

  const saveParties = async () => {
    if (!contract) return;
    setAssignSaving(true);
    setAssignErr(null);
    const isCombined = !!(contract.combined_shipment_id && siblings.length > 0);
    const rpcResult = isCombined
      ? await supabase.rpc("assign_combined_ship_parties", {
          p_combined_id: contract.combined_shipment_id!,
          p_surveyor_id: surveyorId || null,
          p_port_id:     portId || null,
          p_carrier_id:  carrierId || null,
          p_agent_id:    agentId || null,
        })
      : await supabase.rpc("assign_ship_parties", {
          p_contract_id: contract.id,
          p_surveyor_id: surveyorId || null,
          p_port_id:     portId || null,
          p_carrier_id:  carrierId || null,
          p_agent_id:    agentId || null,
        });
    if (rpcResult.error) { setAssignSaving(false); setAssignErr(rpcResult.error.message); return; }
    const parties = {
      surveyor_id: surveyorId || null,
      port_id:     portId || null,
      carrier_id:  carrierId || null,
      agent_id:    agentId || null,
    };
    setContract(prev => prev ? { ...prev, ...parties } : prev);
    if (isCombined) setSiblings(prev => prev.map((s) => ({ ...s, ...parties })));
    setAssignSaving(false);
    setAssignFlash("Atamalar kaydedildi");
    setTimeout(() => setAssignFlash(null), 1800);
  };

  const exportCsv = () => {
    if (!contract) return;
    const headers = isCombined
      ? ["Sıra", "Bağlantı", "Tarih", "Saat Girişi", "Plaka", "Şoför", "Depo / Fabrika", `Miktar (${unit})`]
      : ["Sıra", "Tarih", "Saat Girişi", "Plaka", "Şoför", "Depo / Fabrika", `Miktar (${unit})`];
    const body = movements.map((m, i) => {
      const cInfo = isCombined ? (allContracts.find((c) => c.id === m.contract_id)) : null;
      const cLabel = cInfo ? `${pName(cInfo.product_id)} (${cInfo.contract_no || "—"})` : "";
      return isCombined
        ? [i + 1, cLabel, formatDate(m.movement_date), timeFmt(m.created_at), m.vehicle_plate || "", m.driver_name || "", wName(m.warehouse_id), Number(m.quantity) || 0]
        : [i + 1, formatDate(m.movement_date), timeFmt(m.created_at), m.vehicle_plate || "", m.driver_name || "", wName(m.warehouse_id), Number(m.quantity) || 0];
    });
    const depotRows = byWarehouse.map(bw => ["", "", "", "", "", bw.name + " (toplam)", bw.qty]);
    const csv = [headers, ...body, [], ["", "", "", "", "", "TOPLAM", totalDrawn], ...depotRows]
      .map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${(contract.vessel || contract.contract_no || "gemi").replace(/[^\p{L}\p{N}]+/gu, "_")}-operasyon.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusOpt = CONTRACT_STATUS_OPTIONS.find(o => o.value === (contract?.status || ""));
  const title     = contract?.vessel || contract?.contract_no || "Gemi Operasyonu";

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error || !contract) return (
    <div className="mx-auto max-w-2xl p-6">
      <Link href="/operations" className="inline-flex items-center gap-1 text-sm text-brand mb-4"><ArrowLeft className="h-4 w-4" /> Operasyon</Link>
      <EmptyState message="Gemi bulunamadı veya erişim izniniz yok." />
    </div>
  );

  const diffPct = contracted > 0 ? ((totalDrawn - contracted) / contracted) * 100 : 0;

  return (
    <div className={embedded ? "space-y-4 print:space-y-3" : "mx-auto max-w-5xl space-y-4 print:max-w-none print:space-y-3"}>

      {/* ── Aksiyon çubuğu ── */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        {embedded ? (
          <span />
        ) : (
          <Link href="/operations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Operasyon
          </Link>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"
          >
            <Printer className="h-4 w-4" /> Rapor
          </button>
        </div>
      </div>

      {/* ── Yazdırma antet ── */}
      <div className="hidden print:flex items-start justify-between border-b-2 border-brand pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight">SUNAR TARIMSAL</div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400">Gemi Operasyon Raporu</div>
          </div>
        </div>
        <div className="text-right text-xs text-gray-400">{formatDate(new Date().toISOString())}</div>
      </div>

      {/* ── Gemi bilgisi ── */}
      <div className="rounded-xl border border-border bg-white p-4">
        {isCombined && (
          <div className="mb-2 flex items-center gap-2">
            <Badge color="blue">Kombine Gemi</Badge>
            {combinedName && <span className="text-sm font-semibold text-gray-700">{combinedName}</span>}
            <span className="text-xs text-gray-400">({allContracts.length} bağlantı)</span>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{isCombined ? (combinedName || title) : title}</h1>
            {isCombined ? (
              <div className="mt-1 space-y-0.5">
                {allContracts.map((c) => (
                  <div key={c.id} className="text-sm text-gray-500">
                    {pName(c.product_id)}
                    {c.contract_no && ` · ${c.contract_no}`}
                    {c.supplier_id && ` · ${cName(c.supplier_id)}`}
                    {` · ${formatNumber(c.quantity)} ${c.unit || unit}`}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-0.5 text-sm text-gray-500">
                {pName(contract.product_id)}
                {contract.contract_no && ` · Söz. ${contract.contract_no}`}
                {contract.supplier_id && ` · ${cName(contract.supplier_id)}`}
                {contract.eta && ` · ETA ${formatDate(contract.eta)}`}
              </div>
            )}
          </div>
          {statusOpt && <Badge color={statusOpt.color}>{statusOpt.label}</Badge>}
        </div>
      </div>

      {/* ── Gözetim / Liman / Nakliyeci (yalnızca admin/operasyon atar) ── */}
      {canManage && (
      <Card className="p-4 print:hidden">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Operasyon Tarafları</span>
          {isCombined && <span className="text-xs text-gray-400">Kombine gemideki tüm bağlantılara uygulanır</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Gözetim Şirketi">
            {canWrite && contract.status !== "completed" ? (
              <Select value={surveyorId} onChange={e => setSurveyorId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {surveyors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.surveyor_id)}</div>
            )}
          </Field>
          <Field label="Liman">
            {canWrite && contract.status !== "completed" ? (
              <Select value={portId} onChange={e => setPortId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.port_id)}</div>
            )}
          </Field>
          <Field label="Nakliyeci">
            {canWrite && contract.status !== "completed" ? (
              <Select value={carrierId} onChange={e => setCarrierId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.carrier_id)}</div>
            )}
          </Field>
          <Field label="Yurtdışı Acente">
            {canWrite && contract.status !== "completed" ? (
              <Select value={agentId} onChange={e => setAgentId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.agent_id)}</div>
            )}
          </Field>
        </div>
        {canWrite && contract.status !== "completed" && (
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={saveParties} disabled={assignSaving || !partiesDirty} size="sm">
              {assignSaving ? "Kaydediliyor..." : "Atamaları Kaydet"}
            </Button>
            {assignErr && <span className="text-sm text-red-600">{assignErr}</span>}
            {assignFlash && <span className="text-sm font-medium text-emerald-600">✓ {assignFlash}</span>}
          </div>
        )}
        {(surveyors.length === 0 && ports.length === 0 && carriers.length === 0) && canWrite && (
          <div className="mt-2 text-xs text-gray-500">
            Henüz gözetim/liman/nakliyeci firması yok. Operasyon → İş Ortakları sekmesinden ekleyebilirsiniz.
          </div>
        )}
      </Card>
      )}

      {/* ── Numune / Ürün görselleri & dosyalar (gemi bazlı) ── */}
      <Card className="p-4 print:hidden">
        <div className="mb-3 text-sm font-semibold">Numune / Ürün Görselleri &amp; Dosyalar</div>
        <PhotoGallery
          bucket="contract-photos"
          table="contract_photos"
          fkColumn="contract_id"
          fkValue={contract.id}
          canWrite={canManage}
          labels={["Numune", "Ürün", "Belge"]}
          emptyText="Bu gemiye ait görsel / dosya yok."
        />
      </Card>

      {/* ── Operasyon durumu banner ── */}
      {movements.length > 0 && contract.status !== "completed" && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 ${
          remaining <= 0
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-brand/5 border border-brand/20 text-brand"
        }`}>
          <span>
            {remaining <= 0
              ? "✓ Tüm yük çekildi — Gemiyi bitirebilirsiniz"
              : `⚡ Operasyon devam ediyor — Kalan: ${formatNumber(remaining)} ${unit}`}
          </span>
          {elapsedMs !== null && (
            <span className="font-mono text-base tabular-nums">{durFmt(elapsedMs, true)}</span>
          )}
        </div>
      )}

      {/* ── Özet istatistik kartları ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Sözleşme</div>
          <div className="mt-0.5 text-xl font-bold">{formatNumber(contracted)}</div>
          <div className="text-xs text-gray-400">{unit}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Çekilen</div>
          <div className="mt-0.5 text-xl font-bold text-brand">{formatNumber(totalDrawn)}</div>
          <div className="text-xs text-gray-400">{unit}</div>
        </Card>
        <Card className={`p-3 ${remaining < 0 ? "bg-red-50" : remaining === 0 && movements.length > 0 ? "bg-emerald-50" : ""}`}>
          <div className="text-[11px] uppercase text-gray-500">{remaining < 0 ? "Fazla Çekim" : "Bekleyen"}</div>
          <div className={`mt-0.5 text-xl font-bold ${remaining < 0 ? "text-red-600" : remaining === 0 && movements.length > 0 ? "text-emerald-700" : ""}`}>
            {formatNumber(Math.abs(remaining))}
          </div>
          <div className="text-xs text-gray-400">{unit}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Araç / Süre</div>
          {opStats ? (
            <>
              <div className="mt-0.5 text-lg font-bold">{opStats.count} araç</div>
              <div className="text-[11px] text-gray-500">
                {timeFmt(opStats.first)} → {opStats.count > 1 ? timeFmt(opStats.last) : "devam"}
                {" "}({durFmt(elapsedMs ?? opStats.durationMs, false)})
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-sm text-gray-400">Henüz giriş yok</div>
          )}
        </Card>
      </div>

      {/* ── Kombine: bağlantı bazlı döküm ── */}
      {isCombined && (
        <div className="overflow-x-auto rounded-xl border border-border bg-white print:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Bağlantı / Ürün</th>
                <th className="px-3 py-2 font-medium">Tedarikçi</th>
                <th className="px-3 py-2 text-right font-medium">Sözleşme</th>
                <th className="px-3 py-2 text-right font-medium">Çekilen</th>
                <th className="px-3 py-2 text-right font-medium">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {allContracts.map((c) => {
                const s = perContractStats.get(c.id);
                const rem = (s?.contracted ?? 0) - (s?.drawn ?? 0);
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{pName(c.product_id)}</div>
                      <div className="text-xs text-gray-400">{c.contract_no || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{cName(c.supplier_id)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(s?.contracted)} {s?.unit}</td>
                    <td className="px-3 py-2 text-right text-brand">{formatNumber(s?.drawn)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${rem < 0 ? "text-red-600" : rem === 0 && (s?.drawn ?? 0) > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                      {rem < 0 ? `+${formatNumber(-rem)}` : formatNumber(rem)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Depo bazlı dağılım ── */}
      {byWarehouse.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {byWarehouse.map(bw => (
            <Card key={bw.id} className="p-3">
              <div className="truncate text-[11px] text-gray-500">{bw.name}</div>
              <div className="mt-0.5 font-bold">{formatNumber(bw.qty)}</div>
              <div className="text-xs text-gray-400">{unit}</div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Araç listesi + hızlı giriş formu ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">

        {/* Araç tablosu (sola / alta) */}
        <div className="order-2 lg:order-1">
          <div className="mb-2 text-sm font-semibold">Araç Listesi</div>
          {movements.length === 0 ? (
            <EmptyState message="Henüz araç girişi yapılmadı." />
          ) : (
            <>
            {/* Masaüstü: tablo */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-white md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Tarih / Saat</th>
                    {isCombined && <th className="px-3 py-2.5 font-medium">Bağlantı</th>}
                    <th className="px-3 py-2.5 font-medium">Plaka</th>
                    <th className="px-3 py-2.5 font-medium">Şoför</th>
                    <th className="px-3 py-2.5 font-medium">Depo / Fabrika</th>
                    <th className="px-3 py-2.5 font-medium">Giren</th>
                    <th className="px-3 py-2.5 text-right font-medium">Miktar</th>
                    <th className="px-2 py-2.5 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => {
                    const count = photosByMovement[m.id]?.length || 0;
                    const open = openPhotos.has(m.id);
                    return (
                      <Fragment key={m.id}>
                        <tr className="border-b border-border last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-xs">
                            <div>{formatDate(m.movement_date)}</div>
                            <div className="text-gray-400">{timeFmt(m.created_at)}</div>
                          </td>
                          {isCombined && (
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {pName(allContracts.find((c) => c.id === m.contract_id)?.product_id ?? null)}
                            </td>
                          )}
                          <td className="px-3 py-2 font-medium tracking-wider">
                            {m.vehicle_plate || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2">{m.driver_name || <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2 text-xs">{wName(m.warehouse_id)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{creatorName(m.created_by)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatNumber(m.quantity)} <span className="text-xs font-normal text-gray-400">{unit}</span>
                          </td>
                          <td className="px-2 py-2 print:hidden">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => togglePhotos(m.id)}
                                className={`inline-flex items-center gap-1 rounded p-1 hover:bg-brand/10 hover:text-brand ${
                                  count > 0 || open ? "text-brand" : "text-gray-400"
                                }`}
                                title="Fotoğraflar (irsaliye / numune)"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                {count > 0 && <span className="text-xs font-medium">{count}</span>}
                              </button>
                              {canWrite && (
                                <button
                                  onClick={() => deleteMov(m.id)}
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  title="Aracı sil"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-border bg-gray-50/60 print:hidden">
                            <td colSpan={isCombined ? 9 : 8} className="px-3 py-3">
                              <MovementPhotos
                                movementId={m.id}
                                photos={photosByMovement[m.id]}
                                canWrite={canWrite}
                                onChanged={() => loadPhotos(movements.map((mm) => mm.id))}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={isCombined ? 7 : 6} className="px-3 py-2 text-xs font-semibold text-gray-600">TOPLAM</td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatNumber(totalDrawn)} <span className="text-xs font-normal text-gray-400">{unit}</span>
                    </td>
                    <td className="print:hidden" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobil: araç kartları (yatay kaydırma yerine okunabilir liste) */}
            <div className="space-y-2 md:hidden">
              {movements.map((m) => {
                const count = photosByMovement[m.id]?.length || 0;
                const open = openPhotos.has(m.id);
                return (
                  <div key={m.id} className="rounded-xl border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold tracking-wider">
                          {m.vehicle_plate || <span className="text-gray-400">Plakasız</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {formatDate(m.movement_date)} · {timeFmt(m.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold">{formatNumber(m.quantity)}</div>
                        <div className="text-[11px] text-gray-400">{unit}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs text-gray-600">
                      {m.driver_name ? `${m.driver_name} · ` : ""}
                      {wName(m.warehouse_id)}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                      <button
                        onClick={() => togglePhotos(m.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium ${
                          count > 0 || open ? "text-brand" : "text-gray-500"
                        }`}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {count > 0 ? `${count} foto / irsaliye` : "Foto / irsaliye ekle"}
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => deleteMov(m.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="Aracı sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="mt-2 border-t border-border pt-2">
                        <MovementPhotos
                          movementId={m.id}
                          photos={photosByMovement[m.id]}
                          canWrite={canWrite}
                          onChanged={() => loadPhotos(movements.map((mm) => mm.id))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-xl border border-border bg-gray-50 px-3 py-2.5 text-sm font-bold">
                <span className="text-gray-600">TOPLAM</span>
                <span>
                  {formatNumber(totalDrawn)} <span className="text-xs font-normal text-gray-400">{unit}</span>
                </span>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Sağ: form + tonaj farkı */}
        <div className="order-1 lg:order-2 space-y-4 print:hidden">
          {canWrite && contract.status !== "completed" && (
            <>
              <div>
                <div className="mb-2 text-sm font-semibold">Hızlı Araç Girişi</div>
                {!etaReady ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    ETA ({formatDate(contract.eta)}) gelmeden operasyon başlatılamaz.
                  </div>
                ) : (
                  <Card className="space-y-3 p-4">
                    {isCombined && (
                      <Field label="Bağlantı / Ürün" required>
                        <Select value={selectedContractId} onChange={e => setSelectedContractId(e.target.value)}>
                          {allContracts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {pName(c.product_id)}{c.contract_no ? ` — ${c.contract_no}` : ""}
                              {c.supplier_id ? ` (${cName(c.supplier_id)})` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <Field label="Araç Plakası">
                      <Input
                        id="ship-ops-plate"
                        value={plate}
                        onChange={e => setPlate(e.target.value.toUpperCase())}
                        placeholder="34 ABC 123"
                        onKeyDown={e => { if (e.key === "Enter") document.getElementById("ship-ops-qty")?.focus(); }}
                        autoFocus
                      />
                    </Field>
                    <Field label="Şoför Adı">
                      <Input
                        value={driver}
                        onChange={e => setDriver(e.target.value.toLocaleUpperCase("tr"))}
                        placeholder="AD SOYAD"
                      />
                    </Field>
                    <Field label="Depo / Fabrika" required>
                      <Select value={wh} onChange={e => setWh(e.target.value)}>
                        <option value="">Seçiniz...</option>
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label={
                        <span className="flex items-center justify-between">
                          <span>Miktar</span>
                          <span className="inline-flex overflow-hidden rounded-md border border-border text-xs">
                            <button
                              type="button"
                              onClick={() => { setQtyUnit("ton"); setQty(""); }}
                              className={`px-2 py-0.5 font-medium ${qtyUnit === "ton" ? "bg-brand text-white" : "bg-white text-gray-500"}`}
                            >
                              Ton
                            </button>
                            <button
                              type="button"
                              onClick={() => { setQtyUnit("kg"); setQty(""); }}
                              className={`px-2 py-0.5 font-medium ${qtyUnit === "kg" ? "bg-brand text-white" : "bg-white text-gray-500"}`}
                            >
                              KG
                            </button>
                          </span>
                        </span>
                      }
                      required
                    >
                      <Input
                        id="ship-ops-qty"
                        type="text"
                        inputMode="decimal"
                        value={qty}
                        onChange={e => {
                          // En fazla 6 rakam. Ton modunda 2. haneden sonra otomatik
                          // nokta (ör. 26540 -> 26.540). KG modunda düz tamsayı.
                          // 40 ton (40.000 kg) üstü giriş kabul edilmez (araç limiti).
                          const d = e.target.value.replace(/\D/g, "").slice(0, 6);
                          const next = qtyUnit === "ton" && d.length > 2 ? `${d.slice(0, 2)}.${d.slice(2)}` : d;
                          const tons = qtyUnit === "kg" ? Number(d) / 1000 : Number(next);
                          if (next === "" || (Number.isFinite(tons) && tons <= MAX_TON)) setQty(next);
                        }}
                        placeholder={
                          remaining > 0
                            ? `Kalan: ${formatNumber(qtyUnit === "kg" ? remaining * 1000 : remaining, qtyUnit === "kg" ? 0 : 2)} ${qtyUnit === "kg" ? "kg" : unit}`
                            : "Miktar"
                        }
                        onKeyDown={e => { if (e.key === "Enter") addVehicle(); }}
                      />
                      {qtyUnit === "kg" && qty && !isNaN(parseFloat(qty.replace(",", "."))) && (
                        <div className="mt-1 text-xs text-gray-500">
                          ≈ {formatNumber(parseFloat(qty.replace(",", ".")) / 1000, 3)} {unit}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-400">Bir araç en fazla 40 ton (40.000 kg)</div>
                    </Field>
                    <Field label="Tarih">
                      <Input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                      />
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
                    <Button onClick={addVehicle} disabled={saving} className="w-full">
                      {saving ? "Ekleniyor..." : "Ekle ve Devam Et ↵"}
                    </Button>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* Tonaj farkı */}
          {movements.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold">Tonaj Farkı</div>
              <Card className="divide-y divide-border p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-500">Sözleşme</span>
                  <span className="font-medium">{formatNumber(contracted)} {unit}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-500">Çekilen</span>
                  <span className="font-medium text-brand">{formatNumber(totalDrawn)} {unit}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-sm font-bold">
                  <span className="text-gray-600">Fark</span>
                  <span className={remaining < 0 ? "text-red-600" : remaining === 0 ? "text-emerald-600" : "text-amber-600"}>
                    {remaining === 0 ? "±0 (tam)" : remaining > 0
                      ? `−${formatNumber(remaining)} ${unit}`
                      : `+${formatNumber(-remaining)} ${unit} (fazla)`}
                    {contracted > 0 && remaining !== 0 && (
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              </Card>

              {canManage && (
                <Button
                  onClick={finishShip}
                  disabled={contract.status === "completed"}
                  className="mt-3 w-full"
                >
                  <CheckCircle className="h-4 w-4" />
                  {contract.status === "completed" ? "✓ Tamamlandı" : "Gemiyi Bitir"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Yazdırma: tonaj özeti + süre ── */}
      <div className="hidden print:block rounded-xl border border-border p-4 mt-4">
        <div className="mb-3 text-xs font-semibold uppercase text-gray-500">Tonaj & Operasyon Özeti</div>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs">Sözleşme</div>
            <div className="font-bold">{formatNumber(contracted)} {unit}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Çekilen</div>
            <div className="font-bold">{formatNumber(totalDrawn)} {unit}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Fark</div>
            <div className={`font-bold ${remaining < 0 ? "text-red-600" : remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {remaining === 0 ? "±0"
                : remaining > 0 ? `−${formatNumber(remaining)}`
                : `+${formatNumber(-remaining)}`} {unit}
              {contracted > 0 && ` (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)`}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Araç</div>
            <div className="font-bold">{movements.length} adet</div>
          </div>
        </div>
        {opStats && (
          <div className="mt-3 border-t border-border pt-2 text-xs text-gray-500">
            Operasyon başlangıç: {dtFmt(opStats.first)} · Bitiş: {dtFmt(opStats.last)} · Süre: {durFmt(opStats.durationMs)}
          </div>
        )}
        {byWarehouse.length > 1 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="text-xs text-gray-500 mb-1">Depo Dağılımı</div>
            <div className="flex flex-wrap gap-4 text-xs">
              {byWarehouse.map(bw => (
                <span key={bw.id}><span className="font-medium">{bw.name}:</span> {formatNumber(bw.qty)} {unit}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Yazdırma alt bilgi ── */}
      <div className="hidden print:flex items-center justify-between border-t border-border pt-3 text-[11px] text-gray-400">
        <span>Sunar Tarımsal CRM</span>
        <span>{formatDate(new Date().toISOString())}</span>
      </div>
    </div>
  );
}
