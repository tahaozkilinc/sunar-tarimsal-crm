"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ShipOpsPage } from "./ship-ops-page";

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
  assigned_to: string | null;
  combined_shipment_id: string | null;
  combined_shipments: { id: string; name: string; vessel: string | null; eta: string | null } | null;
};
type Ref = { id: string; name: string };

type CombinedGroup = {
  shipmentId: string;
  name: string;
  vessel: string | null;
  eta: string | null;
  primaryContractId: string;
  contracts: Contract[];
};

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);
const STATUS_RANK: Record<string, number> = {
  arrived: 4, in_transit: 3, active: 2, draft: 1, completed: 0,
};

function combinedGroupStatus(contracts: Contract[]): string {
  const active = contracts.filter((c) => c.status !== "cancelled" && c.status !== "completed");
  if (active.length === 0) return contracts.every((c) => c.status === "cancelled") ? "cancelled" : "completed";
  let best = active[0].status;
  for (const c of active) {
    if ((STATUS_RANK[c.status] ?? 0) > (STATUS_RANK[best] ?? 0)) best = c.status;
  }
  return best;
}

export function PendingArrivals({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    // Dış roller (nakliyeci/gozetim) fiyat içeren tabloyu okuyamaz; atandıkları
    // gemileri güvenli kolonlu external_contracts görünümünden alırlar. Görünümde
    // FK olmadığından kombine gemi bilgisi ayrı sorguyla eklenir.
    const base = role.endsWith("_view") ? role.slice(0, -"_view".length) : role;
    const isExternal = base === "nakliyeci" || base === "gozetim";
    const contractQuery = isExternal
      ? supabase
          .from("external_contracts")
          .select("id,contract_no,vessel,origin_country,product_id,quantity,unit,eta,status,assigned_to,combined_shipment_id")
          .order("eta", { ascending: true })
      : supabase
          .from("purchase_contracts")
          .select("id,contract_no,vessel,origin_country,product_id,quantity,unit,eta,status,assigned_to,combined_shipment_id,combined_shipments(id,name,vessel,eta)")
          .order("eta", { ascending: true });
    const [c, p, m] = await Promise.all([
      contractQuery,
      supabase.from("products").select("id,name"),
      supabase
        .from("stock_movements")
        .select("contract_id,quantity")
        .eq("movement_type", "inbound"),
    ]);
    if (c.error) setError(c.error.message);
    let contractRows = ((c.data as unknown as Contract[]) || []).map((r) => ({
      ...r,
      combined_shipments: r.combined_shipments ?? null,
    }));
    if (isExternal) {
      const csIds = [...new Set(contractRows.map((r) => r.combined_shipment_id).filter(Boolean))] as string[];
      if (csIds.length > 0) {
        const { data: csData } = await supabase
          .from("combined_shipments")
          .select("id,name,vessel,eta")
          .in("id", csIds);
        const csMap = new Map(
          ((csData as { id: string; name: string; vessel: string | null; eta: string | null }[] | null) || []).map(
            (x) => [x.id, x],
          ),
        );
        contractRows = contractRows.map((r) => ({
          ...r,
          combined_shipments: r.combined_shipment_id ? (csMap.get(r.combined_shipment_id) ?? null) : null,
        }));
      }
    }
    setRows(contractRows);
    setProducts((p.data as Ref[]) || []);
    const sums: Record<string, number> = {};
    ((m.data as { contract_id: string | null; quantity: number | null }[] | null) || []).forEach((mv) => {
      if (!mv.contract_id) return;
      sums[mv.contract_id] = (sums[mv.contract_id] || 0) + (Number(mv.quantity) || 0);
    });
    setDrawn(sums);
    setLoading(false);
  };

  const toggle = (id: string) => {
    setExpandedId((cur) => {
      const next = cur === id ? null : id;
      if (cur === id) load(true);
      return next;
    });
  };

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name || "Ürünsüz";

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );

  const myAssigned = role === "operations" && rows.some((r) => r.assigned_to === userId);
  const accessible =
    role === "operations"
      ? rows.filter((r) => (myAssigned ? r.assigned_to === userId : !r.assigned_to))
      : rows;
  const visible = accessible.filter((r) => r.status !== "cancelled" && r.status !== "completed");

  // Kombine grupları ayır; standalone sözleşmeler ayrı kalır
  const combinedGroupMap = new Map<string, Contract[]>();
  const standalone: Contract[] = [];
  for (const c of visible) {
    if (c.combined_shipment_id) {
      const g = combinedGroupMap.get(c.combined_shipment_id) || [];
      g.push(c);
      combinedGroupMap.set(c.combined_shipment_id, g);
    } else {
      standalone.push(c);
    }
  }
  const combinedGroups: CombinedGroup[] = Array.from(combinedGroupMap.entries()).map(([sid, contracts]) => {
    const info = contracts[0].combined_shipments;
    return {
      shipmentId: sid,
      name: info?.name || "Kombine Gemi",
      vessel: info?.vessel || contracts[0].vessel,
      eta: info?.eta || contracts.reduce((best, c) => {
        if (!c.eta) return best;
        if (!best) return c.eta;
        return c.eta < best ? c.eta : best;
      }, null as string | null),
      primaryContractId: contracts[0].id,
      contracts,
    };
  });

  // Pending / arrived split (hem standalone hem combined)
  const standalonePending = standalone.filter((c) => c.status !== "arrived");
  const standaloneArrived = standalone.filter((c) => c.status === "arrived");
  const combinedPending  = combinedGroups.filter((g) => combinedGroupStatus(g.contracts) !== "arrived");
  const combinedArrived  = combinedGroups.filter((g) => combinedGroupStatus(g.contracts) === "arrived");

  const hasPending = standalonePending.length + combinedPending.length > 0;
  const hasArrived = standaloneArrived.length + combinedArrived.length > 0;

  const renderStandaloneRow = (c: Contract) => {
    const st = statusOpt(c.status);
    const unit = c.unit || "ton";
    const contracted = Number(c.quantity) || 0;
    const drawnQ = drawn[c.id] || 0;
    const remaining = contracted - drawnQ;
    const hasDrawn = drawnQ > 0;
    const isOpen = expandedId === c.id;
    return (
      <div key={c.id} className="border-b border-border last:border-0">
        <button
          onClick={() => toggle(c.id)}
          className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:bg-gray-50"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              )}
              {c.vessel || c.origin_country || c.contract_no || "—"}
            </div>
            <div className="truncate text-xs text-gray-500">
              {productName(c.product_id)} · {formatNumber(c.quantity)} {unit}
              {hasDrawn && ` · Çekilen ${formatNumber(drawnQ)} ${unit}`}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-semibold ${
                remaining < 0
                  ? "text-red-600"
                  : remaining === 0 && hasDrawn
                    ? "text-emerald-600"
                    : "text-amber-600"
              }`}
            >
              {remaining < 0
                ? `Fazla ${formatNumber(-remaining)} ${unit}`
                : `Kalan ${formatNumber(remaining)} ${unit}`}
            </span>
            <span className="text-xs text-gray-500">ETA {formatDate(c.eta)}</span>
            {role === "operations" && c.assigned_to === userId && (
              <Badge color="purple">Sana Atandı</Badge>
            )}
            {st && <Badge color={st.color}>{st.label}</Badge>}
          </div>
        </button>
        {isOpen && (
          <div className="border-t border-border bg-gray-50/50 px-1 py-4 sm:px-3">
            <ShipOpsPage contractId={c.id} embedded />
          </div>
        )}
      </div>
    );
  };

  const renderCombinedGroup = (g: CombinedGroup) => {
    const isOpen = expandedId === g.shipmentId;
    const unit = g.contracts[0]?.unit || "ton";
    const contractedSum = g.contracts.reduce((a, c) => a + (Number(c.quantity) || 0), 0);
    const drawnSum = g.contracts.reduce((a, c) => a + (drawn[c.id] || 0), 0);
    const remaining = contractedSum - drawnSum;
    const status = combinedGroupStatus(g.contracts);
    const st = statusOpt(status);
    const productNames = [...new Set(g.contracts.map((c) => productName(c.product_id)))].join(", ");
    return (
      <div key={g.shipmentId} className="border-b border-border last:border-0">
        <button
          onClick={() => toggle(g.shipmentId)}
          className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:bg-gray-50"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              )}
              {g.name}
              <Badge color="blue">{g.contracts.length} bağlantı</Badge>
            </div>
            <div className="truncate text-xs text-gray-500">
              {productNames} · {formatNumber(contractedSum)} {unit}
              {drawnSum > 0 && ` · Çekilen ${formatNumber(drawnSum)} ${unit}`}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-semibold ${
                remaining < 0
                  ? "text-red-600"
                  : remaining === 0 && drawnSum > 0
                    ? "text-emerald-600"
                    : "text-amber-600"
              }`}
            >
              {remaining < 0
                ? `Fazla ${formatNumber(-remaining)} ${unit}`
                : `Kalan ${formatNumber(remaining)} ${unit}`}
            </span>
            <span className="text-xs text-gray-500">ETA {formatDate(g.eta)}</span>
            {st && <Badge color={st.color}>{st.label}</Badge>}
          </div>
        </button>
        {isOpen && (
          <div className="border-t border-border bg-gray-50/50 px-1 py-4 sm:px-3">
            <ShipOpsPage contractId={g.primaryContractId} embedded />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Bekleyen Gelişler</div>
        <div className="mb-2 text-xs text-gray-500">
          Gemiye tıkla, operasyon paneli hemen altında açılır. Araç girişlerini, depo dağılımını ve
          gözetim/liman/nakliyeci atamasını orada yönet.
        </div>
        {!hasPending ? (
          <EmptyState message="Bekleyen geliş yok." />
        ) : (
          <>
            {combinedPending.map(renderCombinedGroup)}
            {standalonePending.map(renderStandaloneRow)}
          </>
        )}
      </Card>

      {hasArrived && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Gelenler (devam eden operasyon)</div>
          {combinedArrived.map(renderCombinedGroup)}
          {standaloneArrived.map(renderStandaloneRow)}
        </Card>
      )}
    </div>
  );
}
