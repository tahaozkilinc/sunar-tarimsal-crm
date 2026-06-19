"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, Spinner } from "./ui";
import { formatDate } from "@/lib/format";
import { ACTIVITY_TYPE_OPTIONS } from "@/lib/resources";

type Act = {
  id: string;
  subject: string;
  activity_type: string | null;
  due_date: string | null;
  status: string | null;
  company_id: string | null;
};

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="p-3">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </Card>
  );
}

// CRM aktiviteleri için özet: açık / bugün / gecikmiş + dikkat gerektiren liste.
// companyIds verilirse (ör. operasyonda gözetim/liman/nakliyeci ayrımı) sadece
// o firmalara ait aktiviteler sayılır.
export function CrmActivitySummary({
  module,
  companyIds,
}: {
  module: "purchasing" | "sales" | "operations";
  companyIds?: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Act[]>([]);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const idsKey = companyIds ? companyIds.join(",") : null;

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const [a, c] = await Promise.all([
        supabase
          .from("crm_activities")
          .select("id,subject,activity_type,due_date,status,company_id")
          .eq("module", module),
        supabase.from("companies").select("id,name"),
      ]);
      if (!on) return;
      let arows = (a.data as Act[] | null) || [];
      if (idsKey !== null) {
        const allow = new Set(idsKey ? idsKey.split(",") : []);
        arows = arows.filter((r) => r.company_id && allow.has(r.company_id));
      }
      setRows(arows);
      const cm: Record<string, string> = {};
      ((c.data as { id: string; name: string }[] | null) || []).forEach((x) => (cm[x.id] = x.name));
      setCompanies(cm);
      setLoading(false);
    })();
    return () => {
      on = false;
    };
  }, [supabase, module, idsKey]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );

  const today = new Date().toISOString().slice(0, 10);
  const open = rows.filter((r) => r.status === "open");
  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const dueToday = open.filter((r) => r.due_date === today);
  const typeLabel = (t: string | null) =>
    ACTIVITY_TYPE_OPTIONS.find((o) => o.value === t)?.label || "Aktivite";

  // Dikkat listesi: gecikmiş + bugün, tarihe göre sıralı.
  const attention = [...overdue, ...dueToday].sort((a, b) =>
    (a.due_date || "").localeCompare(b.due_date || ""),
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Açık aktivite" value={open.length} tone="text-gray-900" />
        <Tile label="Bugün" value={dueToday.length} tone="text-amber-600" />
        <Tile label="Gecikmiş" value={overdue.length} tone="text-red-600" />
      </div>

      {attention.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Bugün / Gecikmiş aktiviteler</div>
          <div className="divide-y divide-border">
            {attention.slice(0, 8).map((a) => {
              const isOverdue = !!a.due_date && a.due_date < today;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.subject}</span>
                    <span className="text-gray-500">
                      {" · "}
                      {typeLabel(a.activity_type)}
                      {a.company_id && companies[a.company_id]
                        ? ` · ${companies[a.company_id]}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0">
                    <Badge color={isOverdue ? "red" : "yellow"}>{formatDate(a.due_date)}</Badge>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
