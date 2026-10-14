"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateDbError } from "@/lib/db-errors";
import { formatNumber } from "@/lib/format";
import { Button, Card, Select, Spinner } from "./ui";
import { Trash2 } from "lucide-react";

type ContractSummary = { id: string; contract_no: string | null; vessel: string | null; product_id: string | null; quantity: number | null; unit: string | null };
type LinkedContract = ContractSummary & { linkId: string };
type Ref = { id: string; name: string };

// Aynı gemi/sevkiyata ait birden fazla sözleşme olabiliyor (ör. aynı vapura
// farklı sözleşmelerden yük bindiriliyor) — bu BİLGİ amaçlı bir
// ilişkilendirmedir, tonaj hesaplarını (Finalizasyon dahil) ETKİLEMEZ; o
// hesaplar hâlâ bu sayfanın KENDİ sözleşmesine göre yapılır. Burası yalnızca
// "bu gemide ayrıca şu sözleşmeler de var" diye not düşmek/listelemek içindir
// (kullanıcı isteği: "sözleşmeler olabiliyor, operasyonun").
export function ContractLinks({ contractId, canWrite }: { contractId: string; canWrite: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [links, setLinks] = useState<LinkedContract[]>([]);
  const [candidates, setCandidates] = useState<Ref[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from("contract_links").select("id,related_contract_id").eq("contract_id", contractId),
      supabase.from("contract_links").select("id,contract_id").eq("related_contract_id", contractId),
    ]);
    const pairs = [
      ...((a.data as { id: string; related_contract_id: string }[] | null) || []).map((r) => ({ linkId: r.id, otherId: r.related_contract_id })),
      ...((b.data as { id: string; contract_id: string }[] | null) || []).map((r) => ({ linkId: r.id, otherId: r.contract_id })),
    ];
    const otherIds = pairs.map((p) => p.otherId);
    const [contractsRes, productsRes, openRes] = await Promise.all([
      otherIds.length
        ? supabase.from("purchase_contracts").select("id,contract_no,vessel,product_id,quantity,unit").in("id", otherIds)
        : Promise.resolve({ data: [] as ContractSummary[] }),
      supabase.from("products").select("id,name"),
      supabase.from("purchase_contracts").select("id,contract_no,vessel").neq("status", "cancelled").neq("id", contractId),
    ]);
    const byId = new Map(((contractsRes.data as ContractSummary[] | null) || []).map((c) => [c.id, c]));
    setLinks(
      pairs
        .map((p) => ({ linkId: p.linkId, c: byId.get(p.otherId) }))
        .filter((x): x is { linkId: string; c: ContractSummary } => !!x.c)
        .map((x) => ({ linkId: x.linkId, ...x.c })),
    );
    const pm: Record<string, string> = {};
    ((productsRes.data as Ref[] | null) || []).forEach((p) => (pm[p.id] = p.name));
    setProducts(pm);
    const linked = new Set(otherIds);
    setCandidates(
      ((openRes.data as { id: string; contract_no: string | null; vessel: string | null }[] | null) || [])
        .filter((c) => !linked.has(c.id))
        .map((c) => ({ id: c.id, name: c.vessel || c.contract_no || "—" })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const addLink = async () => {
    if (!selected) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("contract_links").insert({ contract_id: contractId, related_contract_id: selected });
    setSaving(false);
    if (error) { setErr(translateDbError(error)); return; }
    setSelected("");
    await load();
  };

  const removeLink = async (linkId: string) => {
    if (!window.confirm("Bu ilişki kaldırılsın mı?")) return;
    setSaving(true);
    await supabase.from("contract_links").delete().eq("id", linkId);
    await load();
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-3"><Spinner /></div>;

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-semibold">İlişkili Sözleşmeler</div>
      <div className="mb-3 text-xs text-gray-500">
        Bu gemiye/sevkiyata ait başka sözleşmeler varsa buradan bağlayın — yalnızca bilgi/referans içindir,
        tonaj hesaplarını etkilemez.
      </div>
      {links.length === 0 ? (
        <div className="text-xs text-gray-400">İlişkili sözleşme yok.</div>
      ) : (
        <div className="mb-3 space-y-1.5">
          {links.map((l) => (
            <div key={l.linkId} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <div className="min-w-0 truncate">
                <span className="font-medium">{l.vessel || l.contract_no || "—"}</span>
                <span className="text-gray-500"> · {products[l.product_id || ""] || "Ürünsüz"} · {formatNumber(l.quantity)} {l.unit || "ton"}</span>
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => removeLink(l.linkId)}
                  disabled={saving}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Kaldır"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Sözleşme seçin...</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button onClick={addLink} disabled={!selected || saving} size="sm">Ekle</Button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      )}
    </Card>
  );
}
