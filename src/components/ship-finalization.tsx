"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Spinner } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/resources";
import { Badge } from "./ui";
import { ChevronDown, ChevronRight } from "lucide-react";

type Contract = {
  id: string;
  contract_no: string | null;
  vessel: string | null;
  product_id: string | null;
  quantity: number | null;
  loading_tonnage: number | null;
  unit: string | null;
  status: string;
  etd: string | null;
  eta: string | null;
  surveyor_id: string | null;
  loading_surveyor_id: string | null;
  port_id: string | null;
  loading_port_id: string | null;
  carrier_id: string | null;
  agent_id: string | null;
  loading_agent_id: string | null;
  ship_broker_id: string | null;
};
type Ref = { id: string; name: string };

const statusOpt = (s: string) => CONTRACT_STATUS_OPTIONS.find((o) => o.value === s);
const CONTRACT_COLS =
  "id,contract_no,vessel,product_id,quantity,loading_tonnage,unit,status,etd,eta,surveyor_id,loading_surveyor_id,port_id,loading_port_id,carrier_id,agent_id,loading_agent_id,ship_broker_id";

// Süreç sonucunda 3 farklı tonaj: Sözleşme (quantity), Yükleme (loading_tonnage,
// menşede fiilen yüklenen) ve Boşaltma (stock_movements'tan canlı toplam) —
// ödeme bu üçü arasındaki farka göre yapılabiliyor. Bu rapor, tüm gemileri bir
// arada gösterip aradaki farkları görünür kılar (kullanıcı isteği). Bir gemiye
// tıklayınca altında, o geminin TÜM girilen verilerini (taraflar, tarihler,
// tonajlar) özetleyen bir panel açılır — "gerçekten özet ve finalizasyona
// uygun" (kullanıcı isteği) salt-okunur bir görünüm, ship-ops'un düzenleme
// formları burada tekrarlanmaz.
function Diff({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="text-emerald-600">0 {unit}</span>;
  const positive = value > 0;
  return (
    <span className={positive ? "text-amber-600" : "text-red-600"}>
      {positive ? "+" : ""}{formatNumber(value)} {unit}
    </span>
  );
}

function PartyRow({ label, loading, discharge }: { label: string; loading: string; discharge: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <div className="text-gray-500">{label}</div>
      <div>{loading}</div>
      <div>{discharge}</div>
    </div>
  );
}

export function ShipFinalization() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Ref[]>([]);
  const [companies, setCompanies] = useState<Ref[]>([]);
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [c, p, co, m] = await Promise.all([
        supabase.from("purchase_contracts").select(CONTRACT_COLS).neq("status", "cancelled").order("eta", { ascending: false }),
        supabase.from("products").select("id,name"),
        supabase.from("companies").select("id,name"),
        supabase.from("stock_movements").select("contract_id,quantity").eq("movement_type", "inbound"),
      ]);
      setRows((c.data as Contract[] | null) || []);
      setProducts((p.data as Ref[] | null) || []);
      setCompanies((co.data as Ref[] | null) || []);
      const sums: Record<string, number> = {};
      ((m.data as { contract_id: string | null; quantity: number | null }[] | null) || []).forEach((mv) => {
        if (!mv.contract_id) return;
        sums[mv.contract_id] = (sums[mv.contract_id] || 0) + (Number(mv.quantity) || 0);
      });
      setDrawn(sums);
      setLoading(false);
    })();
  }, [supabase]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name || "Ürünsüz";
  const companyName = (id: string | null) => (id && companies.find((c) => c.id === id)?.name) || "—";

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (rows.length === 0) return <EmptyState message="Henüz bağlantı yok." />;

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-medium">Finalizasyon</div>
      <div className="mb-3 text-xs text-gray-500">
        Sözleşme / Yükleme / Boşaltma tonajları ve aralarındaki farklar — ödeme bu farka göre yapılabiliyor.
        Detay için bir gemiye tıklayın.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-gray-500">
              <th className="py-2 pr-3 font-medium">Gemi / Sözleşme</th>
              <th className="py-2 pr-3 font-medium">Ürün</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 pr-3 text-right font-medium">Sözleşme Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Yükleme Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Fark (Yükleme−Sözleşme)</th>
              <th className="py-2 pr-3 text-right font-medium">Boşaltma Tonaj</th>
              <th className="py-2 pr-3 text-right font-medium">Fark (Boşaltma−Yükleme)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const unit = c.unit || "ton";
              const contracted = Number(c.quantity) || 0;
              const loaded = c.loading_tonnage != null ? Number(c.loading_tonnage) : null;
              const discharged = drawn[c.id] || 0;
              const st = statusOpt(c.status);
              const isOpen = expandedId === c.id;
              return (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-gray-50"
                    onClick={() => setExpandedId(isOpen ? null : c.id)}
                  >
                    <td className="py-2 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        {c.vessel || c.contract_no || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{productName(c.product_id)}</td>
                    <td className="py-2 pr-3">{st && <Badge color={st.color}>{st.label}</Badge>}</td>
                    <td className="py-2 pr-3 text-right">{formatNumber(contracted)} {unit}</td>
                    <td className="py-2 pr-3 text-right">{loaded != null ? `${formatNumber(loaded)} ${unit}` : "-"}</td>
                    <td className="py-2 pr-3 text-right">
                      {loaded != null ? <Diff value={loaded - contracted} unit={unit} /> : "-"}
                    </td>
                    <td className="py-2 pr-3 text-right">{formatNumber(discharged)} {unit}</td>
                    <td className="py-2 pr-3 text-right">
                      {loaded != null ? <Diff value={discharged - loaded} unit={unit} /> : "-"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border bg-gray-50/50 last:border-0">
                      <td colSpan={8} className="px-1 py-4 sm:px-3">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Tarihler</div>
                            <div className="space-y-1 text-sm">
                              <div><span className="text-gray-500">ETD:</span> {formatDate(c.etd)}</div>
                              <div><span className="text-gray-500">ETA:</span> {formatDate(c.eta)}</div>
                            </div>
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Tonajlar</div>
                            <div className="space-y-1 text-sm">
                              <div>Sözleşme: <span className="font-medium">{formatNumber(contracted)} {unit}</span></div>
                              <div>Yükleme: <span className="font-medium">{loaded != null ? `${formatNumber(loaded)} ${unit}` : "-"}</span></div>
                              <div>Boşaltma: <span className="font-medium">{formatNumber(discharged)} {unit}</span></div>
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Operasyon Tarafları</div>
                            <div className="grid grid-cols-3 gap-2 border-b border-border pb-1 text-xs font-medium text-gray-400">
                              <div></div>
                              <div>Yükleme</div>
                              <div>Boşaltma</div>
                            </div>
                            <PartyRow label="Gözetim" loading={companyName(c.loading_surveyor_id)} discharge={companyName(c.surveyor_id)} />
                            <PartyRow label="Liman" loading={companyName(c.loading_port_id)} discharge={companyName(c.port_id)} />
                            <PartyRow label="Acente" loading={companyName(c.loading_agent_id)} discharge={companyName(c.agent_id)} />
                            <div className="mt-2 flex gap-6 text-sm">
                              <div><span className="text-gray-500">Nakliyeci:</span> {companyName(c.carrier_id)}</div>
                              <div><span className="text-gray-500">Gemi Brokeri:</span> {companyName(c.ship_broker_id)}</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
