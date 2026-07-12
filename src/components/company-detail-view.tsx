"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ResourceManager } from "./resource-manager";
import { CompanyReport } from "./company-report";
import { CompanyShipStats } from "./company-ship-stats";
import { Badge, Card } from "./ui";
import { COMPANY_TYPE_OPTIONS, contactsResource } from "@/lib/resources";
import type { Company, Role } from "@/lib/types";

// Firma logosu: private kovadan imzalı URL ile gösterilir; yoksa baş harf.
function CompanyLogo({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let on = true;
    createClient()
      .storage.from("company-logos")
      .createSignedUrl(path, 3600)
      .then(({ data }) => { if (on) setUrl(data?.signedUrl ?? null); });
    return () => { on = false; };
  }, [path]);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`${name} logosu`} className="h-12 w-12 rounded-lg border border-border bg-white object-contain p-1" />;
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-gray-50 text-lg font-bold text-gray-400">
      {name.slice(0, 1).toLocaleUpperCase("tr")}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm">{value || "-"}</div>
    </div>
  );
}

export function CompanyDetailView({ company, role }: { company: Company; role: Role }) {
  const typeOpt = COMPANY_TYPE_OPTIONS.find((o) => o.value === company.type);

  // Bu sayfada firma sabit -> kişi formunda firma alanı gizli, otomatik atanır.
  const contactsConfig = {
    ...contactsResource,
    listFields: ["full_name", "title", "phone", "email"],
    fields: contactsResource.fields.map((f) =>
      f.name === "company_id" ? { ...f, formHidden: true } : f,
    ),
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> CRM&apos;e dön
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <CompanyLogo path={company.logo_url} name={company.name} />
          <h1 className="text-xl font-bold">{company.name}</h1>
          {typeOpt && <Badge color={typeOpt.color}>{typeOpt.label}</Badge>}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Info label="Şehir" value={company.city} />
          <Info label="Ülke" value={company.country} />
          <Info label="Telefon" value={company.phone} />
          <Info label="E-posta" value={company.email} />
          <div className="sm:col-span-2">
            <Info label="Adres" value={company.address} />
          </div>
          <div className="sm:col-span-2">
            <Info label="Notlar" value={company.notes} />
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Kişiler / Yetkililer</h2>
        <ResourceManager
          config={contactsConfig}
          role={role}
          filter={{ company_id: company.id }}
          defaultValues={{ company_id: company.id }}
          hideTitle
        />
      </div>

      {company.type === "surveyor" || company.type === "port" || company.type === "carrier" ? (
        <CompanyShipStats companyId={company.id} companyType={company.type} />
      ) : (
        <CompanyReport companyId={company.id} />
      )}
    </div>
  );
}
