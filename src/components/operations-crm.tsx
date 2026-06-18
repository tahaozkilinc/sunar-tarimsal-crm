"use client";

import { useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { CrmActivitySummary } from "./crm-activity-summary";
import { activitiesResource, companiesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";

const OPERATIONS_COMPANY_TYPES = ["surveyor", "port", "carrier"];

// Operasyona özel CRM: gözetim şirketleri, limanlar, nakliyeciler.
// purchasing/sales CRM'inden (companies.type=supplier/customer) tamamen ayrı.
export function OperationsCrm({ role }: { role: Role }) {
  const [tab, setTab] = useState("companies");

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "companies", label: "Gözetim / Liman / Nakliyeci" },
          { key: "activities", label: "Aktiviteler" },
        ]}
      />
      {tab === "companies" && (
        <ResourceManager
          config={companiesResource}
          role={role}
          filter={{ type: OPERATIONS_COMPANY_TYPES }}
          defaultValues={{ type: "carrier" }}
          title="Gözetim / Liman / Nakliyeci"
          hideTitle
        />
      )}
      {tab === "activities" && (
        <div className="space-y-4">
          <CrmActivitySummary module="operations" />
          <ResourceManager
            config={activitiesResource}
            role={role}
            filter={{ module: "operations" }}
            defaultValues={{ module: "operations" }}
          />
        </div>
      )}
    </div>
  );
}
