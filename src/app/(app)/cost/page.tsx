import { requireAccess } from "@/lib/auth";
import { CostTabs } from "@/components/cost-tabs";

export default async function CostPage() {
  const profile = await requireAccess("/cost");
  return <CostTabs role={profile.role} />;
}
