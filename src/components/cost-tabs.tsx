"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { CostView } from "./cost-view";
import { PositionReport } from "./position-report";
import { YearlyReport } from "./yearly-report";
import { ResourceManager } from "./resource-manager";
import { PendingExpenses } from "./pending-expenses";
import { warehouseExpensesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function CostTabs({ role }: { role: Role }) {
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
            { key: "position", label: "Pozisyon" },
            { key: "expenses", label: "Masraflar" },
            { key: "yearly", label: "Yıllık Karşılaştırma" },
          ]}
        />
      </div>
      {tab === "ships" && <CostView hideTitle />}
      {tab === "position" && <PositionReport />}
      {tab === "expenses" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Operasyon ve depo masrafları: demuraj, navlun, sigorta, gözetim ücreti gibi <b>gemi</b>
            giderleri için Bağlantı seçin (depo boş kalabilir); depolama/elleçleme gibi <b>depo</b>
            giderleri için depo seçin. Bağlantıya bağlanan masraf o geminin maliyet raporuna yansır ve
            kârından düşer. Tutarlar kaydın günündeki TCMB kuruyla USD&apos;ye çevrilir. Teslim şekli
            (incoterm) girilen bağlantılarda beklenen masraf kalemleri otomatik açılır — aşağıda.
          </p>
          <PendingExpenses role={role} />
          <ResourceManager config={warehouseExpensesResource} role={role} hideTitle />
        </div>
      )}
      {tab === "yearly" && <YearlyReport />}
    </div>
  );
}
