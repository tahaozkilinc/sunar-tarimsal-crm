"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { OperasyonSummary } from "./function-summary";
import { PendingArrivals } from "./pending-arrivals";
import { OperationsFulfillmentPanel } from "./operations-fulfillment-panel";
import { ForeignLoading } from "./foreign-loading";
import { PendingExpenses } from "./pending-expenses";
import { warehouseExpensesResource, stockMovementsResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import { L } from "@/lib/i18n";
import type { Role } from "@/lib/types";

export function OperationsTabs({ role, language }: { role: Role; language: "tr" | "en" }) {
  const [tab, setTab] = useState("arrivals");
  const base = baseRole(role);
  const isEn = language === "en";

  // Nakliyeci / Gözetim yalnızca atandığı gemilerde tonaj girer: sadece "Bekleyen Gelişler".
  if (base === "nakliyeci" || base === "gozetim") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Operasyon</h1>
        <PendingArrivals role={role} />
      </div>
    );
  }

  // Acente: yalnızca yurtdışı yükleme ekranı (kendi bağlantıları, RLS).
  if (base === "acente") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{L(isEn, "Yurtdışı Yükleme", "Overseas Loading")}</h1>
        <ForeignLoading role={role} language={language} />
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
          { key: "arrivals", label: "Bekleyen Gelişler" },
          { key: "foreign", label: "Yurtdışı Yükleme" },
          { key: "ozet", label: "Özet" },
          { key: "movements", label: "Stok Hareketleri" },
          { key: "expenses", label: "Masraf Gir" },
        ]}
      />
      {tab === "arrivals" && (
        <div className="space-y-4">
          <OperationsFulfillmentPanel />
          <PendingArrivals role={role} />
        </div>
      )}
      {tab === "foreign" && <ForeignLoading role={role} language={language} />}
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
