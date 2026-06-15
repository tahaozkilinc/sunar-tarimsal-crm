import { requireAccess } from "@/lib/auth";
import { ResourceManager } from "@/components/resource-manager";
import { productsResource } from "@/lib/resources";

export default async function ProductsPage() {
  const profile = await requireAccess("/products");
  return <ResourceManager config={productsResource} role={profile.role} />;
}
