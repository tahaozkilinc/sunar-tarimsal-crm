"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { InventoryView } from "./inventory-view";
import { warehousesResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

export function InventoryTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("stock");

  // Depo/fabrika yönetimi sekmesi yalnızca yönetebilenlere (admin/operasyon)
  // gösterilir; satış/görüntüleyici sadece stok durumunu görür.
  const canManageWarehouses = ["admin", "operations"].includes(baseRole(role));

  const tabs = [
    { key: "stock", label: "Stok Durumu" },
    ...(canManageWarehouses ? [{ key: "warehouses", label: "Depolar / Fabrikalar" }] : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Stok</h1>
      {canManageWarehouses && <Tabs value={tab} onChange={setTab} tabs={tabs} />}
      {tab === "stock" && <InventoryView hideTitle={canManageWarehouses} />}
      {tab === "warehouses" && canManageWarehouses && (
        <ResourceManager config={warehousesResource} role={role} hideTitle />
      )}
    </div>
  );
}
