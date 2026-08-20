"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WarehouseDetailExtra } from "./warehouse-detail-extra";
import { ResourceManager } from "./resource-manager";
import { PhotoGallery } from "./photo-gallery";
import { Badge, Card, Tabs } from "./ui";
import { LOCATION_TYPE_OPTIONS, warehouseContactsResource, warehousesResource } from "@/lib/resources";
import { formatNumber } from "@/lib/format";
import { baseRole } from "@/lib/nav";
import type { Warehouse, Role } from "@/lib/types";

// company-detail-view.tsx ile AYNI desen — CRM'deki her modül (Tedarikçi,
// Acente, Broker...) tıklanınca ayrı bir SAYFAYA gider ve içerik tek uzun
// sayfada üst üste değil, küçük sekmeler halinde durur (üstteki bilgi kartı
// hariç, o sabit kalır):
//   Detaylar        -> depo fotoğrafları + yetkilileri
//   Alt Depolar     -> tek antrepoda birden fazla bölüm/depo olabilir
//                      (parent_id, bkz. 0053); "Ekle" formunda üst depo
//                      otomatik atanır. Alt depo da normal bir warehouses
//                      satırı olduğundan Stok -> Stok Durumu'nda KENDİ
//                      hareketleriyle otomatik görünür, ayrı bağlantı gerekmez.
//   Stok Özeti      -> gemi/tedarikçi/milli-yerli kırılımı (WarehouseDetailExtra)
//   Hareket Geçmişi -> giriş/çıkış geçmişi (WarehouseDetailExtra)

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm">{value || "-"}</div>
    </div>
  );
}

type Tab = "details" | "subwarehouses" | "stock" | "ledger";

export function WarehouseDetailView({
  warehouse,
  parentName,
  portName,
  role,
}: {
  warehouse: Warehouse;
  parentName: string | null;
  portName: string | null;
  role: Role;
}) {
  const typeOpt = LOCATION_TYPE_OPTIONS.find((o) => o.value === warehouse.type);
  const [tab, setTab] = useState<Tab>("details");
  const canWrite = ["admin", "operations"].includes(baseRole(role));

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
          <Info label="Bulunduğu Liman (Gümrüklü Saha)" value={portName} />
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "details", label: "Detaylar" },
          { key: "subwarehouses", label: "Alt Depolar" },
          { key: "stock", label: "Stok Özeti" },
          { key: "ledger", label: "Hareket Geçmişi" },
        ]}
      />

      {tab === "details" && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">Depo Fotoğrafları</div>
            <PhotoGallery
              bucket="warehouse-photos"
              table="warehouse_photos"
              fkColumn="warehouse_id"
              fkValue={warehouse.id}
              canWrite={canWrite}
              labels={["Depo", "Belge"]}
              emptyText="Bu depoya ait görsel / dosya yok."
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Depo Yetkilileri</div>
            <ResourceManager
              config={{
                ...warehouseContactsResource,
                listFields: ["full_name", "title", "phone", "email"],
                fields: warehouseContactsResource.fields.map((f) =>
                  f.name === "warehouse_id" ? { ...f, formHidden: true } : f,
                ),
              }}
              role={role}
              filter={{ warehouse_id: warehouse.id }}
              defaultValues={{ warehouse_id: warehouse.id }}
              hideTitle
            />
          </div>
        </div>
      )}

      {tab === "subwarehouses" && (
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
      )}

      {(tab === "stock" || tab === "ledger") && (
        <WarehouseDetailExtra warehouseId={warehouse.id} role={role} section={tab} />
      )}
    </div>
  );
}
