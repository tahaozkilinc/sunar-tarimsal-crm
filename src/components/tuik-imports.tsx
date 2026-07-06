"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Select, Spinner } from "./ui";
import { formatNumber } from "@/lib/format";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

// TÜİK (GTİP bazlı) aylık Türkiye ithalatı ile bizim bağlantı tonajımızın
// karşılaştırması. TÜİK verisi tuik_monthly_imports tablosunda tutulur ve
// şimdilik bu sayfadan elle girilir (TÜİK'in resmî bir API'si yok; kaynak:
// bi.tuik.gov.tr dış ticaret mashup'ı). Bizim taraf her zaman canlı hesaplanır:
// hs_code'u eşleşen ürünün iptal olmayan bağlantıları, ay = ETA (yoksa kayıt tarihi).

type ProductRef = { id: string; name: string; hs_code: string | null };
type TuikRow = { id: string; hs_code: string; year: number; month: number; quantity_ton: number };
type ContractRow = {
  id: string;
  product_id: string | null;
  quantity: number | null;
  status: string;
  eta: string | null;
  created_at: string;
};

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_FULL = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// Vurgu formu: bizim seri marka yeşili, Türkiye'nin kalanı vurgusuz gri.
// (Kontrast telafisi: lejant + tooltip + alttaki tablo görünümü.)
const COLOR_OURS = "#15803d";
const COLOR_REST = "#9ca3af";

// Bağlantının TÜİK ayı: ithalatın gerçekleştiği ay en iyi ETA ile temsil edilir;
// ETA yoksa kayıt tarihi kullanılır.
function contractMonth(c: ContractRow, year: number): number | null {
  const d = c.eta || c.created_at;
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  if (y !== year) return null;
  return Number(d.slice(5, 7)) - 1; // 0-11
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  // Son çizgi her zaman veri maksimumunun ÜSTÜNDE bitmeli, yoksa en yüksek
  // çubuk grafikten taşar (SVG kırpar) ve eksen olduğundan küçük görünür.
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step * 0.001; t += step) ticks.push(t);
  return ticks;
}

// tr-TR biçimli miktarı ayrıştır: "12.500" -> 12500 (binlik ayraç),
// "1.234,56" -> 1234.56, "26,5" -> 26.5, "12.5" -> 12.5.
// Tam sayıya çözülemeyen girdi null döner (kısmi parseFloat kabul edilmez).
function parseTon(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // 1.234,56 — nokta binlik, virgül ondalık
    s = s.replace(/\./g, "").replace(/,/g, ".");
    if ((s.match(/\./g) || []).length > 1) return null;
  } else if (hasComma) {
    const parts = s.split(",");
    // tek virgül ondalıktır; birden çok virgül binlik ayraçtır (1,234,567)
    s = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  } else if (hasDot) {
    const parts = s.split(".");
    // noktadan sonraki tüm gruplar 3 haneliyse tr-TR binlik ayraç (12.500 = 12500)
    if (parts.slice(1).every((g) => g.length === 3)) s = parts.join("");
    else if (parts.length > 2) return null;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function TuikImportsPage({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canEdit = ["admin", "purchasing"].includes(baseRole(role)) && !role.endsWith("_view");

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [hsCode, setHsCode] = useState<string>("");
  const [tuikRows, setTuikRows] = useState<TuikRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // TÜİK veri girişi (admin + satın alma)
  const [editOpen, setEditOpen] = useState(false);
  const [editVals, setEditVals] = useState<string[]>(Array(12).fill(""));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);

  // hs_code'u dolu ürünler — sayfanın karşılaştırabildiği ürün listesi
  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from("products")
        .select("id,name,hs_code")
        .not("hs_code", "is", null)
        .order("name");
      if (err) { setError(err.message); setLoading(false); return; }
      const list = (data as ProductRef[]) || [];
      setProducts(list);
      if (list.length > 0) {
        // Varsayılan: mısır (kullanıcının verdiği kod), yoksa ilk ürün.
        const corn = list.find((p) => p.hs_code === "100590000019");
        setHsCode((corn || list[0]).hs_code!);
      } else {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Seçili GTİP + yıl için TÜİK verisi ve bizim bağlantılar
  useEffect(() => {
    if (!hsCode) return;
    let on = true;
    (async () => {
      setLoading(true);
      setError(null); // önceki geçici hata yeni yüklemeyi engellemesin
      const ids = products.filter((p) => p.hs_code === hsCode).map((p) => p.id);
      const [t, c] = await Promise.all([
        supabase
          .from("tuik_monthly_imports")
          .select("id,hs_code,year,month,quantity_ton")
          .eq("hs_code", hsCode)
          .eq("year", year),
        ids.length
          ? supabase
              .from("purchase_contracts")
              .select("id,product_id,quantity,status,eta,created_at")
              .in("product_id", ids)
              .neq("status", "cancelled")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!on) return;
      const cErr = (c as { error: { message: string } | null }).error;
      if (t.error || cErr) setError((t.error || cErr)!.message);
      const rows = (t.data as TuikRow[] | null) || [];
      setTuikRows(rows);
      setContracts((c.data as ContractRow[] | null) || []);
      const vals: string[] = Array(12).fill("");
      rows.forEach((r) => {
        // 0 da geçerli bir TÜİK değeridir; yalnızca kayıt olmayan ay boş kalır.
        vals[r.month - 1] = String(r.quantity_ton);
      });
      setEditVals(vals);
      setLoading(false);
    })();
    return () => { on = false; };
  }, [supabase, hsCode, year, products]);

  const tuikByMonth = useMemo(() => {
    const arr = Array(12).fill(0);
    tuikRows.forEach((r) => { arr[r.month - 1] = Number(r.quantity_ton) || 0; });
    return arr as number[];
  }, [tuikRows]);

  const oursByMonth = useMemo(() => {
    const arr = Array(12).fill(0);
    contracts.forEach((c) => {
      const m = contractMonth(c, year);
      if (m !== null) arr[m] += Number(c.quantity) || 0;
    });
    return arr as number[];
  }, [contracts, year]);

  const tuikTotal = tuikByMonth.reduce((a, b) => a + b, 0);
  const oursTotal = oursByMonth.reduce((a, b) => a + b, 0);
  const sharePct = tuikTotal > 0 ? (oursTotal / tuikTotal) * 100 : null;
  const hasTuikData = tuikTotal > 0;
  const productName = products.find((p) => p.hs_code === hsCode)?.name || "—";

  const saveTuik = async () => {
    setSaving(true);
    setSaveErr(null);
    const parsed = editVals.map((v, i) => ({ month: i + 1, raw: v.trim() }));
    const bad = parsed.find((p) => p.raw !== "" && parseTon(p.raw) === null);
    if (bad) {
      setSaving(false);
      setSaveErr(`${MONTHS_FULL[bad.month - 1]}: geçersiz sayı "${bad.raw}"`);
      return;
    }
    const rows = parsed
      .filter((p) => p.raw !== "")
      .map((p) => ({
        hs_code: hsCode,
        year,
        month: p.month,
        quantity_ton: parseTon(p.raw)!,
        source: "manual",
      }));
    const emptyMonths = parsed.filter((p) => p.raw === "").map((p) => p.month);
    // Önce upsert: başarısız olursa mevcut kayıtlara dokunulmamış olur.
    const up = rows.length
      ? await supabase
          .from("tuik_monthly_imports")
          .upsert(rows, { onConflict: "hs_code,year,month" })
      : { error: null };
    if (up.error) {
      setSaving(false);
      setSaveErr(up.error.message);
      return;
    }
    // Boş bırakılan aylar silinir (yanlış girişi temizleme yolu).
    const del = emptyMonths.length
      ? await supabase
          .from("tuik_monthly_imports")
          .delete()
          .eq("hs_code", hsCode)
          .eq("year", year)
          .in("month", emptyMonths)
      : { error: null };
    if (del.error) {
      setSaving(false);
      setSaveErr(del.error.message);
      return;
    }
    // Yeniden yükle
    const { data } = await supabase
      .from("tuik_monthly_imports")
      .select("id,hs_code,year,month,quantity_ton")
      .eq("hs_code", hsCode)
      .eq("year", year);
    setTuikRows((data as TuikRow[] | null) || []);
    setSaving(false);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Yüklenemedi: {error}
    </div>
  );
  if (products.length === 0) return (
    <EmptyState message="GTİP (HS) kodu tanımlı ürün yok. Yönetim → Ürünler'den bir ürüne GTİP kodu ekleyin (ör. Mısır → 100590000019)." />
  );

  // ── Grafik geometrisi ──────────────────────────────────────────────────────
  // Kolon: ≤24px kalın, 4px yuvarlak veri ucu (üst), tabanda köşesiz;
  // segmentler arasında 2px yüzey boşluğu; ince hairline grid.
  const W = 860, H = 300;
  const PAD_L = 56, PAD_R = 12, PAD_T = 16, PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const barMax = Math.max(...tuikByMonth, ...oursByMonth, 1);
  const ticks = niceTicks(barMax);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const slotW = plotW / 12;
  const barW = Math.min(24, slotW * 0.55);
  const GAP = 2; // yüzey boşluğu (px)

  return (
    <div className="space-y-4">
      {/* Filtreler — grafiklerin üstünde tek satır */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Select value={hsCode} onChange={(e) => setHsCode(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.hs_code!}>
                {p.name} · GTİP {p.hs_code}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-28">
          <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => currentYear - 3 + i).map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Türkiye İthalatı (TÜİK)</div>
          <div className="mt-0.5 text-2xl font-bold">{hasTuikData ? formatNumber(tuikTotal) : "—"}</div>
          <div className="text-xs text-gray-400">{year} · ton</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Sunar İthalatı</div>
          <div className="mt-0.5 text-2xl font-bold text-brand">{formatNumber(oursTotal)}</div>
          <div className="text-xs text-gray-400">{year} · ton · bağlantılardan</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase text-gray-500">Payımız</div>
          <div className="mt-0.5 text-2xl font-bold">
            {sharePct === null ? "—" : `%${sharePct.toFixed(1)}`}
          </div>
          <div className="text-xs text-gray-400">TÜİK toplamına oran</div>
        </Card>
      </div>

      {/* Grafik */}
      <Card className="p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            {productName} — Aylık İthalat, {year}
          </div>
          {/* Lejant (2 seri) */}
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_OURS }} />
              Sunar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_REST }} />
              Diğer ithalat (TÜİK)
            </span>
          </div>
        </div>
        {!hasTuikData && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {year} için TÜİK verisi henüz girilmemiş — grafik şimdilik yalnızca bizim tonajı gösteriyor.
            {canEdit && " Aşağıdaki \"TÜİK Verisi Gir\" bölümünden aylık değerleri ekleyebilirsiniz."}
          </div>
        )}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="min-w-[640px] w-full"
            role="img"
            aria-label={`${productName} aylık ithalat grafiği, ${year}`}
            onMouseLeave={() => setHover(null)}
          >
            {/* Gridlines — hairline, recessive */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth="1" />
                <text x={PAD_L - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#898781">
                  {t >= 1000
                    ? `${formatNumber(t / 1000, t % 1000 === 0 ? 0 : 1)}k`
                    : formatNumber(t, 0)}
                </text>
              </g>
            ))}
            {/* Taban çizgisi */}
            <line x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} stroke="#c3c2b7" strokeWidth="1" />

            {MONTHS.map((m, i) => {
              const cx = PAD_L + slotW * i + slotW / 2;
              const ours = oursByMonth[i];
              const tuik = tuikByMonth[i];
              const rest = Math.max(0, tuik - ours);
              const x0 = cx - barW / 2;
              const yOursTop = y(ours);
              const oursH = Math.max(0, y(0) - yOursTop);
              // "Diğer" segmenti bizimkinin üstünde; arada 2px yüzey boşluğu.
              const restH = Math.max(0, (rest / yMax) * plotH - (ours > 0 && rest > 0 ? GAP : 0));
              const yRestTop = yOursTop - (ours > 0 && rest > 0 ? GAP : 0) - restH;
              const over = tuik > 0 && ours > tuik; // bizim tonaj TÜİK'i aşarsa işaretle
              const isHover = hover === i;
              return (
                <g key={m}>
                  {/* Hover hit alanı — işaretten büyük */}
                  <rect
                    x={PAD_L + slotW * i}
                    y={PAD_T}
                    width={slotW}
                    height={plotH}
                    fill={isHover ? "rgba(0,0,0,0.03)" : "transparent"}
                    onMouseEnter={() => setHover(i)}
                  />
                  {/* Diğer ithalat (üst segment, 4px yuvalak veri ucu; çok kısa
                      segmentte yuvarlatma taşacağından düz dikdörtgen) */}
                  {rest > 0 && restH > 0 && (
                    restH < 5 ? (
                      <rect x={x0} y={yRestTop} width={barW} height={restH} fill={COLOR_REST} pointerEvents="none" />
                    ) : (
                      <path
                        d={`M ${x0} ${yRestTop + 4}
                            a 4 4 0 0 1 4 -4
                            h ${barW - 8}
                            a 4 4 0 0 1 4 4
                            v ${restH - 4}
                            h ${-barW} Z`}
                        fill={COLOR_REST}
                        pointerEvents="none"
                      />
                    )
                  )}
                  {/* Sunar (taban segmenti; tek segmentse yuvarlak uç onda) */}
                  {ours > 0 && oursH > 0 && (
                    rest > 0 || oursH < 5 ? (
                      <rect x={x0} y={yOursTop} width={barW} height={oursH} fill={COLOR_OURS} pointerEvents="none" />
                    ) : (
                      <path
                        d={`M ${x0} ${yOursTop + 4}
                            a 4 4 0 0 1 4 -4
                            h ${barW - 8}
                            a 4 4 0 0 1 4 4
                            v ${oursH - 4}
                            h ${-barW} Z`}
                        fill={COLOR_OURS}
                        pointerEvents="none"
                      />
                    )
                  )}
                  {over && (
                    <text x={cx} y={yOursTop - 4} textAnchor="middle" fontSize="10" fill="#b45309">
                      ⚠
                    </text>
                  )}
                  {/* Ay etiketi */}
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#898781">
                    {m}
                  </text>
                </g>
              );
            })}

            {/* Tooltip */}
            {hover !== null && (() => {
              const i = hover;
              const tuik = tuikByMonth[i];
              const ours = oursByMonth[i];
              const rest = Math.max(0, tuik - ours);
              const pct = tuik > 0 ? (ours / tuik) * 100 : null;
              const bx = PAD_L + slotW * i + slotW / 2;
              const tw = 172, th = pct !== null ? 74 : 58;
              const tx = Math.min(Math.max(bx - tw / 2, PAD_L), W - PAD_R - tw);
              const ty = PAD_T + 4;
              return (
                <g pointerEvents="none">
                  <rect x={tx} y={ty} width={tw} height={th} rx="6" fill="#0b0b0b" opacity="0.92" />
                  <text x={tx + 10} y={ty + 17} fontSize="11" fontWeight="600" fill="#fff">
                    {MONTHS_FULL[i]} {year}
                  </text>
                  <circle cx={tx + 14} cy={ty + 32} r="4" fill={COLOR_OURS} stroke="#0b0b0b" strokeWidth="1" />
                  <text x={tx + 24} y={ty + 36} fontSize="11" fill="#fff">
                    Sunar: {formatNumber(ours)} ton
                  </text>
                  <circle cx={tx + 14} cy={ty + 48} r="4" fill={COLOR_REST} stroke="#0b0b0b" strokeWidth="1" />
                  <text x={tx + 24} y={ty + 52} fontSize="11" fill="#fff">
                    Diğer: {tuik > 0 ? `${formatNumber(rest)} ton` : "veri yok"}
                  </text>
                  {pct !== null && (
                    <text x={tx + 10} y={ty + 68} fontSize="11" fill="#c3c2b7">
                      Payımız: %{pct.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })()}
          </svg>
        </div>
        <div className="mt-2 text-[11px] text-gray-400">
          Kaynak: TÜİK dış ticaret istatistikleri (bi.tuik.gov.tr) — elle girilir · Sunar verisi
          bağlantılardan canlı hesaplanır (ay = ETA, yoksa kayıt tarihi) · GTİP {hsCode}
        </div>
      </Card>

      {/* Tablo görünümü (erişilebilirlik + kesin değerler) */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Ay</th>
                <th className="px-3 py-2 text-right font-medium">TÜİK Toplam (ton)</th>
                <th className="px-3 py-2 text-right font-medium">Sunar (ton)</th>
                <th className="px-3 py-2 text-right font-medium">Diğer (ton)</th>
                <th className="px-3 py-2 text-right font-medium">Pay</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {MONTHS_FULL.map((m, i) => {
                const tuik = tuikByMonth[i];
                const ours = oursByMonth[i];
                if (tuik === 0 && ours === 0) return null;
                const pct = tuik > 0 ? (ours / tuik) * 100 : null;
                return (
                  <tr key={m} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{m}</td>
                    <td className="px-3 py-2 text-right">{tuik > 0 ? formatNumber(tuik) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-brand">{formatNumber(ours)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {tuik > 0 ? formatNumber(Math.max(0, tuik - ours)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {pct === null ? "—" : `%${pct.toFixed(1)}`}
                      {tuik > 0 && ours > tuik && (
                        <span className="ml-1 text-xs text-amber-600" title="Bizim tonaj TÜİK toplamını aşıyor — TÜİK verisi eksik/eski olabilir">⚠</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tuikByMonth.every((v, i) => v === 0 && oursByMonth[i] === 0) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">Bu yıl için veri yok.</td></tr>
              )}
            </tbody>
            {(tuikTotal > 0 || oursTotal > 0) && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2">TOPLAM</td>
                  <td className="px-3 py-2 text-right">{tuikTotal > 0 ? formatNumber(tuikTotal) : "—"}</td>
                  <td className="px-3 py-2 text-right text-brand">{formatNumber(oursTotal)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {tuikTotal > 0 ? formatNumber(Math.max(0, tuikTotal - oursTotal)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{sharePct === null ? "—" : `%${sharePct.toFixed(1)}`}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* TÜİK veri girişi — admin + satın alma */}
      {canEdit && (
        <Card className="p-4">
          <button
            onClick={() => setEditOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold">TÜİK Verisi Gir — {productName}, {year}</span>
            <span className="text-xs text-brand">{editOpen ? "Kapat" : "Aç"}</span>
          </button>
          {editOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">
                bi.tuik.gov.tr → Dış Ticaret → GTİP {hsCode} sorgusundaki aylık <b>miktar</b> değerlerini
                <b> ton</b> cinsinden girin (TÜİK kg gösteriyorsa 1.000&apos;e bölün). Binlik ayraçlı
                yapıştırma desteklenir: &quot;12.500&quot; = on iki bin beş yüz. Boş bırakılan ay silinir.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {MONTHS.map((m, i) => (
                  <label key={m} className="text-xs text-gray-600">
                    {MONTHS_FULL[i]}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editVals[i]}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditVals((prev) => prev.map((x, j) => (j === i ? v : x)));
                      }}
                      placeholder="ton"
                      className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={saveTuik} disabled={saving} size="sm">
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </Button>
                {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
                {saveFlash && <span className="text-sm font-medium text-emerald-600">✓ Kaydedildi</span>}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
