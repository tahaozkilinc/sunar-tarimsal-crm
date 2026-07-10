"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { OperasyonSummary } from "./function-summary";
import { PendingArrivals } from "./pending-arrivals";
import { ForeignLoading } from "./foreign-loading";
import { stockMovementsResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

export function OperationsTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("arrivals");
  const base = baseRole(role);

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
        <h1 className="text-xl font-bold">Yurtdışı Yükleme</h1>
        <ForeignLoading role={role} />
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
        ]}
      />
      {tab === "arrivals" && <PendingArrivals role={role} />}
      {tab === "foreign" && <ForeignLoading role={role} />}
      {tab === "ozet" && <OperasyonSummary />}
      {tab === "movements" && (
        <ResourceManager config={stockMovementsResource} role={role} hideTitle />
      )}
    </div>
  );
}
