import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CompanyDetailView } from "@/components/company-detail-view";
import type { Company } from "@/lib/types";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAccess("/crm");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("*").eq("id", id).single();
  if (!data) notFound();
  return <CompanyDetailView company={data as Company} role={profile.role} />;
}
