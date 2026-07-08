import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMonthlyImports, type ProviderId } from "@/lib/imports/providers";

// GTİP + yıl için Türkiye aylık ithalatını dış kaynaktan (varsayılan: BM Comtrade)
// çekip tuik_monthly_imports tablosuna yazar. Tarayıcı CORS'una takılmadan sunucu
// tarafında çalışır (TCMB kuru çeken /api/fx ile aynı desen).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  // Yazma yetkisi: yalnızca admin + satın alma (RLS de aynısını uygular; burada
  // erken, net hata mesajı için kontrol edilir).
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (prof as { role?: string } | null)?.role || "";
  if (!["admin", "purchasing"].includes(role)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const b = (body ?? {}) as { hs_code?: unknown; year?: unknown; provider?: unknown };
  const hsCode = String(b.hs_code ?? "").replace(/\D/g, "");
  const year = Number(b.year);
  const provider = (["comtrade", "tuik"].includes(String(b.provider))
    ? String(b.provider)
    : "comtrade") as ProviderId;

  if (!/^\d{6,12}$/.test(hsCode)) {
    return NextResponse.json({ error: "Geçersiz GTİP kodu (6–12 hane olmalı)." }, { status: 400 });
  }
  if (!(year >= 2000 && year <= 2100)) {
    return NextResponse.json({ error: "Geçersiz yıl." }, { status: 400 });
  }

  let result;
  try {
    result = await fetchMonthlyImports(provider, hsCode, year);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (result.data.length === 0) {
    return NextResponse.json(
      { error: "Kaynakta bu GTİP/yıl için veri bulunamadı (henüz yayınlanmamış olabilir).", meta: result.meta },
      { status: 404 },
    );
  }

  const rows = result.data.map((d) => ({
    hs_code: hsCode,
    year,
    month: d.month,
    quantity_ton: d.ton,
    source: `${result.meta.provider}:${result.meta.granularity}`,
  }));

  const { error: upErr } = await supabase
    .from("tuik_monthly_imports")
    .upsert(rows, { onConflict: "hs_code,year,month" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    meta: result.meta,
    data: result.data,
  });
}
