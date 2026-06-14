"use client";

import { useState } from "react";
import { ResourceManager } from "./resource-manager";
import { Tabs } from "./ui";
import { CompanyReport } from "./company-report";
import {
  activitiesResource,
  companiesResource,
  contactsResource,
} from "@/lib/resources";
import type { Role } from "@/lib/types";

export function CrmTabs({ role }: { role: Role }) {
  const [tab, setTab] = useState("companies");

  const crmModule = role === "sales" ? "sales" : "purchasing";
  const companyType = role === "sales" ? "customer" : "supplier";
  const companyLabel =
    role === "sales" ? "Müşteriler" : role === "purchasing" ? "Tedarikçiler" : "Firmalar";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">CRM</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "companies", label: companyLabel },
          { key: "contacts", label: "Kişiler" },
          { key: "activities", label: "Aktiviteler" },
        ]}
      />

      {tab === "companies" && (
        <ResourceManager
          config={companiesResource}
          role={role}
          defaultValues={{ type: companyType }}
          title={companyLabel}
          detailExtra={(row) => <CompanyReport companyId={String(row.id)} />}
        />
      )}
      {tab === "contacts" && (
        <ResourceManager config={contactsResource} role={role} />
      )}
      {tab === "activities" && (
        <ResourceManager
          config={activitiesResource}
          role={role}
          filter={role === "admin" ? undefined : { module: crmModule }}
          defaultValues={{ module: crmModule }}
        />
      )}
    </div>
  );
}
