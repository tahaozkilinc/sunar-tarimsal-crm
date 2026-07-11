import { requireAccess } from "@/lib/auth";
import { FinanceTabs } from "@/components/finance-tabs";

export default async function FinancePage() {
  const profile = await requireAccess("/finance");
  return <FinanceTabs role={profile.role} />;
}
