import { requireAccess } from "@/lib/auth";
import { ContractReport } from "@/components/contract-report";

export default async function ContractReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("/cost");
  const { id } = await params;
  return <ContractReport contractId={id} />;
}
