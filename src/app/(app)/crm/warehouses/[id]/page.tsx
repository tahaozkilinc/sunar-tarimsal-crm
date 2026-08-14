import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WarehouseDetailView } from "@/components/warehouse-detail-view";
import type { Warehouse } from "@/lib/types";

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAccess("/crm");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("warehouses").select("*").eq("id", id).single();
  if (!data) notFound();
  const warehouse = data as Warehouse;

  let parentName: string | null = null;
  if (warehouse.parent_id) {
    const { data: parent } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", warehouse.parent_id)
      .maybeSingle();
    parentName = (parent as { name: string } | null)?.name ?? null;
  }

  return <WarehouseDetailView warehouse={warehouse} parentName={parentName} role={profile.role} />;
}
