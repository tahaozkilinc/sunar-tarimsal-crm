import { requireAccess } from "@/lib/auth";
import { PurchasingTabs } from "@/components/purchasing-tabs";

export default async function PurchasingPage() {
  const profile = await requireAccess("/purchasing");
  return <PurchasingTabs role={profile.role} />;
}
