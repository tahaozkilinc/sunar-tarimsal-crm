"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { ExternalLink } from "lucide-react";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [c, p] = await Promise.all([
      supabase
        .from("purchase_contracts")
        .select("id,contract_no,vessel,origin_country,product_id,quantity,unit,eta,status,assigned_to")
        .order("eta", { ascending: true }),
      supabase.from("products").select("id,name"),
    ]);
    if (c.error) setError(c.error.message);
    setRows((c.data as Contract[]) || []);
    setProducts((p.data as Ref[]) || []);
    setLoading(false);
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
    return (
      <button
        key={c.id}
        onClick={() => window.open(`/operations/${c.id}`, "_blank")}
        className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-left last:border-0 hover:bg-gray-50"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
            {c.vessel || c.origin_country || c.contract_no || "—"}
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </div>
          <div className="truncate text-xs text-gray-500">
            {productName(c.product_id)} · {formatNumber(c.quantity)} {c.unit || "ton"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">ETA {formatDate(c.eta)}</span>
          {role === "operations" && c.assigned_to === userId && (
            <Badge color="purple">Sana Atandı</Badge>
          )}
          {st && <Badge color={st.color}>{st.label}</Badge>}
          <span className="text-xs font-medium text-brand">Operasyon →</span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-sm font-medium">Bekleyen Gelişler</div>
        <div className="mb-2 text-xs text-gray-500">
          Gemiye tıkla, operasyon sayfası yeni sekmede açılır. Araç girişlerini ve depo dağılımını orada yönet.
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
