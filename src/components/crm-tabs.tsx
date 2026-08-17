"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { OperationPartnerStats } from "./company-ship-stats";
import { companiesResource, warehousesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { baseRole } from "@/lib/nav";

type CrmModule = "purchasing" | "sales" | "surveyor" | "port" | "carrier" | "agent" | "ship_broker" | "broker" | "warehouses";

// Operasyon iş ortakları artık tek modül değil; gözetim/liman/nakliyeci/acente/
// Gemi Brokeri ayrı. Aktiviteler artık burada değil, doğrudan her firmanın
// kendi detay sayfasında (bkz. company-detail-view.tsx) — bu yüzden burada
// modül bazlı bir aktivite kovası ayrımına gerek kalmadı.
const OPERATIONS_MODULES: CrmModule[] = ["surveyor", "port", "carrier", "agent", "ship_broker"];

const MODULE_META: Record<
  CrmModule,
  {
    toggleLabel: string;
    companyLabel: string;
    companyType: string;
    typeFilter: string[];
  }
> = {
  purchasing: {
    toggleLabel: "Tedarikçiler (Bağlantı)",
    companyLabel: "Tedarikçiler",
    companyType: "supplier",
    typeFilter: ["supplier", "both"],
  },
  sales: {
    toggleLabel: "Müşteriler (Satış)",
    companyLabel: "Müşteriler",
    companyType: "customer",
    typeFilter: ["customer", "both"],
  },
  surveyor: {
    toggleLabel: "Gözetim",
    companyLabel: "Gözetim Şirketleri",
    companyType: "surveyor",
    typeFilter: ["surveyor"],
  },
  port: {
    toggleLabel: "Liman",
    companyLabel: "Limanlar",
    companyType: "port",
    typeFilter: ["port"],
  },
  carrier: {
    toggleLabel: "Nakliyeci",
    companyLabel: "Nakliyeciler",
    companyType: "carrier",
    typeFilter: ["carrier"],
  },
  agent: {
    toggleLabel: "Acente",
    companyLabel: "Acenteler",
    companyType: "agent",
    typeFilter: ["agent"],
  },
  // Hammadde Brokeri: satın alma tarafı, sözleşme açılışında seçilir.
  broker: {
    toggleLabel: "Hammadde Brokeri",
    companyLabel: "Hammadde Brokerleri",
    companyType: "broker",
    typeFilter: ["broker"],
  },
  // Gemi Brokeri: operasyon tarafı, gözetim/liman/nakliyeci/acente gibi
  // ship-ops'tan atanır — bkz. ship-ops-page.tsx "Operasyon Tarafları".
  ship_broker: {
    toggleLabel: "Gemi Brokeri",
    companyLabel: "Gemi Brokerleri",
    companyType: "ship_broker",
    typeFilter: ["ship_broker"],
  },
  // Depolar companies değil warehouses tablosu üzerinde çalışır — companies
  // deseni buraya uymaz, kendi ayrı dalı var (aşağıda, effModule ===
  // "warehouses" erken dönüşü). Buradaki alanların toggleLabel DIŞINDAKİ
  // hiçbiri o dalda okunmaz; tip basit kalsın diye dolgu değer.
  warehouses: {
    toggleLabel: "Depolar",
    companyLabel: "Depolar",
    companyType: "",
    typeFilter: [],
  },
};

// Rol başına görünür CRM modülleri. admin/viewer hepsini; satış kendi modülünü;
// operasyon beş iş ortağı türünü (gözetim/liman/nakliyeci/acente/Gemi Brokeri)
// + Depolar'ı ayrı ayrı görür (depo yönetimi zaten operasyonun işi, bkz.
// warehouses_write); satın alma kendi modülüne ek olarak Hammadde Brokeri'ni
// görür (bağlantı açılırken seçildiği için satın almaya ait, operasyona değil).
function modulesForRole(role: Role): CrmModule[] {
  const base = baseRole(role);
  if (base === "admin" || base === "viewer")
    return ["purchasing", "sales", "surveyor", "port", "carrier", "agent", "ship_broker", "broker", "warehouses"];
  if (base === "sales") return ["sales"];
  if (base === "operations") return ["surveyor", "port", "carrier", "agent", "ship_broker", "warehouses"];
  if (base === "purchasing") return ["purchasing", "broker"];
  return ["purchasing"];
}

export function CrmTabs({ role }: { role: Role }) {
  const available = modulesForRole(role);
  const [crmModule, setCrmModule] = useState<CrmModule>(available[0]);
  const effModule = available.includes(crmModule) ? crmModule : available[0];
  const meta = MODULE_META[effModule];
  const isOps = OPERATIONS_MODULES.includes(effModule);

  // Depolar: companies deseni buraya uymuyor (warehouses tablosu). Diğer CRM
  // modülleri gibi satır tıklanınca ayrı bir sayfaya gider (bkz.
  // /crm/warehouses/[id], WarehouseDetailView) — satır-içi açılır panel değil.
  if (effModule === "warehouses") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">CRM</h1>
          {available.length > 1 && (
            <Tabs
              value={effModule}
              onChange={(k) => setCrmModule(k as CrmModule)}
              tabs={available.map((m) => ({ key: m, label: MODULE_META[m].toggleLabel }))}
            />
          )}
        </div>
        <ResourceManager
          config={warehousesResource}
          role={role}
          hideTitle
          rowHref={(row) => `/crm/warehouses/${row.id}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">CRM</h1>
        {available.length > 1 && (
          <Tabs
            value={effModule}
            onChange={(k) => setCrmModule(k as CrmModule)}
            tabs={available.map((m) => ({ key: m, label: MODULE_META[m].toggleLabel }))}
          />
        )}
      </div>

      {(isOps || effModule === "broker") && (
        <OperationPartnerStats
          key={`ps-${effModule}`}
          companyType={effModule as "surveyor" | "port" | "carrier" | "agent" | "broker" | "ship_broker"}
        />
      )}
      <ResourceManager
        key={`c-${effModule}`}
        config={companiesResource}
        role={role}
        filter={{ type: meta.typeFilter }}
        defaultValues={{ type: meta.companyType }}
        title={meta.companyLabel}
        hideTitle
        hideFilters
        rowHref={(row) => `/crm/${row.id}`}
      />
    </div>
  );
}
