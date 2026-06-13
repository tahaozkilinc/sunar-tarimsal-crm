import { requireAccess } from "@/lib/auth";
import { ResourceManager } from "@/components/resource-manager";
import { stockMovementsResource } from "@/lib/resources";

export default async function OperationsPage() {
  const profile = await requireAccess("/operations");
  return <ResourceManager config={stockMovementsResource} role={profile.role} />;
}
