"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { CrmActivitySummary } from "./crm-activity-summary";
import { activitiesResource, companiesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { baseRole } from "@/lib/nav";

type CrmModule = "purchasing" | "sales" | "operations";

// Her CRM modülü hangi firma türlerini ve etiketleri kullanır.
// operations: gözetim/liman/nakliyeci (operasyonun iş ortakları) — eskiden
// Operasyon sekmesindeydi, artık CRM içinde.
const MODULE_META: Record<
  CrmModule,
  { toggleLabel: string; companyLabel: string; companyType: string; typeFilter: string[] }
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
  operations: {
    toggleLabel: "Operasyon (Gözetim/Liman/Nakliyeci)",
    companyLabel: "Gözetim / Liman / Nakliyeci",
    companyType: "carrier",
    typeFilter: ["surveyor", "port", "carrier"],
  },
};

// Rol başına görünür CRM modülleri. admin/viewer hepsini; diğerleri kendi işini.
function modulesForRole(role: Role): CrmModule[] {
  const base = baseRole(role);
  if (base === "admin" || base === "viewer") return ["purchasing", "sales", "operations"];
  if (base === "sales") return ["sales"];
  if (base === "operations") return ["operations"];
  return ["purchasing"];
}

export function CrmTabs({ role }: { role: Role }) {
  const available = modulesForRole(role);
  const [crmModule, setCrmModule] = useState<CrmModule>(available[0]);
  const effModule = available.includes(crmModule) ? crmModule : available[0];
  const meta = MODULE_META[effModule];

  const [tab, setTab] = useState("companies");

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

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "companies", label: meta.companyLabel },
          { key: "activities", label: "Aktiviteler" },
        ]}
      />

      {tab === "companies" && (
        <ResourceManager
          key={`c-${effModule}`}
          config={companiesResource}
          role={role}
          filter={{ type: meta.typeFilter }}
          defaultValues={{ type: meta.companyType }}
          title={meta.companyLabel}
          hideTitle
          rowHref={(row) => `/crm/${row.id}`}
        />
      )}
      {tab === "activities" && (
        <div className="space-y-4">
          <CrmActivitySummary key={`s-${effModule}`} module={effModule} />
          <ResourceManager
            key={`a-${effModule}`}
            config={activitiesResource}
            role={role}
            filter={{ module: effModule }}
            defaultValues={{ module: effModule }}
          />
        </div>
      )}
    </div>
  );
}
