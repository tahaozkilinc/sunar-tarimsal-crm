import { requireAccess } from "@/lib/auth";
import { FinanceView } from "@/components/finance-view";

export default async function FinancePage() {
  await requireAccess("/finance");
  return <FinanceView />;
}
