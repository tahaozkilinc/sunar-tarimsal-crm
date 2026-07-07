import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { fetchMonthlyImports } from "@/lib/imports/providers";

// Aylık otomatik yenileme (Vercel Cron). GTİP'i tanımlı tüm ürünler için içinde
// bulunulan yılın Türkiye ithalatını BM Comtrade'den çekip tuik_monthly_imports'a
// yazar. Kullanıcı oturumu olmadığından service-role istemcisi kullanılır (RLS
// bypass); erişim CRON_SECRET ile korunur.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil." }, { status: 500 });
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: products, error: pErr } = await admin
    .from("products")
    .select("name,hs_code")
    .not("hs_code", "is", null);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const year = new Date().getFullYear();
  const codes = Array.from(
    new Set(((products as { hs_code: string }[] | null) || []).map((p) => p.hs_code)),
  );

  const summary: { hs_code: string; count?: number; error?: string }[] = [];
  for (const hs of codes) {
    try {
      const result = await fetchMonthlyImports("comtrade", hs, year);
      if (result.data.length === 0) {
        summary.push({ hs_code: hs, count: 0 });
        continue;
      }
      const rows = result.data.map((d) => ({
        hs_code: hs,
        year,
        month: d.month,
        quantity_ton: d.ton,
        source: `${result.meta.provider}:${result.meta.granularity}`,
      }));
      const { error: upErr } = await admin
        .from("tuik_monthly_imports")
        .upsert(rows, { onConflict: "hs_code,year,month" });
      if (upErr) summary.push({ hs_code: hs, error: upErr.message });
      else summary.push({ hs_code: hs, count: rows.length });
    } catch (e) {
      summary.push({ hs_code: hs, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, year, results: summary });
}

// Vercel Cron, "Authorization: Bearer <CRON_SECRET>" başlığıyla GET çağırır.
// Güvenlik için fail-closed: CRON_SECRET tanımlı DEĞİLSE endpoint çalışmaz
// (aksi halde herkese açık, DB'ye yazan bir uç nokta olurdu).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil; otomatik yenileme kapalı." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  return run();
}
