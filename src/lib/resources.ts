import type { Role } from "./types";

// =============================================================================
// Kaynak (resource) tanımları.
// Yeni alan eklemek için ilgili "fields" dizisine bir satır eklemeniz yeterli.
// Tablo veritabanında da varsa otomatik çalışır (basit ve genişletilebilir).
// =============================================================================

export type BadgeColor =
  | "green"
  | "blue"
  | "yellow"
  | "red"
  | "gray"
  | "purple";

export interface SelectOption {
  value: string;
  label: string;
  color?: BadgeColor;
}

export interface FieldDef {
  name: string;
  label: string;
  type:
    | "text"
    | "number"
    | "money"
    | "textarea"
    | "date"
    | "select"
    | "reference"
    | "boolean"
    | "email"
    | "tel"
    | "url";
  required?: boolean;
  unique?: boolean;
  options?: SelectOption[];
  ref?: { table: string; labelField: string; filter?: Record<string, string[]> };
  autofill?: Record<string, string>;
  formHidden?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export interface ResourceConfig {
  table: string;
  title: string;
  singular: string;
  writeRoles: Role[];
  fields: FieldDef[];
  listFields: string[];
  searchFields?: string[];
  filterFields?: string[];
  orderBy?: { column: string; ascending?: boolean };
  filter?: Record<string, string | number | boolean | string[]>;
  defaultValues?: Record<string, unknown>;
}

// ---- Ortak seçenek listeleri ----
export const CURRENCY_OPTIONS: SelectOption[] = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "TRY", label: "TRY" },
];

export const INCOTERM_OPTIONS: SelectOption[] = [
  { value: "FOB", label: "FOB" },
  { value: "CIF", label: "CIF" },
  { value: "CFR", label: "CFR" },
  { value: "FCA", label: "FCA" },
  { value: "EXW", label: "EXW" },
  { value: "DAP", label: "DAP" },
];

export const COMPANY_TYPE_OPTIONS: SelectOption[] = [
  { value: "supplier", label: "Tedarikçi", color: "blue" },
  { value: "customer", label: "Müşteri", color: "green" },
  { value: "both", label: "İkisi de", color: "purple" },
];

export const LOCATION_TYPE_OPTIONS: SelectOption[] = [
  { value: "warehouse", label: "Depo", color: "blue" },
  { value: "factory", label: "Fabrika", color: "purple" },
];

export const CONTRACT_STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Taslak", color: "gray" },
  { value: "active", label: "Aktif", color: "blue" },
  { value: "in_transit", label: "Yolda", color: "yellow" },
  { value: "arrived", label: "Geldi", color: "purple" },
  { value: "completed", label: "Tamamlandı", color: "green" },
  { value: "cancelled", label: "İptal", color: "red" },
];

export const MOVEMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "inbound", label: "Giriş", color: "green" },
  { value: "transfer", label: "Transfer", color: "blue" },
  { value: "to_factory", label: "Fabrikaya", color: "purple" },
  { value: "adjustment", label: "Düzeltme", color: "gray" },
];

export const SALES_STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Taslak", color: "gray" },
  { value: "confirmed", label: "Onaylandı", color: "blue" },
  { value: "delivered", label: "Teslim Edildi", color: "purple" },
  { value: "invoiced", label: "Faturalandı", color: "green" },
  { value: "cancelled", label: "İptal", color: "red" },
];

export const ACTIVITY_TYPE_OPTIONS: SelectOption[] = [
  { value: "call", label: "Telefon" },
  { value: "meeting", label: "Toplantı" },
  { value: "email", label: "E-posta" },
  { value: "note", label: "Not" },
  { value: "task", label: "Görev" },
  { value: "visit", label: "Ziyaret" },
];

export const ACTIVITY_STATUS_OPTIONS: SelectOption[] = [
  { value: "open", label: "Açık", color: "yellow" },
  { value: "done", label: "Tamamlandı", color: "green" },
  { value: "cancelled", label: "İptal", color: "gray" },
];

// =============================================================================
// Kaynaklar
// =============================================================================
export const companiesResource: ResourceConfig = {
  table: "companies",
  title: "Firmalar",
  singular: "Firma",
  writeRoles: ["admin", "purchasing", "sales"],
  orderBy: { column: "name", ascending: true },
  searchFields: ["name", "city", "phone", "email"],
  filterFields: ["type"],
  listFields: ["name", "type", "city", "phone"],
  fields: [
    { name: "name", label: "Firma Adı", type: "text", required: true, unique: true },
    { name: "type", label: "Tür", type: "select", options: COMPANY_TYPE_OPTIONS, required: true },
    { name: "city", label: "Şehir", type: "text" },
    { name: "country", label: "Ülke", type: "text" },
    { name: "phone", label: "Telefon", type: "tel" },
    { name: "email", label: "E-posta", type: "email" },
    { name: "address", label: "Adres", type: "textarea" },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const contactsResource: ResourceConfig = {
  table: "contacts",
  title: "Kişiler",
  singular: "Kişi",
  writeRoles: ["admin", "purchasing", "sales"],
  orderBy: { column: "full_name", ascending: true },
  searchFields: ["full_name", "title", "phone"],
  listFields: ["full_name", "title", "company_id", "phone"],
  fields: [
    { name: "company_id", label: "Firma", type: "reference", ref: { table: "companies", labelField: "name" }, required: true },
    { name: "full_name", label: "Ad Soyad", type: "text", required: true },
    { name: "title", label: "Ünvan", type: "text" },
    { name: "phone", label: "Telefon", type: "tel" },
    { name: "email", label: "E-posta", type: "email" },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const activitiesResource: ResourceConfig = {
  table: "crm_activities",
  title: "Aktiviteler",
  singular: "Aktivite",
  writeRoles: ["admin", "purchasing", "sales"],
  orderBy: { column: "created_at", ascending: false },
  searchFields: ["subject"],
  listFields: ["subject", "activity_type", "company_id", "due_date", "status"],
  fields: [
    { name: "subject", label: "Konu", type: "text", required: true },
    { name: "activity_type", label: "Tür", type: "select", options: ACTIVITY_TYPE_OPTIONS, required: true },
    { name: "company_id", label: "Firma", type: "reference", ref: { table: "companies", labelField: "name" } },
    { name: "due_date", label: "Tarih", type: "date" },
    { name: "status", label: "Durum", type: "select", options: ACTIVITY_STATUS_OPTIONS, required: true },
    { name: "description", label: "Açıklama", type: "textarea" },
  ],
};

export const purchaseContractsResource: ResourceConfig = {
  table: "purchase_contracts",
  title: "Satın Alma Sözleşmeleri",
  singular: "Sözleşme",
  writeRoles: ["admin", "purchasing"],
  defaultValues: { unit: "ton", currency: "USD" },
  orderBy: { column: "created_at", ascending: false },
  searchFields: ["contract_no", "vessel", "origin_country"],
  filterFields: ["status", "supplier_id", "product_id"],
  listFields: ["contract_no", "supplier_id", "product_id", "quantity", "eta", "status"],
  fields: [
    { name: "contract_no", label: "Sözleşme No", type: "text", unique: true },
    { name: "supplier_id", label: "Tedarikçi", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["supplier", "both"] } } },
    { name: "product_id", label: "Ürün (Yağlı Tohum)", type: "reference", ref: { table: "products", labelField: "name" } },
    { name: "quantity", label: "Miktar", type: "number", required: true },
    { name: "unit", label: "Birim", type: "text" },
    { name: "price", label: "Birim Fiyat", type: "money" },
    { name: "currency", label: "Para Birimi", type: "select", options: CURRENCY_OPTIONS },
    { name: "incoterm", label: "Teslim Şekli", type: "select", options: INCOTERM_OPTIONS },
    { name: "origin_country", label: "Menşe Ülke", type: "text" },
    { name: "loading_port", label: "Yükleme Limanı", type: "text" },
    { name: "vessel", label: "Gemi / Araç", type: "text" },
    { name: "eta", label: "ETA (Tahmini Varış)", type: "date" },
    { name: "laycan_start", label: "Laycan Başlangıç", type: "date" },
    { name: "laycan_end", label: "Laycan Bitiş", type: "date" },
    { name: "status", label: "Durum", type: "select", options: CONTRACT_STATUS_OPTIONS, required: true },
    { name: "payment_due_date", label: "Öngörülen Ödeme Tarihi", type: "date" },
    { name: "buyer", label: "Alıcı", type: "text" },
    { name: "principal_id", label: "Kimin Adına", type: "reference", ref: { table: "principals", labelField: "name" } },
    { name: "created_at", label: "Sözleşme Tarihi", type: "date", readOnly: true },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const stockMovementsResource: ResourceConfig = {
  table: "stock_movements",
  title: "Stok Hareketleri",
  singular: "Hareket",
  writeRoles: ["admin", "operations"],
  defaultValues: { unit: "ton" },
  orderBy: { column: "movement_date", ascending: false },
  searchFields: ["vehicle_plate"],
  listFields: ["movement_date", "contract_id", "product_id", "warehouse_id", "movement_type", "quantity"],
  fields: [
    { name: "movement_date", label: "Tarih", type: "date", required: true },
    { name: "contract_id", label: "Kaynak Sözleşme (Gemi)", type: "reference", ref: { table: "purchase_contracts", labelField: "contract_no" }, autofill: { product_id: "product_id", unit: "unit" } },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name" } },
    { name: "warehouse_id", label: "Depo / Fabrika", type: "reference", ref: { table: "warehouses", labelField: "name" }, required: true },
    { name: "movement_type", label: "Hareket Tipi", type: "select", options: MOVEMENT_TYPE_OPTIONS, required: true },
    { name: "quantity", label: "Miktar", type: "number", required: true },
    { name: "unit", label: "Birim", type: "text" },
    { name: "vehicle_plate", label: "Araç Plakası", type: "text" },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const salesOrdersResource: ResourceConfig = {
  table: "sales_orders",
  title: "Satışlar",
  singular: "Satış",
  writeRoles: ["admin", "sales"],
  defaultValues: { unit: "ton", currency: "TRY" },
  orderBy: { column: "created_at", ascending: false },
  searchFields: ["order_no"],
  listFields: ["order_no", "customer_id", "product_id", "quantity", "delivery_date", "status"],
  fields: [
    { name: "order_no", label: "Satış No", type: "text", unique: true },
    { name: "customer_id", label: "Müşteri", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["customer", "both"] } } },
    { name: "contract_id", label: "Kaynak Bağlantı (Gemi)", type: "reference", ref: { table: "sellable_contracts", labelField: "contract_no" }, autofill: { product_id: "product_id" } },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name" } },
    { name: "warehouse_id", label: "Çıkış Deposu", type: "reference", ref: { table: "warehouses", labelField: "name" } },
    { name: "quantity", label: "Miktar", type: "number", required: true },
    { name: "unit", label: "Birim", type: "text" },
    { name: "price", label: "Birim Fiyat", type: "money" },
    { name: "currency", label: "Para Birimi", type: "select", options: CURRENCY_OPTIONS },
    { name: "delivery_date", label: "Teslim Tarihi", type: "date" },
    { name: "status", label: "Durum", type: "select", options: SALES_STATUS_OPTIONS, required: true },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

// Satış rolünün "tüm bağlantıları" (fiyatsız, yoldakiler dahil) görebilmesi için.
// sellable_contracts view'ı 0007 migration'ı ile oluşur.
export const sellableContractsResource: ResourceConfig = {
  table: "sellable_contracts",
  title: "Bağlantılar",
  singular: "Bağlantı",
  writeRoles: [],
  orderBy: { column: "eta", ascending: true },
  searchFields: ["contract_no", "vessel", "origin_country"],
  filterFields: ["status", "product_id"],
  listFields: ["contract_no", "vessel", "product_id", "quantity", "eta", "status"],
  fields: [
    { name: "contract_no", label: "Sözleşme No", type: "text" },
    { name: "vessel", label: "Gemi / Araç", type: "text" },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name" } },
    { name: "quantity", label: "Miktar", type: "number" },
    { name: "unit", label: "Birim", type: "text" },
    { name: "origin_country", label: "Menşe Ülke", type: "text" },
    { name: "eta", label: "ETA (Tahmini Varış)", type: "date" },
    { name: "status", label: "Durum", type: "select", options: CONTRACT_STATUS_OPTIONS },
    { name: "principal_id", label: "Kimin Adına", type: "reference", ref: { table: "principals", labelField: "name" } },
  ],
};

export const productsResource: ResourceConfig = {
  table: "products",
  title: "Ürünler",
  singular: "Ürün",
  writeRoles: ["admin", "purchasing", "operations"],
  defaultValues: { unit: "ton" },
  orderBy: { column: "name", ascending: true },
  searchFields: ["name", "code"],
  listFields: ["name", "code", "category", "unit", "is_active"],
  fields: [
    { name: "name", label: "Ürün Adı", type: "text", required: true, unique: true },
    { name: "code", label: "Kod", type: "text", unique: true },
    { name: "category", label: "Kategori", type: "text" },
    { name: "unit", label: "Birim", type: "text" },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};

export const warehousesResource: ResourceConfig = {
  table: "warehouses",
  title: "Depolar / Fabrikalar",
  singular: "Depo",
  writeRoles: ["admin", "operations"],
  orderBy: { column: "name", ascending: true },
  searchFields: ["name", "city"],
  listFields: ["name", "type", "city", "capacity", "is_active"],
  fields: [
    { name: "name", label: "Ad", type: "text", required: true, unique: true },
    { name: "type", label: "Tür", type: "select", options: LOCATION_TYPE_OPTIONS, required: true },
    { name: "city", label: "Şehir", type: "text" },
    { name: "capacity", label: "Kapasite", type: "number" },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};

export const principalsResource: ResourceConfig = {
  table: "principals",
  title: "Adına Alınanlar",
  singular: "Firma",
  writeRoles: ["admin"],
  orderBy: { column: "name", ascending: true },
  searchFields: ["name"],
  listFields: ["name", "is_active"],
  fields: [
    { name: "name", label: "Firma Adı", type: "text", required: true, unique: true },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};
