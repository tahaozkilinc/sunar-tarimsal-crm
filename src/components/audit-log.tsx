"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, EmptyState, Modal, Select, Spinner } from "./ui";

type Audit = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  actor_email: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const TABLE_LABELS: Record<string, string> = {
  companies: "Firma",
  contacts: "Kişi",
  products: "Ürün",
  warehouses: "Depo / Fabrika",
  purchase_contracts: "Bağlantı",
  stock_movements: "Stok Hareketi",
  sales_orders: "Satış",
  crm_activities: "Aktivite",
  principals: "Adına Alınan",
};

// updated_at / created_at gibi otomatik alanlar değişiklik özetinde gizlenir.
const IGNORED_KEYS = new Set(["updated_at", "created_at"]);

const ACTION_META: Record<string, { label: string; color: "green" | "blue" | "red" }> = {
  INSERT: { label: "Eklendi", color: "green" },
  UPDATE: { label: "Güncellendi", color: "blue" },
  DELETE: { label: "Silindi", color: "red" },
};

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  return String(v);
}

// Bir UPDATE kaydında değişen alan adlarını bulur.
function changedKeys(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): string[] {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const out: string[] = [];
  keys.forEach((k) => {
    if (IGNORED_KEYS.has(k)) return;
    if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) out.push(k);
  });
  return out;
}

export function AuditLog() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState("");
  const [detail, setDetail] = useState<Audit | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(200);
      if (!on) return;
      setRows((data as Audit[] | null) || []);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase]);

  const tableLabel = (t: string) => TABLE_LABELS[t] || t;
  const filtered = tableFilter ? rows.filter((r) => r.table_name === tableFilter) : rows;

  const detailKeys =
    detail?.action === "UPDATE"
      ? changedKeys(detail.old_data, detail.new_data)
      : Object.keys((detail?.new_data || detail?.old_data || {}) as Record<string, unknown>).filter(
          (k) => !IGNORED_KEYS.has(k),
        );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">İşlem Geçmişi</h2>
        <Select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Tüm tablolar</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Kayıt yok. (Denetim kaydı yalnızca migration çalıştırıldıktan sonra dolar.)" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Zaman</th>
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">Tablo</th>
                <th className="px-4 py-3 font-medium">İşlem</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = ACTION_META[r.action] || { label: r.action, color: "gray" as const };
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(r.changed_at)}</td>
                    <td className="px-4 py-3">{r.actor_email || "—"}</td>
                    <td className="px-4 py-3">{tableLabel(r.table_name)}</td>
                    <td className="px-4 py-3">
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">Detay</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="İşlem Detayı">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-500">Zaman</div>
                <div>{fmtDateTime(detail.changed_at)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Kullanıcı</div>
                <div>{detail.actor_email || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Tablo</div>
                <div>{tableLabel(detail.table_name)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">İşlem</div>
                <div>{(ACTION_META[detail.action] || { label: detail.action }).label}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-border bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
                <span>Alan</span>
                <span>Eski</span>
                <span>Yeni</span>
              </div>
              {detailKeys.length === 0 ? (
                <div className="px-3 py-3 text-gray-500">Değişiklik ayrıntısı yok.</div>
              ) : (
                <div className="divide-y divide-border">
                  {detailKeys.map((k) => (
                    <div key={k} className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2">
                      <span className="truncate font-medium text-gray-700">{k}</span>
                      <span className="truncate text-gray-500">
                        {fmtVal(detail.old_data?.[k])}
                      </span>
                      <span className="truncate">{fmtVal(detail.new_data?.[k])}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
