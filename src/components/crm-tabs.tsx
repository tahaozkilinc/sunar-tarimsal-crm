"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs } from "./ui";
import { ResourceManager } from "./resource-manager";
import { CrmActivitySummary } from "./crm-activity-summary";
import { OperationPartnerStats } from "./company-ship-stats";
import { createClient } from "@/lib/supabase/client";
import { activitiesResource, companiesResource } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { baseRole } from "@/lib/nav";

type CrmModule = "purchasing" | "sales" | "surveyor" | "port" | "carrier";
type ActivitiesModule = "purchasing" | "sales" | "operations";

// Operasyon iş ortakları artık tek modül değil; gözetim/liman/nakliyeci ayrı.
// Firmalar type'a göre (surveyor/port/carrier), aktiviteler tek module=operations
// altında olduğundan ilgili türdeki firma id'lerine göre kapsanır.
const OPERATIONS_MODULES: CrmModule[] = ["surveyor", "port", "carrier"];

const MODULE_META: Record<
  CrmModule,
  {
    toggleLabel: string;
    companyLabel: string;
    companyType: string;
    typeFilter: string[];
    activitiesModule: ActivitiesModule;
  }
> = {
  purchasing: {
    toggleLabel: "Tedarikçiler (Bağlantı)",
    companyLabel: "Tedarikçiler",
    companyType: "supplier",
    typeFilter: ["supplier", "both"],
    activitiesModule: "purchasing",
  },
  sales: {
    toggleLabel: "Müşteriler (Satış)",
    companyLabel: "Müşteriler",
    companyType: "customer",
    typeFilter: ["customer", "both"],
    activitiesModule: "sales",
  },
  surveyor: {
    toggleLabel: "Gözetim",
    companyLabel: "Gözetim Şirketleri",
    companyType: "surveyor",
    typeFilter: ["surveyor"],
    activitiesModule: "operations",
  },
  port: {
    toggleLabel: "Liman",
    companyLabel: "Limanlar",
    companyType: "port",
    typeFilter: ["port"],
    activitiesModule: "operations",
  },
  carrier: {
    toggleLabel: "Nakliyeci",
    companyLabel: "Nakliyeciler",
    companyType: "carrier",
    typeFilter: ["carrier"],
    activitiesModule: "operations",
  },
};

// Rol başına görünür CRM modülleri. admin/viewer hepsini; satın alma/satış kendi
// modülünü; operasyon üç iş ortağı türünü ayrı ayrı görür.
function modulesForRole(role: Role): CrmModule[] {
  const base = baseRole(role);
  if (base === "admin" || base === "viewer")
    return ["purchasing", "sales", "surveyor", "port", "carrier"];
  if (base === "sales") return ["sales"];
  if (base === "operations") return ["surveyor", "port", "carrier"];
  return ["purchasing"];
}

export function CrmTabs({ role }: { role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const available = modulesForRole(role);
  const [crmModule, setCrmModule] = useState<CrmModule>(available[0]);
  const effModule = available.includes(crmModule) ? crmModule : available[0];
  const meta = MODULE_META[effModule];
  const isOps = OPERATIONS_MODULES.includes(effModule);
  const [tab, setTab] = useState("companies");

  // Operasyon türlerinin aktivitelerini firmaya göre ayırmak için, ilgili
  // türlerdeki firma id'lerini bir kez yükleyip türe göre grupla.
  const showsOps = available.some((m) => OPERATIONS_MODULES.includes(m));
  const [opCompanyIds, setOpCompanyIds] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!showsOps) return;
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id,type")
        .in("type", OPERATIONS_MODULES);
      if (!on) return;
      const map: Record<string, string[]> = { surveyor: [], port: [], carrier: [] };
      ((data as { id: string; type: string }[] | null) || []).forEach((c) => {
        (map[c.type] ||= []).push(c.id);
      });
      setOpCompanyIds(map);
    })();
    return () => {
      on = false;
    };
  }, [supabase, showsOps]);

  const opIds = isOps ? opCompanyIds[effModule] ?? [] : undefined;
  const activitiesFilter: Record<string, string | number | boolean | string[]> = isOps
    ? { module: "operations", company_id: opIds ?? [] }
    : { module: meta.activitiesModule };

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
        <div className="space-y-4">
          {isOps && (
            <OperationPartnerStats
              key={`ps-${effModule}`}
              companyType={effModule as "surveyor" | "port" | "carrier"}
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
      )}
      {tab === "activities" && (
        <div className="space-y-4">
          <CrmActivitySummary
            key={`s-${effModule}`}
            module={meta.activitiesModule}
            companyIds={isOps ? opIds : undefined}
          />
          <ResourceManager
            key={`a-${effModule}`}
            config={activitiesResource}
            role={role}
            filter={activitiesFilter}
            defaultValues={{ module: meta.activitiesModule }}
          />
        </div>
      )}
    </div>
  );
}
