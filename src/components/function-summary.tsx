"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";

// Her fonksiyonun (Bağlantı / Satış / Operasyon) kendi "Özet" sekmesi.
// Veriyi istemci tarafında çeker; RLS gereği rol neyi görebiliyorsa onu gösterir.

const sumBy = <T,>(rows: T[], pick: (r: T) => unknown) =>
  rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {unit && <div className="text-xs text-gray-400">{unit}</div>}
    </Card>
  );
}

function ListCard({
  title,
  empty,
  children,
  count,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {count === 0 ? (
        <div className="py-2 text-sm text-gray-500">{empty}</div>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

function useProductMap(supabase: ReturnType<typeof createClient>) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.from("products").select("id,name");
      if (!on) return;
      const m: Record<string, string> = {};
      ((data as { id: string; name: string }[] | null) || []).forEach((p) => (m[p.id] = p.name));
      setMap(m);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);
  return map;
}

// ---------------------------------------------------------------------------
// BAĞLANTI
// ---------------------------------------------------------------------------
type Contract = {
  id: string;
  status: string | null;
  quantity: number | null;
  contract_no: string | null;
  vessel: string | null;
  eta: string | null;
  product_id: string | null;
};

export function BaglantiSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("purchase_contracts")
        .select("id,status,quantity,contract_no,vessel,eta,product_id");
      if (!on) return;
      setRows((data as Contract[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  if (loading) return <Loading />;

  const active = rows.filter((r) => r.status !== "cancelled");
  const toplam = sumBy(active, (r) => r.quantity);
  const yolda = sumBy(
    rows.filter((r) => r.status === "active" || r.status === "in_transit"),
    (r) => r.quantity,
  );
  const geldi = sumBy(
    rows.filter((r) => r.status === "arrived" || r.status === "completed"),
    (r) => r.quantity,
  );
  const upcoming = rows
    .filter((r) => r.status === "active" || r.status === "in_transit")
    .sort((a, b) => (a.eta || "9999").localeCompare(b.eta || "9999"))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam Bağlı" value={formatNumber(toplam)} unit="ton" />
        <Stat label="Yolda / Aktif" value={formatNumber(yolda)} unit="ton" />
        <Stat label="Gelen" value={formatNumber(geldi)} unit="ton" />
        <Stat label="Sözleşme" value={String(active.length)} unit="adet" />
      </div>
      <ListCard title="Yolda / Gelecek olanlar" empty="Yolda kayıt yok." count={upcoming.length}>
        {upcoming.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{c.vessel || c.contract_no || "—"}</span>
              <span className="text-gray-500"> · {pn(c.product_id)}</span>
            </span>
            <span className="shrink-0 text-right">
              {formatNumber(c.quantity)} ton
              <span className="ml-2 text-xs text-gray-400">ETA {formatDate(c.eta)}</span>
            </span>
          </div>
        ))}
      </ListCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SATIŞ
// ---------------------------------------------------------------------------
type Sale = {
  status: string | null;
  quantity: number | null;
  order_no: string | null;
  product_id: string | null;
};

export function SatisSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Sale[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const [s, inv] = await Promise.all([
        supabase.from("sales_orders").select("status,quantity,order_no,product_id"),
        supabase.from("inventory").select("available_qty"),
      ]);
      if (!on) return;
      setRows((s.data as Sale[] | null) || []);
      setAvailable(
        sumBy(((inv.data as { available_qty: number | null }[] | null) || []), (r) => r.available_qty),
      );
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  if (loading) return <Loading />;

  const bekleyen = rows.filter((s) => s.status === "draft" || s.status === "confirmed");
  const bekleyenTon = sumBy(bekleyen, (s) => s.quantity);
  const teslim = sumBy(
    rows.filter((s) => s.status === "delivered" || s.status === "invoiced"),
    (s) => s.quantity,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Satılabilir Stok" value={formatNumber(available)} unit="ton (satılmamış)" />
        <Stat label="Bekleyen Satış" value={formatNumber(bekleyenTon)} unit="ton" />
        <Stat label="Teslim Edilen" value={formatNumber(teslim)} unit="ton" />
        <Stat label="Satış" value={String(rows.length)} unit="adet" />
      </div>
      <ListCard title="Bekleyen / Açık satışlar" empty="Bekleyen satış yok." count={bekleyen.length}>
        {bekleyen.slice(0, 6).map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{s.order_no || "—"}</span>
              <span className="text-gray-500"> · {pn(s.product_id)}</span>
            </span>
            <span className="shrink-0">{formatNumber(s.quantity)} ton</span>
          </div>
        ))}
      </ListCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPERASYON
// ---------------------------------------------------------------------------
type Movement = {
  movement_type: string | null;
  quantity: number | null;
  movement_date: string | null;
  contract_id: string | null;
  product_id: string | null;
};

export function OperasyonSummary() {
  const supabase = useMemo(() => createClient(), []);
  const productMap = useProductMap(supabase);
  const [rows, setRows] = useState<Movement[]>([]);
  const [vesselMap, setVesselMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const [m, c] = await Promise.all([
        supabase
          .from("stock_movements")
          .select("movement_type,quantity,movement_date,contract_id,product_id"),
        supabase.from("purchase_contracts").select("id,vessel"),
      ]);
      if (!on) return;
      setRows((m.data as Movement[] | null) || []);
      const vm: Record<string, string> = {};
      ((c.data as { id: string; vessel: string | null }[] | null) || []).forEach((x) => {
        if (x.vessel) vm[x.id] = x.vessel;
      });
      setVesselMap(vm);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const pn = (id: string | null) => (id && productMap[id]) || "Ürünsüz";
  if (loading) return <Loading />;

  const inbound = rows.filter((m) => m.movement_type === "inbound");
  const toplamGiris = sumBy(inbound, (m) => m.quantity);
  const now = new Date();
  const buAy = sumBy(
    inbound.filter((m) => {
      if (!m.movement_date) return false;
      const d = new Date(m.movement_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
    (m) => m.quantity,
  );
  const son = [...inbound]
    .sort((a, b) => (b.movement_date || "").localeCompare(a.movement_date || ""))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam Giriş" value={formatNumber(toplamGiris)} unit="ton" />
        <Stat label="Bu Ay Giriş" value={formatNumber(buAy)} unit="ton" />
        <Stat label="Hareket" value={String(rows.length)} unit="adet" />
      </div>
      <ListCard title="Son boşaltmalar (gemiden / araçtan)" empty="Giriş kaydı yok." count={son.length}>
        {son.map((m, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">
                {(m.contract_id && vesselMap[m.contract_id]) || pn(m.product_id)}
              </span>
              <span className="text-gray-500"> · {pn(m.product_id)}</span>
            </span>
            <span className="shrink-0 text-right">
              {formatNumber(m.quantity)} ton
              <span className="ml-2 text-xs text-gray-400">{formatDate(m.movement_date)}</span>
            </span>
          </div>
        ))}
      </ListCard>
      {rows.length === 0 && <EmptyState message="Henüz operasyon hareketi yok." />}
    </div>
  );
}
