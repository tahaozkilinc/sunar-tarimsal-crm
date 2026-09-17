import { Suspense } from "react";
import { requireAccess } from "@/lib/auth";
import { CrmTabs } from "@/components/crm-tabs";

export default async function CrmPage() {
  const profile = await requireAccess("/crm");
  return (
    <Suspense fallback={null}>
      <CrmTabs role={profile.role} />
    </Suspense>
  );
}
