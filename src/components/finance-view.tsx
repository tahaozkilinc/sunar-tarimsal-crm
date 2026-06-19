"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner } from "./ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatUsd, toUsd } from "@/lib/fx";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { CheckCircle2, Search } from "lucide-react";

type Row = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  payment_due_date: string | null;
  eta: string | null;
  status: string;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  usd_try: number | null;
  eur_try: number | null;
  supplier_name: string | null;
  product_name: string | null;
  is_paid: boolean | null;
  payment_ref: string | null;
  paid_at: string | null;
};

const MONTHS_TR_FULL = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function paymentAmount(r: Row): { native: number; usd: number | null } {
  const native = (Number(r.quantity) || 0) * (Number(r.price) || 0);
  const usd = toUsd(native, r.currency, r.usd_try, r.eur_try);
  return { native, usd };
}

export function FinanceView({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Eski sürüm view tespiti: view tutar kolonlarını döndürmüyorsa (migration
  // 0016 çalıştırılmadıysa) "price" anahtarı satır nesnesinde hiç bulunmaz.
  const [needsMigration, setNeedsMigration] = useState(false);
  // 0017 (ödeme onayı) çalıştırılmadıysa "is_paid" anahtarı hiç bulunmaz.
  const [needsPaidMigration, setNeedsPaidMigration] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const canConfirm = role === "admin" || role === "finans";
  const [payRow, setPayRow] = useState<Row | null>(null);
  const [payRef, setPayRef] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("payment_schedule")
        .select("*")
        .order("payment_due_date", { ascending: true });
      if (error) setError(error.message);
      const list = (data as Row[]) || [];
      setRows(list);
      setNeedsMigration(list.length > 0 && !("price" in list[0]));
      setNeedsPaidMigration(list.length > 0 && !("is_paid" in list[0]));
      setLoading(false);
    })();
  }, [supabase]);

  const openPayModal = (row: Row) => {
    setPayRow(row);
    setPayRef(row.payment_ref || "");
    setPayErr(null);
  };

  const confirmPaid = async () => {
    if (!payRow) return;
    if (!payRef.trim()) { setPayErr("Ödeme ID girin."); return; }
    setPaySaving(true);
    setPayErr(null);
    const { error: err } = await supabase.rpc("set_contract_paid", {
      p_contract_id: payRow.id,
      p_paid: true,
      p_payment_ref: payRef.trim(),
    });
    setPaySaving(false);
    if (err) { setPayErr(err.message); return; }
    setRows(prev => prev.map(r => r.id === payRow.id
      ? { ...r, is_paid: true, payment_ref: payRef.trim(), paid_at: new Date().toISOString() }
      : r));
    setPayRow(null);
  };

  const unmarkPaid = async (row: Row) => {
    if (!window.confirm("Bu bağlantı ödenmedi olarak işaretlensin mi?")) return;
    const { error: err } = await supabase.rpc("set_contract_paid", {
      p_contract_id: row.id,
      p_paid: false,
    });
    if (err) { setError(err.message); return; }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_paid: false, paid_at: null } : r));
  };

  const calItems = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      if (!r.payment_due_date) return;
      const d = new Date(r.payment_due_date.slice(0, 10) + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() === calMonth.getFullYear() && d.getMonth() === calMonth.getMonth()) {
        const key = String(d.getDate());
        const arr = map.get(key) || [];
        arr.push(r);
        map.set(key, arr);
      }
    });
    return map;
  }, [rows, calMonth]);

  const statusLabel = (s: string) =>
    CONTRACT_STATUS_OPTIONS.find((o) => o.value === s)?.label || s;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = (d: string | null) => {
    if (!d) return false;
    const x = new Date(d.slice(0, 10) + "T00:00:00");
    return !Number.isNaN(x.getTime()) && x < today;
  };
  const daysTo = (d: string | null) => {
    if (!d) return null;
    const x = new Date(d.slice(0, 10) + "T00:00:00");
    if (Number.isNaN(x.getTime())) return null;
    return Math.round((x.getTime() - today.getTime()) / 86400000);
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLocaleLowerCase("tr");
    return [r.contract_no, r.vessel, r.supplier_name, r.product_name]
      .some((v) => (v || "").toLocaleLowerCase("tr").includes(q));
  });

  // Summary totals
  const upcomingRows = filtered.filter((r) => !isOverdue(r.payment_due_date));
  const overdueRows  = filtered.filter((r) =>  isOverdue(r.payment_due_date));
  const totalUpcomingUsd = upcomingRows.reduce((a, r) => {
    const u = paymentAmount(r).usd;
    return u !== null ? a + u : a;
  }, 0);
  const totalOverdueUsd = overdueRows.reduce((a, r) => {
    const u = paymentAmount(r).usd;
    return u !== null ? a + u : a;
  }, 0);
  const soonCount = filtered.filter((r) => {
    const n = daysTo(r.payment_due_date);
    return n !== null && n >= 0 && n <= 7;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Finans — Öngörülen Ödemeler</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Söz. no / gemi / tedarikçi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8 sm:w-72"
          />
        </div>
      </div>

      {needsMigration && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold">Ödeme tutarları için veritabanı güncellemesi gerekiyor.</div>
          <div className="mt-1 text-red-700">
            Supabase → SQL Editor&apos;de{" "}
            <code className="rounded bg-red-100 px-1">supabase/migrations/0016_payment_schedule_v2.sql</code>{" "}
            dosyasını çalıştırın. Bu güncelleme yapılmadan tutarlar görünmez (yalnızca tarihler).
          </div>
        </div>
      )}

      {needsPaidMigration && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold">Ödeme onayı için veritabanı güncellemesi gerekiyor.</div>
          <div className="mt-1 text-red-700">
            Supabase → SQL Editor&apos;de{" "}
            <code className="rounded bg-red-100 px-1">supabase/migrations/0017_payment_confirmation.sql</code>{" "}
            dosyasını çalıştırın. Bu güncelleme yapılmadan &quot;ödendi&quot; işaretlenemez.
          </div>
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-gray-500">Yaklaşan Ödemeler</div>
          <div className="mt-1 text-lg font-bold">{upcomingRows.length} bağlantı</div>
          <div className="text-xs text-brand font-medium mt-0.5">{formatUsd(totalUpcomingUsd, 0)}</div>
        </Card>
        {overdueRows.length > 0 && (
          <Card className="p-4 border-red-200 bg-red-50">
            <div className="text-xs text-red-600">Geciken Ödemeler</div>
            <div className="mt-1 text-lg font-bold text-red-700">{overdueRows.length} bağlantı</div>
            <div className="text-xs text-red-600 font-medium mt-0.5">{formatUsd(totalOverdueUsd, 0)}</div>
          </Card>
        )}
        {soonCount > 0 && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="text-xs text-amber-700">Bu Hafta</div>
            <div className="mt-1 text-lg font-bold text-amber-800">{soonCount} ödeme</div>
            <div className="text-xs text-amber-600 mt-0.5">7 gün içinde</div>
          </Card>
        )}
      </div>

      {(overdueRows.length > 0 || soonCount > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️{" "}
          {overdueRows.length > 0 && (
            <span className="font-semibold">{overdueRows.length} ödemenin tarihi geçti ({formatUsd(totalOverdueUsd, 0)}). </span>
          )}
          {soonCount > 0 && <span>{soonCount} ödeme önümüzdeki 7 gün içinde.</span>}
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ödeme Takvimi</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
            >‹</button>
            <span className="w-32 text-center text-sm font-medium">
              {MONTHS_TR_FULL[calMonth.getMonth()]} {calMonth.getFullYear()}
            </span>
            <button
              onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
              className="rounded-lg px-2.5 py-1 text-sm hover:bg-gray-100"
            >›</button>
          </div>
        </div>
        {(() => {
          const year = calMonth.getFullYear();
          const month = calMonth.getMonth();
          const leading = (new Date(year, month, 1).getDay() + 6) % 7;
          const dim = new Date(year, month + 1, 0).getDate();
          const cells: (number | null)[] = [];
          for (let i = 0; i < leading; i++) cells.push(null);
          for (let d = 1; d <= dim; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);
          const now = new Date();
          const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : -1;
          return (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_TR.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-medium text-gray-500">{w}</div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={i} className="min-h-[72px] rounded bg-gray-50/40" />;
                const items = calItems.get(String(d)) || [];
                const dayTotal = items.reduce((a, r) => {
                  const u = paymentAmount(r).usd;
                  return u !== null ? a + u : a;
                }, 0);
                return (
                  <div
                    key={i}
                    className={`min-h-[72px] rounded border p-1 ${
                      d === todayDay ? "border-brand bg-brand/5" : "border-border"
                    }`}
                  >
                    <div className="mb-0.5 text-right text-xs text-gray-400">{d}</div>
                    <div className="space-y-0.5">
                      {items.slice(0, 2).map((r) => {
                        const { native } = paymentAmount(r);
                        return (
                          <div
                            key={r.id}
                            className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                              isOverdue(r.payment_due_date)
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                            title={`${r.contract_no || "—"} · ${r.supplier_name || ""} · ${r.product_name || ""}`}
                          >
                            <div className="truncate">{r.vessel || r.contract_no || "—"}</div>
                            {native > 0 && (
                              <div className="truncate opacity-75">
                                {formatMoney(native, r.currency || "USD")}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {items.length > 2 && (
                        <div className="text-[10px] text-gray-500">+{items.length - 2} daha</div>
                      )}
                      {items.length > 0 && dayTotal > 0 && (
                        <div className="text-[10px] font-semibold text-gray-600">
                          {formatUsd(dayTotal, 0)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Liste yüklenemedi: {error}
          <div className="mt-1 text-xs text-red-500">
            0016_payment_schedule_v2.sql migration&apos;ını çalıştırın.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Öngörülen ödeme tarihi girilmiş bağlantı yok." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Sözleşme / Gemi</th>
                <th className="px-4 py-3 font-medium">Tedarikçi</th>
                <th className="px-4 py-3 font-medium">Ürün</th>
                <th className="px-4 py-3 text-right font-medium">Miktar</th>
                <th className="px-4 py-3 text-right font-medium">Ödenecek Tutar</th>
                <th className="px-4 py-3 text-right font-medium">USD Karşılığı</th>
                <th className="px-4 py-3 font-medium">Ödeme Tarihi</th>
                <th className="px-4 py-3 font-medium">ETA</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Ödeme</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const { native, usd } = paymentAmount(r);
                const n = daysTo(r.payment_due_date);
                const overdue = isOverdue(r.payment_due_date);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.vessel || r.contract_no || "—"}</div>
                      {r.vessel && r.contract_no && (
                        <div className="text-xs text-gray-400">{r.contract_no}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.supplier_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.product_name || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatNumber(r.quantity)} {r.quantity ? "ton" : ""}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${overdue ? "text-red-600" : ""}`}>
                      {native > 0 ? formatMoney(native, r.currency || "USD") : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right ${overdue ? "text-red-500" : "text-gray-600"}`}>
                      {usd !== null && usd > 0 ? formatUsd(usd, 0) : "—"}
                    </td>
                    <td className={`px-4 py-3 ${overdue ? "font-semibold text-red-600" : ""}`}>
                      {formatDate(r.payment_due_date)}
                      {overdue && " ⚠ geçti"}
                      {!overdue && n !== null && n <= 7 && n >= 0 && (
                        <div className="text-xs text-amber-600">{n === 0 ? "bugün" : `${n} gün kaldı`}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.eta)}</td>
                    <td className="px-4 py-3">{statusLabel(r.status)}</td>
                    <td className="px-4 py-3">
                      {needsPaidMigration ? (
                        <Badge color="gray">—</Badge>
                      ) : r.is_paid ? (
                        <div>
                          <Badge color="green">✓ Ödendi</Badge>
                          {r.payment_ref && (
                            <div className="mt-1 text-xs text-gray-500">ID: {r.payment_ref}</div>
                          )}
                          {canConfirm && (
                            <button
                              onClick={() => unmarkPaid(r)}
                              className="mt-1 block text-xs text-gray-400 hover:text-red-500 hover:underline"
                            >
                              Geri al
                            </button>
                          )}
                        </div>
                      ) : canConfirm ? (
                        <Button size="sm" variant="secondary" onClick={() => openPayModal(r)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ödendi İşaretle
                        </Button>
                      ) : (
                        <Badge color="yellow">Bekliyor</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-xs" colSpan={4}>TOPLAM ({filtered.length} bağlantı)</td>
                <td className="px-4 py-3 text-right text-xs">
                  {/* Native currencies differ – omit sum */}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatUsd(filtered.reduce((a, r) => {
                    const u = paymentAmount(r).usd;
                    return u !== null ? a + u : a;
                  }, 0), 0)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal open={!!payRow} onClose={() => setPayRow(null)} title="Ödendi İşaretle">
        {payRow && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{payRow.vessel || payRow.contract_no || "—"}</span>
              {" "}için ödeme onayı. Ödemeye ait ID/referansı girin.
            </div>
            <Field label="Ödeme ID" required>
              <Input
                autoFocus
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Banka referans no, dekont no..."
                onKeyDown={(e) => { if (e.key === "Enter") confirmPaid(); }}
              />
            </Field>
            {payErr && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {payErr}
              </div>
            )}
            <Button onClick={confirmPaid} disabled={paySaving} className="w-full">
              {paySaving ? "Kaydediliyor..." : "Ödendi Olarak Kaydet"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
