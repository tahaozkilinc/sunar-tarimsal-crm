"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WarehouseDetailExtra } from "./warehouse-detail-extra";
import { ResourceManager } from "./resource-manager";
import { Badge, Card } from "./ui";
import { LOCATION_TYPE_OPTIONS, warehousesResource } from "@/lib/resources";
import { formatNumber } from "@/lib/format";
import type { Warehouse, Role } from "@/lib/types";

// company-detail-view.tsx ile AYNI desen — CRM'deki her modül (Tedarikçi,
// Acente, Broker...) tıklanınca ayrı bir SAYFAYA gider; Depolar da artık
// (satır-içi açılır panel yerine) aynı şekilde çalışır.
//
// "Alt Depolar": tek antrepoda birden fazla bölüm/depo olabilir (parent_id,
// bkz. 0053) — burada bu depoya bağlı alt depolar listelenir/eklenir, "Ekle"
// formunda üst depo otomatik atanır. Alt depo da normal bir warehouses satırı
// olduğundan Stok -> Stok Durumu'nda KENDİ hareketleriyle otomatik görünür;
// ayrı bir bağlantı gerekmez.

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm">{value || "-"}</div>
    </div>
  );
}

export function WarehouseDetailView({
  warehouse,
  parentName,
  role,
}: {
  warehouse: Warehouse;
  parentName: string | null;
  role: Role;
}) {
  const typeOpt = LOCATION_TYPE_OPTIONS.find((o) => o.value === warehouse.type);

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
          <h1 className="text-xl font-bold">{warehouse.name}</h1>
          {typeOpt && <Badge color={typeOpt.color}>{typeOpt.label}</Badge>}
          {!warehouse.is_active && <Badge color="gray">Pasif</Badge>}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Info label="Şehir" value={warehouse.city} />
          <Info label="Ülke" value={warehouse.country} />
          <Info label="Kapasite" value={warehouse.capacity != null ? `${formatNumber(warehouse.capacity)} ton` : null} />
          <Info label="Bağlı Olduğu Ana Depo (Antrepo)" value={parentName} />
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Alt Depolar</h2>
        <ResourceManager
          config={{
            ...warehousesResource,
            listFields: ["name", "type", "city", "capacity", "is_active"],
            fields: warehousesResource.fields.map((f) =>
              f.name === "parent_id" ? { ...f, formHidden: true } : f,
            ),
          }}
          role={role}
          filter={{ parent_id: warehouse.id }}
          defaultValues={{ parent_id: warehouse.id }}
          hideTitle
          rowHref={(row) => `/crm/warehouses/${row.id}`}
        />
      </div>

      <WarehouseDetailExtra warehouseId={warehouse.id} role={role} />
    </div>
  );
}
