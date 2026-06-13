import { requireAccess } from "@/lib/auth";
import { ResourceManager } from "@/components/resource-manager";
import { salesOrdersResource } from "@/lib/resources";

export default async function SalesPage() {
  const profile = await requireAccess("/sales");
  return <ResourceManager config={salesOrdersResource} role={profile.role} />;
}
