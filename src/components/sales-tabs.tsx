"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { SatisSummary } from "./function-summary";
import { SalesDispatch } from "./sales-dispatch";
import { SalesFulfillmentPanel } from "./sales-fulfillment-panel";
import { salesOrdersResource, sellableContractsResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

export function SalesTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("ozet");
  const base = baseRole(role);

  // Satış Operasyon: fiyatı/ticari koşulları hiç görmez, yalnızca araç çıkışı girer.
  if (base === "sales_ops") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Satış Operasyon — Sevkiyat</h1>
        <SalesDispatch role={role} />
      </div>
    );
  }

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
          { key: "dispatch", label: "Sevkiyat" },
        ]}
      />
      {tab === "ozet" && <SatisSummary />}
      {tab === "contracts" && (
        <ResourceManager config={sellableContractsResource} role={role} hideTitle />
      )}
      {tab === "orders" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <ResourceManager config={salesOrdersResource} role={role} hideTitle />
          <SalesFulfillmentPanel />
        </div>
      )}
      {tab === "dispatch" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Depodan veya gemiden doğrudan satılan malların fiili çıkışı. Depo stoğu, satış kaydı
            oluşturulduğu an değil <b>araç fiilen çıktığında</b> düşer — Satış Operasyon rolündeki
            kullanıcılar (fiyat görmeden) sırayla çıkan araçları buradan girer.
          </p>
          <SalesDispatch role={role} />
        </div>
      )}
    </div>
  );
}
