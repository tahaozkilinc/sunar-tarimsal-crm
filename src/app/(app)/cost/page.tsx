import { requireAccess } from "@/lib/auth";
import { CostView } from "@/components/cost-view";

export default async function CostPage() {
  await requireAccess("/cost");
  return <CostView />;
}
