import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// TCMB günlük döviz kuru (XML) -> { usd_try, eur_try, eur_usd, date }.
// Tarayıcı CORS engeline takılmadan sunucu tarafında çekilir.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forexSelling(xml: string, code: string): number | null {
  // İlgili <Currency CurrencyCode="USD"> ... <ForexSelling>..</ForexSelling> bloğu.
  const re = new RegExp(
    `<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?<ForexSelling>([0-9.]*)</ForexSelling>`,
    "i",
  );
  const m = xml.match(re);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  // Sadece giriş yapmış kullanıcılar.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date"); // opsiyonel YYYY-MM-DD
  let tcmbUrl = "https://www.tcmb.gov.tr/kurlar/today.xml";
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    tcmbUrl = `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`;
  }

  let xml: string;
  try {
    const res = await fetch(tcmbUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    return NextResponse.json(
      { error: "TCMB kuru alınamadı: " + (e as Error).message },
      { status: 502 },
    );
  }

  const usd_try = forexSelling(xml, "USD");
  const eur_try = forexSelling(xml, "EUR");
  if (!usd_try) return NextResponse.json({ error: "USD kuru okunamadı." }, { status: 502 });

  // <Tarih_Date Tarih="13.06.2026" ...>
  const tm = xml.match(/Tarih="([0-9.]+)"/);
  let iso = new Date().toISOString().slice(0, 10);
  if (tm) {
    const [dd, mm, yy] = tm[1].split(".");
    if (dd && mm && yy) iso = `${yy}-${mm}-${dd}`;
  }

  return NextResponse.json({
    date: iso,
    usd_try,
    eur_try: eur_try ?? null,
    eur_usd: eur_try ? eur_try / usd_try : null,
  });
}
