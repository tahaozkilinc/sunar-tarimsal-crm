import { requireAccess } from "@/lib/auth";
import { CrmTabs } from "@/components/crm-tabs";

export default async function CrmPage() {
  const profile = await requireAccess("/crm");
  return <CrmTabs role={profile.role} />;
}
