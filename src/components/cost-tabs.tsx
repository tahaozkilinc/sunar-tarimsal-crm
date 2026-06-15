"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { CostView } from "./cost-view";
import { YearlyReport } from "./yearly-report";

export function CostTabs() {
  const [tab, setTab] = useState("ships");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Maliyet / Kâr-Zarar</h1>
      <div className="print:hidden">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "ships", label: "Gemi Bazlı" },
            { key: "yearly", label: "Yıllık Karşılaştırma" },
          ]}
        />
      </div>
      {tab === "ships" && <CostView hideTitle />}
      {tab === "yearly" && <YearlyReport />}
    </div>
  );
}
