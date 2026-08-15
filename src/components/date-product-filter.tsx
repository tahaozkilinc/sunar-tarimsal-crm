"use client";

import { Field, Input, SearchableSelect } from "./ui";

// Firma detayındaki "Operasyonel Özet" sekmesi için ortak filtre çubuğu
// (CompanyReport + CompanyShipStats'ta aynı şekilde kullanılır) — tarih
// aralığı + ürün. Süzme mantığı çağıran tarafta (veri şekli farklı), burada
// yalnızca sunum var.

export type DateProductFilterValue = { from: string; to: string; productId: string };

export const EMPTY_DATE_PRODUCT_FILTER: DateProductFilterValue = { from: "", to: "", productId: "" };

export function DateProductFilter({
  value,
  onChange,
  products,
}: {
  value: DateProductFilterValue;
  onChange: (v: DateProductFilterValue) => void;
  products: { id: string; name: string }[];
}) {
  const active = !!(value.from || value.to || value.productId);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-gray-50 p-3">
      <div className="w-36">
        <Field label="Başlangıç">
          <Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        </Field>
      </div>
      <div className="w-36">
        <Field label="Bitiş">
          <Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </Field>
      </div>
      <div className="w-48">
        <Field label="Ürün">
          <SearchableSelect
            value={value.productId}
            onChange={(v) => onChange({ ...value, productId: v })}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Tümü"
          />
        </Field>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_DATE_PRODUCT_FILTER)}
          className="pb-2 text-xs text-gray-500 underline hover:text-gray-700"
        >
          Filtreyi temizle
        </button>
      )}
    </div>
  );
}
