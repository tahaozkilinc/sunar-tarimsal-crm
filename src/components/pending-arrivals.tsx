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
};
type Ref = { id: string; name: string };

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);

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
    const [c, p, m] = await Promise.all([
      supabase
        .from("purchase_contracts")
        .select("id,contract_no,vessel,origin_country,product_id,quantity,unit,eta,status,assigned_to")
        .order("eta", { ascending: true }),
      supabase.from("products").select("id,name"),
      supabase
        .from("stock_movements")
        .select("contract_id,quantity")
        .eq("movement_type", "inbound"),
    ]);
    if (c.error) setError(c.error.message);
    setRows((c.data as Contract[]) || []);
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
      if (cur === id) load(true); // panel kapanırken kalan tonajı sessizce tazele
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
  const pending = visible.filter((r) => r.status !== "arrived");
  const arrived = visible.filter((r) => r.status === "arrived");

  const renderRow = (c: Contract) => {
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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Bekleyen Gelişler</div>
        <div className="mb-2 text-xs text-gray-500">
          Gemiye tıkla, operasyon paneli hemen altında açılır. Araç girişlerini, depo dağılımını ve
          gözetim/liman/nakliyeci atamasını orada yönet.
        </div>
        {pending.length === 0 ? <EmptyState message="Bekleyen geliş yok." /> : pending.map(renderRow)}
      </Card>

      {arrived.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Gelenler (devam eden operasyon)</div>
          {arrived.map(renderRow)}
        </Card>
      )}
    </div>
  );
}
