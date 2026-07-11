"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { FinanceView } from "./finance-view";
import { CollectionsView } from "./collections-view";
import type { Role } from "@/lib/types";

export function FinanceTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("payments");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Finans</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "payments", label: "Ödemeler (Alış)" },
          { key: "collections", label: "Tahsilatlar (Satış)" },
        ]}
      />
      {tab === "payments" && <FinanceView role={role} hideTitle />}
      {tab === "collections" && <CollectionsView role={role} />}
    </div>
  );
}
