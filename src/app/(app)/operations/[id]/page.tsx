import { requireAccess } from "@/lib/auth";
import { ShipOpsPage } from "@/components/ship-ops-page";

export default async function ShipOpsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("/operations");
  const { id } = await params;
  return <ShipOpsPage contractId={id} />;
}
