"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { OperasyonSummary } from "./function-summary";
import { stockMovementsResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function OperationsTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("ozet");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Operasyon</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "ozet", label: "Özet" },
          { key: "movements", label: "Stok Hareketleri" },
        ]}
      />
      {tab === "ozet" && <OperasyonSummary />}
      {tab === "movements" && (
        <ResourceManager config={stockMovementsResource} role={role} hideTitle />
      )}
    </div>
  );
}
