import { requireAccess } from "@/lib/auth";
import { OperationsTabs } from "@/components/operations-tabs";

export default async function OperationsPage() {
  const profile = await requireAccess("/operations");
  return <OperationsTabs role={profile.role} />;
}
