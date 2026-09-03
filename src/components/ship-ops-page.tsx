"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from "./ui";
import { MovementPhotos, type MovementPhoto } from "./movement-photos";
import { PhotoGallery } from "./photo-gallery";
import { formatDate, formatNumber } from "@/lib/format";
import { translateDbError } from "@/lib/db-errors";
import { CONTRACT_STATUS_OPTIONS, SALES_STATUS_OPTIONS, STOCK_STATUS_OPTIONS } from "@/lib/resources";
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
  assigned_to: string | null;
  ship_broker_id: string | null;
};
type Movement = {
  id: string;
  contract_id: string;
  warehouse_id: string | null;
  quantity: number | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  stock_status: string | null;
  customs_declaration_no: string | null;
  movement_date: string | null;
  movement_time: string | null;
  created_at: string;
  created_by: string | null;
};
type Ref = { id: string; name: string };
type CompanyRef = { id: string; name: string; type: string };
// Fiyat İÇERMEZ: bu bağlantıdan otomatik karşılanan satışlar (bkz.
// fn_sales_order_autofill_contract, 0048) — yalnızca admin/operasyona,
// nakliyeci/gözetim/acente gibi dış rollere gösterilmez.
type SaleRow = {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  delivery_date: string | null;
};

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
  const [contractSales, setContractSales] = useState<SaleRow[]>([]); // bu bağlantıdan karşılanan satışlar (yalnız canManage)
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
  const [time,   setTime]   = useState(() => new Date().toTimeString().slice(0, 5));
  // Saat alanı, kullanıcı elle değiştirmediği sürece canlı saati (now) izler —
  // form açık kalsa bile "şimdi" göstermeye devam eder, elle girilen değeri ezmez.
  const timeTouchedRef = useRef(false);
  useEffect(() => {
    if (!timeTouchedRef.current) setTime(now.toTimeString().slice(0, 5));
  }, [now]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [flash, setFlash]   = useState<string | null>(null);

  // Toplu depo girişi (admin/operasyon): araç bazlı değil, doğrudan toplam
  // tonajı depoya + stok durumuna göre yazar. Aynı gemi için birden çok kez
  // gönderilerek (ör. yarısı Milli / yarısı Antrepo) bölünebilir.
  const [bulkWh, setBulkWh] = useState("");
  const [bulkStatus, setBulkStatus] = useState(""); // "" | "MİLLİ" | "ANTREPO" | "__other__"
  const [bulkStatusOther, setBulkStatusOther] = useState("");
  const [bulkCustomsNo, setBulkCustomsNo] = useState("");
  const [bulkQty, setBulkQty] = useState("");
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkFlash, setBulkFlash] = useState<string | null>(null);

  // Gemiye gözetim / liman / nakliyeci / acente atama
  const [surveyorId, setSurveyorId] = useState("");
  const [portId,     setPortId]     = useState("");
  const [carrierId,  setCarrierId]  = useState("");
  const [agentId,    setAgentId]    = useState("");
  const [shipBrokerId, setShipBrokerId] = useState("");
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
    const { data } = await supabase
      .from("stock_movements")
      .select("id,contract_id,warehouse_id,quantity,vehicle_plate,driver_name,stock_status,customs_declaration_no,movement_date,movement_time,created_at,created_by")
      .eq("contract_id", contractId)
      .eq("movement_type", "inbound")
      .order("created_at", { ascending: true });
    const rows = (data as Movement[]) || [];
    setMovements(rows);
    await loadPhotos(rows.map((r) => r.id));
  }, [supabase, contractId, loadPhotos]);

  useEffect(() => {
    (async () => {
      const CONTRACT_COLS =
        "id,contract_no,vessel,product_id,supplier_id,quantity,unit,eta,status,surveyor_id,port_id,carrier_id,agent_id,assigned_to,ship_broker_id";
      const [c0, w, p, co, pn, { data: au }] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select(CONTRACT_COLS)
          .eq("id", contractId)
          .maybeSingle(),
        // Boşaltma hedefi yurtiçi depo/fabrikadır; yurtdışı depolar bu listede yer almaz.
        supabase.from("warehouses").select("id,name").eq("is_active", true).neq("type", "foreign").order("name"),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name,type").order("name"),
        supabase.from("profile_names").select("id,full_name,role"),
        supabase.auth.getUser(),
      ]);
      // Dış roller (nakliyeci/gozetim/acente) tabloyu okuyamaz (fiyat gizli);
      // atandıkları gemiyi güvenli kolonlu external_contracts görünümünden alır.
      let c = c0;
      if (!c0.error && !c0.data) {
        const ext = await supabase
          .from("external_contracts")
          .select(CONTRACT_COLS)
          .eq("id", contractId)
          .maybeSingle();
        if (ext.data) c = ext;
      }
      if (c.error) { setError(translateDbError(c.error)); setLoading(false); return; }
      const cd = c.data as Contract | null;
      setContract(cd ?? null);
      setWarehouses((w.data as Ref[]) || []);
      setProducts((p.data as Ref[]) || []);
      setCompanies((co.data as CompanyRef[]) || []);
      setSurveyorId(cd?.surveyor_id ?? "");
      setPortId(cd?.port_id ?? "");
      setCarrierId(cd?.carrier_id ?? "");
      setAgentId(cd?.agent_id ?? "");
      setShipBrokerId(cd?.ship_broker_id ?? "");
      const pnRows = (pn.data as { id: string; full_name: string | null; role: string | null }[] | null) || [];
      const names: Record<string, string> = {};
      pnRows.forEach((x) => { names[x.id] = x.full_name || "—"; });
      setCreatorNames(names);
      let isManager = false;
      if (au.user) {
        const { data: prof } = await supabase
          .from("profiles").select("role").eq("id", au.user.id).maybeSingle();
        const r = (prof as { role?: string } | null)?.role || "";
        isManager = r === "admin" || r === "operations";
        setCanManage(isManager);
        setCanWrite(r === "admin" || r === "operations" || r === "nakliyeci" || r === "gozetim");
      }
      // Bu bağlantıdan otomatik karşılanan satışlar — "gemi bazlı rapor".
      // Fiyat içermez; yalnız admin/operasyona (dış rollere gösterilmez).
      if (isManager) {
        const { data: salesData } = await supabase
          .from("sales_orders")
          .select("id,order_no,customer_id,quantity,unit,status,delivery_date")
          .eq("contract_id", contractId)
          .neq("status", "cancelled");
        setContractSales((salesData as SaleRow[]) || []);
      } else {
        setContractSales([]);
      }
      await loadMovements();
      setLoading(false);
    })();
  }, [supabase, contractId, loadMovements]);

  const pName = (id: string | null) => products.find(p => p.id === id)?.name || "—";
  const wName = (id: string | null) => warehouses.find(w => w.id === id)?.name || "—";
  const cName = (id: string | null) => companies.find(c => c.id === id)?.name || "—";
  const creatorName = (id: string | null) => (id && creatorNames[id]) || "—";
  const statusOptOf = (v: string | null) => STOCK_STATUS_OPTIONS.find(o => o.value === v);

  const surveyors   = useMemo(() => companies.filter(c => c.type === "surveyor"), [companies]);
  const ports       = useMemo(() => companies.filter(c => c.type === "port"), [companies]);
  const carriers    = useMemo(() => companies.filter(c => c.type === "carrier"), [companies]);
  const agents      = useMemo(() => companies.filter(c => c.type === "agent"), [companies]);
  const shipBrokers = useMemo(() => companies.filter(c => c.type === "ship_broker"), [companies]);
  const partiesDirty =
    surveyorId !== (contract?.surveyor_id ?? "") ||
    portId     !== (contract?.port_id ?? "") ||
    carrierId  !== (contract?.carrier_id ?? "") ||
    agentId    !== (contract?.agent_id ?? "") ||
    shipBrokerId !== (contract?.ship_broker_id ?? "");

  const totalDrawn = useMemo(
    () => movements.reduce((a, m) => a + (Number(m.quantity) || 0), 0),
    [movements],
  );
  const contracted = Number(contract?.quantity) || 0;
  const remaining  = contracted - totalDrawn;
  const unit       = contract?.unit || "ton";

  const byWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    const statusMap = new Map<string, Map<string, number>>();
    movements.forEach(m => {
      const k = m.warehouse_id || "_none_";
      map.set(k, (map.get(k) || 0) + (Number(m.quantity) || 0));
      const sk = m.stock_status || "—";
      const inner = statusMap.get(k) || new Map<string, number>();
      inner.set(sk, (inner.get(sk) || 0) + (Number(m.quantity) || 0));
      statusMap.set(k, inner);
    });
    return Array.from(map.entries())
      .map(([id, qty]) => ({
        id,
        name: id === "_none_" ? "Depo belirtilmemiş" : wName(id),
        qty,
        byStatus: Array.from(statusMap.get(id)?.entries() || [])
          .map(([status, sqty]) => ({ status, qty: sqty }))
          .sort((a, b) => b.qty - a.qty),
      }))
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
    const { error: err } = await supabase.from("stock_movements").insert({
      contract_id:    contract.id,
      product_id:     contract.product_id,
      warehouse_id:   wh,
      movement_type:  "inbound",
      quantity:       q,
      unit:           contract.unit || unit,
      vehicle_plate:  plate.trim() || null,
      driver_name:    driver.trim() || null,
      movement_date:  date,
      movement_time:  time || null,
    });
    if (err) { setSaving(false); setFormErr(translateDbError(err)); return; }
    if (contract.status !== "arrived" && contract.status !== "completed") {
      // DB tarafında 0004 trigger'ı (SECURITY DEFINER) durumu 'arrived' yapar;
      // buradan update atmak operasyon rolünde RLS'e takılıp sessizce 0 satır
      // güncelliyordu. Yalnızca yerel görünümü tazeliyoruz.
      setContract(prev => prev ? { ...prev, status: "arrived" } : prev);
    }
    const msg = `${formatNumber(q)} ${unit} eklendi`;
    setFlash(msg);
    setPlate(""); setDriver(""); setQty("");
    timeTouchedRef.current = false;
    setTime(new Date().toTimeString().slice(0, 5));
    setSaving(false);
    await loadMovements();
    setTimeout(() => {
      setFlash(null);
      document.getElementById("ship-ops-plate")?.focus();
    }, 1800);
  };

  const addBulk = async () => {
    if (!contract) return;
    if (!bulkWh) { setBulkErr("Hedef depo / fabrika seçin."); return; }
    const q = parseFloat(bulkQty.replace(",", "."));
    if (!bulkQty || isNaN(q) || q <= 0) { setBulkErr("Geçerli bir tonaj girin."); return; }
    const resolvedStatus = bulkStatus === "__other__" ? bulkStatusOther.trim() : bulkStatus;
    if (bulkStatus === "__other__" && !resolvedStatus) {
      setBulkErr("Stok durumunu yazın."); return;
    }
    // Beyanname no formatı: YY + Gümrük İdare Kodu (6) + Rejim Kodu (2: IM/AN) +
    // Sıra No (8) = 18 hane; rejim kodu BAŞTA değil, 9-10. karakterde (ör.
    // Milli: 26310100IM00018828, Antrepo: 26310100AN00018828 — kullanıcı örneği).
    const customsNo = bulkCustomsNo.trim().toUpperCase();
    if (bulkStatus === "MİLLİ" || bulkStatus === "ANTREPO") {
      const regime = bulkStatus === "MİLLİ" ? "IM" : "AN";
      const sample = `26310100${regime}00018828`;
      if (!customsNo) { setBulkErr(`Gümrük beyanname no girin (ör. ${sample}).`); return; }
      if (customsNo.length !== 18 || customsNo.slice(8, 10) !== regime) {
        setBulkErr(`Beyanname no 18 haneli olmalı, 9-10. karakterleri "${regime}" olmalı (ör. ${sample}).`);
        return;
      }
    }
    setBulkSaving(true);
    setBulkErr(null);
    const { error: err } = await supabase.from("stock_movements").insert({
      contract_id:   contract.id,
      product_id:    contract.product_id,
      warehouse_id:  bulkWh,
      movement_type: "inbound",
      quantity:      q,
      unit:          contract.unit || unit,
      stock_status:  resolvedStatus || null,
      customs_declaration_no: customsNo || null,
      movement_date: bulkDate,
    });
    if (err) { setBulkSaving(false); setBulkErr(translateDbError(err)); return; }
    if (contract.status !== "arrived" && contract.status !== "completed") {
      setContract(prev => prev ? { ...prev, status: "arrived" } : prev);
    }
    setBulkFlash(`${formatNumber(q)} ${unit} eklendi`);
    setBulkQty("");
    setBulkCustomsNo("");
    setBulkSaving(false);
    await loadMovements();
    setTimeout(() => setBulkFlash(null), 1800);
  };

  const deleteMov = async (id: string) => {
    if (!window.confirm("Bu çekim kaydı silinsin mi?")) return;
    // Önce DB silinir (RLS/koruma tetikleyicisi reddedebilir); ancak başarılıysa
    // fotoğraflar depolamadan temizlenir. Ters sıra, silinemeyen kaydın
    // fotoğraflarını kaybettirirdi.
    const paths = (photosByMovement[id] || []).map((p) => p.path);
    const { error: err } = await supabase.from("stock_movements").delete().eq("id", id);
    if (err) { window.alert("Silinemedi: " + translateDbError(err)); return; }
    if (paths.length) await supabase.storage.from("movement-photos").remove(paths);
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
    if (remaining > 0 && !window.confirm(
      `${formatNumber(remaining)} ${unit} hâlâ boşaltılmadı. Gemiyi tamamlandı olarak işaretlemek istiyor musunuz?`
    )) return;
    // Statü geçişi DEFINER RPC ile: pc_write operasyona kapalı olduğundan
    // doğrudan update RLS'te sessizce 0 satır güncelliyordu (görünmez hata).
    const { error: err } = await supabase.rpc("complete_ships", { p_contract_ids: [contract.id] });
    if (err) { window.alert("Gemi bitirilemedi: " + translateDbError(err)); return; }
    setContract(prev => prev ? { ...prev, status: "completed" } : prev);
  };

  const saveParties = async () => {
    if (!contract) return;
    setAssignSaving(true);
    setAssignErr(null);
    const rpcResult = await supabase.rpc("assign_ship_parties", {
      p_contract_id: contract.id,
      p_surveyor_id: surveyorId || null,
      p_port_id:     portId || null,
      p_carrier_id:  carrierId || null,
      p_agent_id:    agentId || null,
      p_assigned_to: null,
      p_ship_broker_id: shipBrokerId || null,
    });
    if (rpcResult.error) { setAssignSaving(false); setAssignErr(translateDbError(rpcResult.error)); return; }
    const parties = {
      surveyor_id: surveyorId || null,
      port_id:     portId || null,
      carrier_id:  carrierId || null,
      agent_id:    agentId || null,
      ship_broker_id: shipBrokerId || null,
    };
    setContract(prev => prev ? { ...prev, ...parties } : prev);
    setAssignSaving(false);
    setAssignFlash("Atamalar kaydedildi");
    setTimeout(() => setAssignFlash(null), 1800);
  };

  const exportCsv = () => {
    if (!contract) return;
    const headers = ["Sıra", "Tarih", "Saat Girişi", "Plaka", "Şoför", "Depo / Fabrika", "Stok Durumu", "Beyanname No", `Miktar (${unit})`];
    const body = movements.map((m, i) => {
      const t = m.movement_time ? m.movement_time.slice(0, 5) : timeFmt(m.created_at);
      const st = statusOptOf(m.stock_status)?.label || m.stock_status || "";
      return [i + 1, formatDate(m.movement_date), t, m.vehicle_plate || "", m.driver_name || "", wName(m.warehouse_id), st, m.customs_declaration_no || "", Number(m.quantity) || 0];
    });
    const depotRows = byWarehouse.map(bw => ["", "", "", "", "", bw.name + " (toplam)", "", "", bw.qty]);
    const csv = [headers, ...body, [], ["", "", "", "", "", "TOPLAM", "", "", totalDrawn], ...depotRows]
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <div className="mt-0.5 text-sm text-gray-500">
              {pName(contract.product_id)}
              {contract.contract_no && ` · Söz. ${contract.contract_no}`}
              {contract.supplier_id && ` · ${cName(contract.supplier_id)}`}
              {contract.eta && ` · ETA ${formatDate(contract.eta)}`}
            </div>
          </div>
          {statusOpt && <Badge color={statusOpt.color}>{statusOpt.label}</Badge>}
        </div>
      </div>

      {/* ── Gözetim / Liman / Nakliyeci (yalnızca admin/operasyon atar) ── */}
      {canManage && (
      <Card className="p-4 print:hidden">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Operasyon Tarafları</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <Field label="Acente">
            {canWrite && contract.status !== "completed" ? (
              <Select value={agentId} onChange={e => setAgentId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.agent_id)}</div>
            )}
          </Field>
          <Field label="Gemi Brokeri">
            {canWrite && contract.status !== "completed" ? (
              <Select value={shipBrokerId} onChange={e => setShipBrokerId(e.target.value)}>
                <option value="">Seçiniz...</option>
                {shipBrokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm">{cName(contract.ship_broker_id)}</div>
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

      {/* ── Bu bağlantıdan karşılanan satışlar (gemi bazlı rapor, fiyatsız) ── */}
      {canManage && contractSales.length > 0 && (
        <Card className="p-4 print:hidden">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Bu Bağlantıdan Yapılan Satışlar</span>
            <span className="text-xs text-gray-400">{contractSales.length} satış</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3 font-medium">Satış No</th>
                  <th className="py-2 pr-3 font-medium">Müşteri</th>
                  <th className="py-2 pr-3 text-right font-medium">Miktar</th>
                  <th className="py-2 pr-3 font-medium">Teslim Tarihi</th>
                  <th className="py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {contractSales.map((s) => {
                  const st = SALES_STATUS_OPTIONS.find((o) => o.value === s.status);
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{s.order_no || "—"}</td>
                      <td className="py-2 pr-3">{cName(s.customer_id)}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(s.quantity)} {s.unit}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{formatDate(s.delivery_date)}</td>
                      <td className="py-2">{st && <Badge color={st.color}>{st.label}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          labels={["Çeki Listesi", "Numune", "Ürün", "Belge"]}
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
          <div className="text-[11px] uppercase text-gray-500">Giriş / Süre</div>
          {opStats ? (
            <>
              <div className="mt-0.5 text-lg font-bold">{opStats.count} giriş</div>
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

      {/* ── Depo bazlı dağılım (stok durumu kırılımıyla) ── */}
      {byWarehouse.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {byWarehouse.map(bw => (
            <Card key={bw.id} className="p-3">
              <div className="truncate text-[11px] text-gray-500">{bw.name}</div>
              <div className="mt-0.5 font-bold">{formatNumber(bw.qty)}</div>
              <div className="text-xs text-gray-400">{unit}</div>
              {bw.byStatus.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {bw.byStatus.map(s => {
                    const opt = statusOptOf(s.status);
                    return (
                      <Badge key={s.status} color={opt?.color || "gray"}>
                        {opt?.label || s.status}: {formatNumber(s.qty)}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Araç listesi + hızlı giriş formu ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">

        {/* Araç tablosu (sola / alta) */}
        <div className="order-2 lg:order-1">
          <div className="mb-2 text-sm font-semibold">Giriş Listesi</div>
          {movements.length === 0 ? (
            <EmptyState message="Henüz depoya giriş yapılmadı." />
          ) : (
            <>
            {/* Masaüstü: tablo */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-white md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Tarih / Saat</th>
                    <th className="px-3 py-2.5 font-medium">Plaka</th>
                    <th className="px-3 py-2.5 font-medium">Şoför</th>
                    <th className="px-3 py-2.5 font-medium">Depo / Fabrika</th>
                    <th className="px-3 py-2.5 font-medium">Stok Durumu</th>
                    <th className="px-3 py-2.5 font-medium">Giren</th>
                    <th className="px-3 py-2.5 text-right font-medium">Miktar</th>
                    <th className="px-2 py-2.5 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m, i) => {
                    const count = photosByMovement[m.id]?.length || 0;
                    const open = openPhotos.has(m.id);
                    const st = statusOptOf(m.stock_status);
                    return (
                      <Fragment key={m.id}>
                        <tr className="border-b border-border last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-xs">
                            <div>{formatDate(m.movement_date)}</div>
                            <div className="text-gray-400">{m.movement_time ? m.movement_time.slice(0, 5) : timeFmt(m.created_at)}</div>
                          </td>
                          <td className="px-3 py-2 font-medium tracking-wider">
                            {m.vehicle_plate || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2">{m.driver_name || <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2 text-xs">{wName(m.warehouse_id)}</td>
                          <td className="px-3 py-2 text-xs">
                            {m.stock_status ? (
                              <>
                                <Badge color={st?.color || "gray"}>{st?.label || m.stock_status}</Badge>
                                {m.customs_declaration_no && (
                                  <div className="mt-0.5 text-[11px] text-gray-400">{m.customs_declaration_no}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
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
                            <td colSpan={9} className="px-3 py-3">
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
                    <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-gray-600">TOPLAM</td>
                    <td className="px-3 py-2 text-right font-bold">
                      {formatNumber(totalDrawn)} <span className="text-xs font-normal text-gray-400">{unit}</span>
                    </td>
                    <td className="print:hidden" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobil: giriş kartları (yatay kaydırma yerine okunabilir liste) */}
            <div className="space-y-2 md:hidden">
              {movements.map((m) => {
                const count = photosByMovement[m.id]?.length || 0;
                const open = openPhotos.has(m.id);
                const st = statusOptOf(m.stock_status);
                return (
                  <div key={m.id} className="rounded-xl border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold tracking-wider">
                          {m.vehicle_plate || wName(m.warehouse_id)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {formatDate(m.movement_date)} · {m.movement_time ? m.movement_time.slice(0, 5) : timeFmt(m.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold">{formatNumber(m.quantity)}</div>
                        <div className="text-[11px] text-gray-400">{unit}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      {m.driver_name ? `${m.driver_name} · ` : ""}
                      {m.vehicle_plate ? wName(m.warehouse_id) : null}
                      {m.stock_status && <Badge color={st?.color || "gray"}>{st?.label || m.stock_status}</Badge>}
                      {m.customs_declaration_no && <span className="text-gray-400">{m.customs_declaration_no}</span>}
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
          {/* Admin/Operasyon: araç araç değil, doğrudan toplam tonajı depoya
              (+ stok durumuna) yazan toplu giriş. Nakliyeci/Gözetim (dış roller)
              için araç bazlı hızlı giriş aynen kalır — DB 100 ton/kayıt limiti
              zaten onlara özel (bkz. 0046 fn_sm_guard). */}
          {canManage && contract.status !== "completed" && (
            <div>
              <div className="mb-2 text-sm font-semibold">Toplu Depo Girişi</div>
              {!etaReady ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  ETA ({formatDate(contract.eta)}) gelmeden operasyon başlatılamaz.
                </div>
              ) : (
                <Card className="space-y-3 p-4">
                  <p className="text-xs text-gray-500">
                    Araç araç değil, doğrudan toplam tonajı yazın. Aynı gemi farklı
                    depolara / stok durumlarına bölünecekse (ör. yarısı Milli,
                    yarısı Antrepo) bu formu birden çok kez gönderin.
                  </p>
                  <Field label="Depo / Fabrika" required>
                    <Select value={bulkWh} onChange={e => setBulkWh(e.target.value)}>
                      <option value="">Seçiniz...</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Stok Durumu">
                    <Select
                      value={bulkStatus}
                      onChange={e => { setBulkStatus(e.target.value); setBulkCustomsNo(""); }}
                    >
                      <option value="">Belirtilmedi</option>
                      {STOCK_STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                      <option value="__other__">Diğer</option>
                    </Select>
                  </Field>
                  {bulkStatus === "__other__" && (
                    <Field label="Durumu Yazın" required>
                      <Input
                        value={bulkStatusOther}
                        onChange={e => setBulkStatusOther(e.target.value.toUpperCase())}
                        placeholder="Ör. TRANSİT"
                      />
                    </Field>
                  )}
                  {(bulkStatus === "MİLLİ" || bulkStatus === "ANTREPO") && (
                    <Field label="Gümrük Beyanname No (18 Hane)" required>
                      <Input
                        value={bulkCustomsNo}
                        onChange={e => setBulkCustomsNo(e.target.value.toUpperCase())}
                        placeholder={bulkStatus === "MİLLİ" ? "26310100IM00018828" : "26310100AN00018828"}
                        maxLength={18}
                      />
                    </Field>
                  )}
                  <Field label={`Tonaj (${unit})`} required>
                    <Input
                      id="ship-ops-bulk-qty"
                      type="text"
                      inputMode="decimal"
                      value={bulkQty}
                      onChange={e => setBulkQty(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
                      placeholder={remaining > 0 ? `Kalan: ${formatNumber(remaining)} ${unit}` : "Tonaj"}
                      onKeyDown={e => { if (e.key === "Enter") addBulk(); }}
                      autoFocus
                    />
                  </Field>
                  <Field label="Tarih">
                    <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                  </Field>
                  {bulkErr && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {bulkErr}
                    </div>
                  )}
                  {bulkFlash && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      ✓ {bulkFlash}
                    </div>
                  )}
                  <Button onClick={addBulk} disabled={bulkSaving} className="w-full">
                    {bulkSaving ? "Ekleniyor..." : "Ekle"}
                  </Button>
                </Card>
              )}
            </div>
          )}
          {canWrite && !canManage && contract.status !== "completed" && (
            <>
              <div>
                <div className="mb-2 text-sm font-semibold">Hızlı Araç Girişi</div>
                {!etaReady ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    ETA ({formatDate(contract.eta)}) gelmeden operasyon başlatılamaz.
                  </div>
                ) : (
                  <Card className="space-y-3 p-4">
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
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Field label="Tarih">
                          <Input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="w-28 shrink-0">
                        <Field label="Saat">
                          <Input
                            type="time"
                            value={time}
                            onChange={e => { timeTouchedRef.current = true; setTime(e.target.value); }}
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
                    <Button onClick={addVehicle} disabled={saving} className="w-full">
                      {saving ? "Ekleniyor..." : "Ekle ve Devam Et ↵"}
                    </Button>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* Tonaj farkı — gemi tamamlandığında ve eksik varsa bu artık kesin
              FİRE'dır (bir daha gelmeyecek); operasyon sürerken henüz sadece
              "bekleyen/kalan" tonajdır. */}
          {movements.length > 0 && (
            <div>
              {(() => {
                const isFire = contract.status === "completed" && remaining > 0;
                return (
                  <>
                    <div className="mb-2 text-sm font-semibold">{isFire ? "Fire" : "Tonaj Farkı"}</div>
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
                        <span className="text-gray-600">{isFire ? "Fire" : "Fark"}</span>
                        <span className={remaining < 0 ? "text-red-600" : remaining === 0 ? "text-emerald-600" : isFire ? "text-red-600" : "text-amber-600"}>
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
                  </>
                );
              })()}

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
            <div className="text-gray-500 text-xs">{contract.status === "completed" && remaining > 0 ? "Fire" : "Fark"}</div>
            <div className={`font-bold ${remaining < 0 ? "text-red-600" : remaining === 0 ? "text-emerald-600" : contract.status === "completed" ? "text-red-600" : "text-amber-600"}`}>
              {remaining === 0 ? "±0"
                : remaining > 0 ? `−${formatNumber(remaining)}`
                : `+${formatNumber(-remaining)}`} {unit}
              {contracted > 0 && ` (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}%)`}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Giriş</div>
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
