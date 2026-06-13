import { requireAccess } from "@/lib/auth";
import { ResourceManager } from "@/components/resource-manager";
import { purchaseContractsResource } from "@/lib/resources";

export default async function PurchasingPage() {
  const profile = await requireAccess("/purchasing");
  return <ResourceManager config={purchaseContractsResource} role={profile.role} />;
}
