import { requireAccess } from "@/lib/auth";
import { SalesTabs } from "@/components/sales-tabs";

export default async function SalesPage() {
  const profile = await requireAccess("/sales");
  return <SalesTabs role={profile.role} />;
}
