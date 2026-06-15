import { requireAccess } from "@/lib/auth";
import { CostTabs } from "@/components/cost-tabs";

export default async function CostPage() {
  await requireAccess("/cost");
  return <CostTabs />;
}
