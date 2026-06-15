"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { activitiesResource, companiesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

export function CrmTabs({ role }: { role: Role }) {
  const isAdmin = role === "admin";
  const [crmModule, setCrmModule] = useState<"purchasing" | "sales">(
    role === "sales" ? "sales" : "purchasing",
  );
  const effModule = isAdmin ? crmModule : role === "sales" ? "sales" : "purchasing";
  const companyType = effModule === "sales" ? "customer" : "supplier";
  const companyLabel = effModule === "sales" ? "Müşteriler" : "Tedarikçiler";
  // "İkisi de" tipindeki firmalar her iki tarafta da görünsün
  const typeFilter = effModule === "sales" ? ["customer", "both"] : ["supplier", "both"];

  const [tab, setTab] = useState("companies");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">CRM</h1>
        {isAdmin && (
          <Tabs
            value={crmModule}
            onChange={(k) => setCrmModule(k as "purchasing" | "sales")}
            tabs={[
              { key: "purchasing", label: "Tedarikçiler (Bağlantı)" },
              { key: "sales", label: "Müşteriler (Satış)" },
            ]}
          />
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "companies", label: companyLabel },
          { key: "activities", label: "Aktiviteler" },
        ]}
      />

      {tab === "companies" && (
        <ResourceManager
          key={`c-${effModule}`}
          config={companiesResource}
          role={role}
          filter={{ type: typeFilter }}
          defaultValues={{ type: companyType }}
          title={companyLabel}
          hideTitle
          rowHref={(row) => `/crm/${row.id}`}
        />
      )}
      {tab === "activities" && (
        <ResourceManager
          key={`a-${effModule}`}
          config={activitiesResource}
          role={role}
          filter={{ module: effModule }}
          defaultValues={{ module: effModule }}
        />
      )}
    </div>
  );
}
