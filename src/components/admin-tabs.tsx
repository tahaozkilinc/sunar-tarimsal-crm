"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { UsersManager } from "./users-manager";
import { AuditLog } from "./audit-log";
import { principalsResource, productsResource, warehousesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function AdminTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("users");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Yönetim</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "users", label: "Kullanıcılar" },
          { key: "products", label: "Ürünler" },
          { key: "warehouses", label: "Depolar / Fabrikalar" },
          { key: "principals", label: "Adına Alınanlar" },
          { key: "audit", label: "İşlem Geçmişi" },
        ]}
      />
      {tab === "users" && <UsersManager />}
      {tab === "products" && <ResourceManager config={productsResource} role={role} />}
      {tab === "warehouses" && (
        <ResourceManager config={warehousesResource} role={role} />
      )}
      {tab === "principals" && (
        <ResourceManager config={principalsResource} role={role} />
      )}
      {tab === "audit" && <AuditLog />}
    </div>
  );
}
