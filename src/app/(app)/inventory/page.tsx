import { requireAccess } from "@/lib/auth";
import { InventoryView } from "@/components/inventory-view";

export default async function InventoryPage() {
  await requireAccess("/inventory");
  return <InventoryView />;
}
