import { requireAccess } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";

export default async function AdminPage() {
  const profile = await requireAccess("/admin");
  return <AdminTabs role={profile.role} />;
}
