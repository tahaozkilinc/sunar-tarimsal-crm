import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Kurulum/teşhis sağlık kontrolü.
// GÜVENLİK: Hiçbir gizli değer döndürmez; yalnızca ortam değişkenlerinin
// tanımlı olup olmadığını (boolean) ve veritabanı durumunu raporlar.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
  };

  let supabaseHost: string | null = null;
  if (url) {
    try {
      supabaseHost = new URL(url).host;
    } catch {
      supabaseHost = null;
    }
  }

  const result: {
    status: "ok" | "error";
    service: string;
    time: string;
    env: typeof env;
    supabaseHost: string | null;
    database?: Record<string, unknown>;
    hint?: string;
  } = {
    status: "ok",
    service: "sunar-tarimsal-crm",
    time: new Date().toISOString(),
    env,
    supabaseHost,
  };

  if (!url || !anonKey) {
    result.status = "error";
    result.hint =
      "Ortam değişkenleri eksik. Vercel'de NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlayıp yeniden deploy edin.";
    return NextResponse.json(result, { status: 503 });
  }

  // Service key varsa RLS'yi bypass eder; yoksa anon anahtarla bağlantı testi.
  const db = createClient(url, serviceKey || anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error, count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) {
    const tableMissing =
      /relation .* does not exist|could not find the table|schema cache/i.test(
        error.message,
      );
    const unreachable = /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(
      error.message,
    );
    result.status = "error";
    result.database = {
      reachable: !unreachable,
      profilesTable: tableMissing ? false : undefined,
      error: error.message,
    };
    result.hint = tableMissing
      ? "Veritabanı şeması kurulmamış. Supabase SQL Editor'de 0001_schema.sql → 0002_policies.sql → 0003_seed.sql dosyalarını sırayla çalıştırın."
      : unreachable
        ? "Veritabanına ulaşılamadı. NEXT_PUBLIC_SUPABASE_URL ile anahtarın aynı projeye ait olduğunu doğrulayın."
        : "Veritabanına ulaşıldı ama sorgu hata verdi. Anahtar/URL eşleşmesini ve şemayı kontrol edin.";
    return NextResponse.json(result, { status: 503 });
  }

  const database: Record<string, unknown> = { reachable: true, profilesTable: true };

  if (serviceKey) {
    const { count: adminCount } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    database.profileCount = count ?? 0;
    database.adminExists = (adminCount ?? 0) > 0;
    if (!adminCount) {
      result.status = "error";
      result.hint =
        "Şema kurulu ama admin kullanıcı yok. 0003_seed.sql'i çalıştırın veya Supabase → Authentication → Users'tan admin ekleyin.";
    }
  } else {
    database.note =
      "SUPABASE_SERVICE_ROLE_KEY tanımlı değil; admin kontrolü ve panelden kullanıcı oluşturma çalışmaz.";
  }

  result.database = database;
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
