"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { InventoryView } from "./inventory-view";
import { StockMap } from "./stock-map";
import { stockMovementsResource } from "@/lib/resources";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";

export function InventoryTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("stock");

  // Stok hareketi yalnızca yönetebilenlere (admin/operasyon). Stok Durumu ve
  // Harita herkese görünür (görüntüleme). Depo/fabrika yönetimi CRM ->
  // Depolar'a taşındı (bkz. crm-tabs.tsx) — burada tekrarlanmıyor.
  const canManage = ["admin", "operations"].includes(baseRole(role));

  const tabs = [
    { key: "stock", label: "Stok Durumu" },
    { key: "map", label: "Harita" },
    ...(canManage ? [{ key: "movements", label: "Stok Hareketleri" }] : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Stok</h1>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === "stock" && <InventoryView hideTitle />}

      {tab === "map" && <StockMap />}

      {tab === "movements" && canManage && (
        <div className="space-y-3">
          <p className="rounded-lg border border-border bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Manuel stok hareketi. <b>Giriş</b>: yurtiçi depoya stok ekler (+, bağlantıyı &quot;Geldi&quot; yapar). <b>Yurtdışı Depo Girişi</b>: menşe depoya ekler (+, &quot;Geldi&quot; yapmaz). <b>Transfer</b> /
            <b> Fabrikaya</b>: mal o depodan çıkar (−). <b>Düzeltme</b>: sayım artışı (+).
            Bir malı A&apos;dan B&apos;ye taşımak için B&apos;ye &quot;Giriş&quot;, A&apos;da &quot;Transfer&quot; girin.
            Gemi boşaltma girişleri Operasyon ekranından yapılır.
          </p>
          <ResourceManager config={stockMovementsResource} role={role} hideTitle bulkSelect />
        </div>
      )}
    </div>
  );
}
