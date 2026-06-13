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

// Profil yoksa /login'e yönlendirir.
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

// Belirli bir yola erişim yoksa panele yönlendirir.
export async function requireAccess(path: string): Promise<Profile> {
  const profile = await requireProfile();
  if (!canAccess(profile.role as Role, path)) redirect("/");
  return profile;
}
