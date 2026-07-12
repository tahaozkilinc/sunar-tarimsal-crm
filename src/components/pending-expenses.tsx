"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Input, Select } from "./ui";
import { formatDate } from "@/lib/format";
import { CURRENCY_OPTIONS, EXPENSE_TYPE_OPTIONS } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { CheckCircle2, Trash2 } from "lucide-react";

// Bekleyen Masraflar: bir bağlantı açılırken teslim şekline (incoterm) göre
// otomatik oluşan masraf kalemleri (0039 trigger'ı) burada listelenir — tutarı
// hâlâ girilmemiş (0) olanlar. Sistem "bunu yazman gerekiyor" diye SORAR;
// kullanıcı burada tutarı girip kaydeder ya da bu gemide geçerli değilse siler.
// admin/operasyon/maliyet ekranlarında ortak kullanılır (kâr/marj göstermez —
// operasyona da güvenle açılabilir).

type ContractRef = {
  id: string;
  vessel: string | null;
  contract_no: string | null;
  incoterm: string | null;
  status: string;
  eta: string | null;
};
type PendingRow = {
  id: string;
  contract_id: string | null;
  expense_type: string;
  amount: number;
  currency: string;
  expense_date: string;
  contract: ContractRef | ContractRef[] | null;
};

const typeLabel = (t: string) => EXPENSE_TYPE_OPTIONS.find((o) => o.value === t)?.label || t;
const asContract = (c: PendingRow["contract"]): ContractRef | null =>
  Array.isArray(c) ? (c[0] ?? null) : c;

export function PendingExpenses({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canWrite = ["admin", "operations", "maliyet"].includes(baseRole(role)) && !role.endsWith("_view");

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; currency: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("warehouse_expenses")
      .select(
        "id,contract_id,expense_type,amount,currency,expense_date,contract:purchase_contracts(id,vessel,contract_no,incoterm,status,eta)",
      )
      .eq("is_auto", true)
      .eq("amount", 0)
      .order("expense_date", { ascending: true });
    const list = ((data as PendingRow[] | null) || []).filter((r) => {
      const c = asContract(r.contract);
      return !c || (c.status !== "cancelled" && c.status !== "completed");
    });
    setRows(list);
    setDrafts((prev) => {
      const next = { ...prev };
      list.forEach((r) => {
        if (!next[r.id]) next[r.id] = { amount: "", currency: r.currency || "USD" };
      });
      return next;
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (row: PendingRow) => {
    const d = drafts[row.id];
    const amount = parseFloat((d?.amount || "").replace(",", "."));
    if (!d?.amount || isNaN(amount) || amount <= 0) {
      setErr((p) => ({ ...p, [row.id]: "Geçerli bir tutar girin." }));
      return;
    }
    setBusy((p) => ({ ...p, [row.id]: true }));
    setErr((p) => ({ ...p, [row.id]: "" }));
    const { error } = await supabase
      .from("warehouse_expenses")
      .update({ amount, currency: d.currency })
      .eq("id", row.id);
    setBusy((p) => ({ ...p, [row.id]: false }));
    if (error) { setErr((p) => ({ ...p, [row.id]: error.message })); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const dismiss = async (row: PendingRow) => {
    if (!window.confirm("Bu masraf kalemi bu bağlantıda geçerli değil mi? Listeden kaldırılacak.")) return;
    setBusy((p) => ({ ...p, [row.id]: true }));
    const { error } = await supabase.from("warehouse_expenses").delete().eq("id", row.id);
    setBusy((p) => ({ ...p, [row.id]: false }));
    if (error) { setErr((p) => ({ ...p, [row.id]: error.message })); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  if (loading || rows.length === 0) return null;

  // Bağlantı bazında grupla
  const groups = new Map<string, { contract: ContractRef | null; items: PendingRow[] }>();
  rows.forEach((r) => {
    const key = r.contract_id || "_";
    const g = groups.get(key) || { contract: asContract(r.contract), items: [] };
    g.items.push(r);
    groups.set(key, g);
  });

  return (
    <Card className="border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
          {rows.length}
        </span>
        <h2 className="text-sm font-semibold">Bekleyen Masraflar</h2>
        <span className="text-xs text-gray-500">
          — teslim şekline göre beklenen, tutarı henüz girilmemiş kalemler
        </span>
      </div>

      <div className="space-y-4">
        {Array.from(groups.entries()).map(([key, g]) => (
          <div key={key} className="rounded-lg border border-amber-200/70 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              {g.contract ? (
                <Link href={`/cost/${g.contract.id}`} className="font-medium text-brand hover:underline">
                  {g.contract.vessel || g.contract.contract_no || "—"}
                </Link>
              ) : (
                <span className="font-medium text-gray-500">Bağlantı silinmiş</span>
              )}
              {g.contract?.incoterm && <Badge color="blue">{g.contract.incoterm}</Badge>}
              {g.contract?.eta && (
                <span className="text-xs text-gray-400">ETA {formatDate(g.contract.eta)}</span>
              )}
            </div>
            <div className="space-y-2">
              {g.items.map((row) => {
                const d = drafts[row.id] || { amount: "", currency: row.currency || "USD" };
                return (
                  <div key={row.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-32 shrink-0 text-sm text-gray-700">{typeLabel(row.expense_type)}</span>
                    <div className="w-32">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Tutar"
                        value={d.amount}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [row.id]: { ...d, amount: e.target.value } }))
                        }
                        onKeyDown={(e) => { if (e.key === "Enter") save(row); }}
                        disabled={!canWrite || busy[row.id]}
                      />
                    </div>
                    <div className="w-24">
                      <Select
                        value={d.currency}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [row.id]: { ...d, currency: e.target.value } }))
                        }
                        disabled={!canWrite || busy[row.id]}
                      >
                        {CURRENCY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.value}</option>
                        ))}
                      </Select>
                    </div>
                    {canWrite && (
                      <>
                        <Button size="sm" onClick={() => save(row)} disabled={busy[row.id]}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Kaydet
                        </Button>
                        <button
                          onClick={() => dismiss(row)}
                          disabled={busy[row.id]}
                          title="Bu gemide geçerli değil — kaldır"
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {err[row.id] && <span className="text-xs text-red-600">{err[row.id]}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
