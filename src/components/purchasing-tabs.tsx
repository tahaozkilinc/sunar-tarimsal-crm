"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { ShipmentSchedule } from "./shipment-schedule";
import { BaglantiSummary } from "./function-summary";
import { purchaseContractsResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function PurchasingTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("ozet");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Bağlantı</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "ozet", label: "Özet" },
          { key: "contracts", label: "Sözleşmeler" },
          { key: "schedule", label: "Sevkiyat" },
        ]}
      />
      {tab === "ozet" && <BaglantiSummary />}
      {tab === "contracts" && (
        <ResourceManager config={purchaseContractsResource} role={role} hideTitle />
      )}
      {tab === "schedule" && <ShipmentSchedule />}
    </div>
  );
}
