"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { OperasyonSummary } from "./function-summary";
import { PendingArrivals } from "./pending-arrivals";
import { OperationsFulfillmentPanel } from "./operations-fulfillment-panel";
import { ShipFinalization } from "./ship-finalization";
import { PendingExpenses } from "./pending-expenses";
import { warehouseExpensesResource, stockMovementsResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

export function OperationsTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("yukleme");
  const base = baseRole(role);

  // Nakliyeci / Gözetim / Acente yalnızca atandığı gemileri görür: sadece
  // "Bekleyen Gelişler" (yükleme/boşaltma ayrımı ve Finalizasyon onlar için
  // anlamsız — tek liste yeterli). Acente salt-okunur (canWrite'a dahil değil).
  if (base === "nakliyeci" || base === "gozetim" || base === "acente") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Operasyon</h1>
        <PendingArrivals role={role} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Operasyon</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "yukleme", label: "Yükleme" },
          { key: "bosaltma", label: "Boşaltma" },
          { key: "finalizasyon", label: "Finalizasyon" },
          { key: "ozet", label: "Özet" },
          { key: "movements", label: "Stok Hareketleri" },
          { key: "expenses", label: "Masraf Gir" },
        ]}
      />
      {/* Yükleme: henüz varmamış (status != arrived) gemiler — yükleme limanı/
          gözetim/acente ataması, ETD ve yükleme tonajı burada (gemiye
          tıklayınca açılan panelde, bkz. ship-ops-page.tsx). Boşaltmaya özgü
          istatistik/giriş formları bu fazda gizli (phase="loading"). */}
      {tab === "yukleme" && <PendingArrivals role={role} phase="loading" />}
      {/* Boşaltma: varmış (status = arrived), fiilen boşaltılan gemiler. */}
      {tab === "bosaltma" && (
        <div className="space-y-4">
          <OperationsFulfillmentPanel />
          <PendingArrivals role={role} phase="discharge" />
        </div>
      )}
      {tab === "finalizasyon" && <ShipFinalization />}
      {tab === "ozet" && <OperasyonSummary />}
      {tab === "movements" && (
        <ResourceManager config={stockMovementsResource} role={role} hideTitle />
      )}
      {tab === "expenses" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Sahada oluşan masrafları (liman, gümrük, elleçleme, demuraj, gözetim ücreti vb.) buradan
            girin. Bir <b>Bağlantı (Gemi)</b> seçerseniz masraf o geminin maliyetine yansır. Teslim
            şekline göre beklenen kalemler otomatik açılır — aşağıda tutar girmenizi bekleyenler var.
          </p>
          <PendingExpenses role={role} />
          <ResourceManager config={warehouseExpensesResource} role={role} hideTitle />
        </div>
      )}
    </div>
  );
}
