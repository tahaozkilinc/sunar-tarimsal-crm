import { requireAccess } from "@/lib/auth";
import { FinanceView } from "@/components/finance-view";

export default async function FinancePage() {
  const profile = await requireAccess("/finance");
  return <FinanceView role={profile.role} />;
}
