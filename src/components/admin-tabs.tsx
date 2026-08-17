"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { UsersManager } from "./users-manager";
import { AuditLog } from "./audit-log";
import { buyersResource, principalsResource, productsResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

// Depolar burada YOK — depo yönetimi yalnızca CRM'den yapılır (bkz.
// crm-tabs.tsx "Depolar" modülü, WarehouseDetailView). Burada AYNI
// warehousesResource'u ikinci bir sade ekran olarak açmak, CRM'deki asıl
// deneyimi (Alt Depolar, Yetkililer, Stok Özeti sekmeleri) atlayan, kafa
// karıştırıcı bir kısayoldu — kullanıcı isteğiyle kaldırıldı.
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
          { key: "principals", label: "Adına Alınanlar" },
          { key: "buyers", label: "Alıcılar" },
          { key: "audit", label: "İşlem Geçmişi" },
        ]}
      />
      {tab === "users" && <UsersManager />}
      {tab === "products" && <ResourceManager config={productsResource} role={role} />}
      {tab === "principals" && (
        <ResourceManager config={principalsResource} role={role} />
      )}
      {tab === "buyers" && (
        <ResourceManager config={buyersResource} role={role} />
      )}
      {tab === "audit" && <AuditLog />}
    </div>
  );
}
