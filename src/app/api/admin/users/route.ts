import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Çağıranın admin olduğunu doğrular ve service-role istemcisini döndürür.
async function authorizeAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Yetkisiz", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Bu işlem için yetkiniz yok", status: 403 as const };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Vercel ortam değişkenlerine ekleyin.",
      status: 500 as const,
    };

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return { admin };
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { email, password, full_name, role, company_id } = await req.json();
  if (!email || !password || !role)
    return NextResponse.json({ error: "E-posta, şifre ve rol zorunludur." }, { status: 400 });

  const { data, error } = await auth.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Trigger profili oluşturur; rol/ismi (ve nakliyeci ise firmasını) garanti et.
  await auth.admin
    .from("profiles")
    .update({ role, full_name, company_id: company_id || null })
    .eq("id", data.user.id);

  return NextResponse.json({ ok: true, id: data.user.id });
}

export async function DELETE(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id zorunludur." }, { status: 400 });

  const { error } = await auth.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
