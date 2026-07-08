import { requireAccess } from "@/lib/auth";
import { InventoryTabs } from "@/components/inventory-tabs";

export default async function InventoryPage() {
  const profile = await requireAccess("/inventory");
  return <InventoryTabs role={profile.role} />;
}
