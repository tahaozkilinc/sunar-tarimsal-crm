"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { SatisSummary } from "./function-summary";
import { salesOrdersResource, sellableContractsResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function SalesTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("ozet");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Satış</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "ozet", label: "Özet" },
          { key: "contracts", label: "Bağlantılar" },
          { key: "orders", label: "Satışlar" },
        ]}
      />
      {tab === "ozet" && <SatisSummary />}
      {tab === "contracts" && (
        <ResourceManager config={sellableContractsResource} role={role} hideTitle />
      )}
      {tab === "orders" && (
        <ResourceManager config={salesOrdersResource} role={role} hideTitle />
      )}
    </div>
  );
}
