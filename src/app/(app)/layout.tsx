import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PendingScreen } from "@/components/pending-screen";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Rol atanmamış kullanıcılar hiçbir modülü göremez.
  if (profile.role === "pending") {
    return <PendingScreen email={profile.email} />;
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
