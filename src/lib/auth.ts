import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "./types";
import { canAccess } from "./nav";

// Geçerli kullanıcının profilini döndürür (yoksa null).
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

// Profil yoksa /login'e yönlendirir. Pasif kullanıcı için oturumu kapatıp
// açıklayıcı bir mesajla /login'e döner — asıl kilit RLS'te (0040: auth_role/
// is_admin is_active=true ister), bu yalnızca kullanıcıya net bir mesaj verir.
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?deactivated=1");
  }
  return profile;
}

// Belirli bir yola erişim yoksa panele yönlendirir.
export async function requireAccess(path: string): Promise<Profile> {
  const profile = await requireProfile();
  if (!canAccess(profile.role as Role, path)) redirect("/");
  return profile;
}
