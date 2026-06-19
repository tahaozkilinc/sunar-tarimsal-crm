"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";

// Operasyon iş ortakları (gözetim/liman/nakliyeci) için gemi/tonaj verisi.
// Veri ayrıca SAKLANMAZ; her zaman gemi atamalarından (purchase_contracts'taki
// surveyor_id/port_id/carrier_id) canlı türetilir, böylece hiç bayatlamaz.
// Bir gemiye taraf ataması ship-ops-page'deki "Operasyon Tarafları" kartından
// (assign_ship_parties) yapılır.

type OpsType = "surveyor" | "port" | "carrier";

const PARTY_FIELD: Record<OpsType, "surveyor_id" | "port_id" | "carrier_id"> = {
  surveyor: "surveyor_id",
  port: "port_id",
  carrier: "carrier_id",
};

const TYPE_LABEL: Record<OpsType, string> = {
  surveyor: "Gözetim",
  port: "Liman",
  carrier: "Nakliyeci",
};

// Gemi sayılırken/tonaj toplanırken iptal edilmiş bağlantılar hariç tutulur.
// "Aktif/yolda" = halen süreçte olan gemiler.
const ACTIVE = new Set(["active", "in_transit"]);
const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tek firma: bu gözetim/liman/nakliyeci firmasına atanmış gemiler + toplamlar.
// Firma detay sayfasında, tedarikçi/müşteri "Operasyonel Özet"inin karşılığı.
// ---------------------------------------------------------------------------
type Ship = {
  id: string;
  vessel: string | null;
  contract_no: string | null;
  product_id: string | null;
  quantity: number | null;
  status: string;
  eta: string | null;
};

export function CompanyShipStats({
  companyId,
  companyType,
}: {
  companyId: string;
  companyType: OpsType;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ships, setShips] = useState<Ship[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const field = PARTY_FIELD[companyType];

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [pc, pr] = await Promise.all([
        supabase
          .from("purchase_contracts")
          .select("id,vessel,contract_no,product_id,quantity,status,eta")
          .eq(field, companyId)
          .neq("status", "cancelled"),
        supabase.from("products").select("id,name"),
      ]);
      if (!on) return;
      setShips((pc.data as Ship[] | null) || []);
      const m: Record<string, string> = {};
      ((pr.data as { id: string; name: string }[] | null) || []).forEach((p) => (m[p.id] = p.name));
      setProducts(m);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, companyId, field]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );

  const totalTon = ships.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
  const activeShips = ships.filter((s) => ACTIVE.has(s.status));
  const activeTon = activeShips.reduce((a, s) => a + (Number(s.quantity) || 0), 0);
  const pn = (id: string | null) => (id && products[id]) || "Ürünsüz";
  const sorted = [...ships].sort((a, b) => (a.eta || "9999").localeCompare(b.eta || "9999"));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Atanan Gemiler · {TYPE_LABEL[companyType]}</h3>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Gemi" value={String(ships.length)} sub={`${activeShips.length} aktif/yolda`} />
        <Tile label="Toplam Ton" value={formatNumber(totalTon)} />
        <Tile label="Aktif/Yolda Ton" value={formatNumber(activeTon)} />
      </div>

      {ships.length === 0 ? (
        <div className="rounded-lg border border-border p-3 text-sm text-gray-500">
          Bu firmaya atanmış gemi yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Gemi / Sözleşme</th>
                <th className="px-3 py-2 font-medium">Ürün</th>
                <th className="px-3 py-2 text-right font-medium">Ton</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const so = statusOpt(s.status);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{s.vessel || s.contract_no || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{pn(s.product_id)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(s.quantity)}</td>
                    <td className="px-3 py-2">{so && <Badge color={so.color}>{so.label}</Badge>}</td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(s.eta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tüm firmalar: bir operasyon türündeki (gözetim/liman/nakliyeci) firmaların
// gemi/ton dağılımı. CRM'de firma listesinin üstünde "hangi firmada ne kadar
// var" özeti. Sadece en az bir gemisi olan firmalar listelenir.
// ---------------------------------------------------------------------------
type PartnerRow = {
  companyId: string;
  name: string;
  ships: number;
  activeShips: number;
  ton: number;
};

export function OperationPartnerStats({ companyType }: { companyType: OpsType }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const field = PARTY_FIELD[companyType];

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [co, pc] = await Promise.all([
        supabase.from("companies").select("id,name").eq("type", companyType),
        supabase
          .from("purchase_contracts")
          .select(`${field},quantity,status`)
          .not(field, "is", null)
          .neq("status", "cancelled"),
      ]);
      if (!on) return;
      const names: Record<string, string> = {};
      ((co.data as { id: string; name: string }[] | null) || []).forEach((c) => (names[c.id] = c.name));
      const agg = new Map<string, PartnerRow>();
      ((pc.data as Record<string, unknown>[] | null) || []).forEach((r) => {
        const cid = r[field] as string | null;
        if (!cid) return;
        const e =
          agg.get(cid) ||
          { companyId: cid, name: names[cid] || "—", ships: 0, activeShips: 0, ton: 0 };
        e.ships += 1;
        e.ton += Number(r.quantity) || 0;
        if (ACTIVE.has(r.status as string)) e.activeShips += 1;
        agg.set(cid, e);
      });
      setRows(
        Array.from(agg.values()).sort((a, b) => b.ton - a.ton || b.ships - a.ships),
      );
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, companyType, field]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );

  if (rows.length === 0) return null; // hiç atama yoksa özet gösterme

  const totalShips = rows.reduce((a, r) => a + r.ships, 0);
  const totalTon = rows.reduce((a, r) => a + r.ton, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Tile label={`${TYPE_LABEL[companyType]} firması`} value={String(rows.length)} />
        <Tile label="Toplam Gemi" value={String(totalShips)} />
        <Tile label="Toplam Ton" value={formatNumber(totalTon)} />
      </div>
      <Card className="p-4">
        <div className="mb-2 text-sm font-medium">{TYPE_LABEL[companyType]} bazında dağılım</div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <Link
              key={r.companyId}
              href={`/crm/${r.companyId}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 text-sm hover:bg-gray-50"
            >
              <span className="min-w-0 truncate font-medium">{r.name}</span>
              <span className="shrink-0 text-right text-gray-600">
                {r.ships} gemi
                {r.activeShips > 0 && <span className="text-gray-400"> ({r.activeShips} aktif)</span>}
                <span className="ml-2 font-semibold text-gray-900">{formatNumber(r.ton)} ton</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
