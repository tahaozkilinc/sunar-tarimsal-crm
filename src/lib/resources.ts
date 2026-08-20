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
    | "time"
    | "select"
    | "select_other" // sabit seçenekler + "Diğer" seçilirse serbest metin kutusu açılır
    | "reference"
    | "boolean"
    | "email"
    | "tel"
    | "url"
    | "file"
    | "map";
  required?: boolean;
  unique?: boolean;
  positive?: boolean; // sayı > 0 olmalı
  min?: number; // sayı için alt sınır (dahil)
  bucket?: string; // "file" tipi için Supabase Storage kovası
  // "map" tipi için: bu alan enlem (lat) kolonuna bağlanır, pairField boylam
  // (lng) kolonunun adıdır — tek widget iki kolonu birlikte okur/yazar.
  pairField?: string;
  // true ise bu alan formda kendinden ÖNCEKİ alanla aynı satırda, dar bir
  // sütunda gösterilir (ör. "Miktar" yanında "Birim") — alt satıra düşmez.
  inlineAfter?: boolean;
  options?: SelectOption[];
  // select_other için: sabit "options" yerine (ya da yanında) başka bir
  // tablonun kolonundaki DISTINCT, boş olmayan değerlerden seçenek türetir
  // (ör. Şehir: warehouses.city — depoların olduğu şehirler otomatik listelenir).
  // Değerler Türkçe büyük harfe çevrilip listelenir; "Diğer" ile serbest yazım
  // hâlâ mümkündür.
  optionsSource?: { table: string; column: string };
  // labelField: tek etiket kolonu. labelFields: sırayla denenen yedek kolonlar
  // (ilk boş olmayan kullanılır; ör. gemi adı yoksa sözleşme no).
  ref?: { table: string; labelField: string; labelFields?: string[]; filter?: Record<string, string[]> };
  autofill?: Record<string, string>;
  // Bu alanın değeri iki başka alanın çarpımı olarak CANLI hesaplanır (ör.
  // Miktar × Birim Fiyat -> Sözleşme Tutarı) — yalnızca YENİ kayıt açılırken
  // (mevcut kaydı düzenlerken dokunulmaz, bkz. resource-manager.tsx fxCapture
  // ile aynı "sadece yeni kayıt" koruması). Alan yine de normal düzenlenebilir
  // bir input olarak kalır; kullanıcı hesaplanan değeri elle üzerine yazabilir.
  multiplyOf?: [string, string];
  formHidden?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  // "date" alanı için: liste/detay hücresinde tarihin yanına her zaman
  // DeadlineBadge (kaç gün kaldı/geçti) eklenir — yalnız yaklaşınca değil,
  // her zaman görünür olsun diye (bkz. resource-manager.tsx renderCell).
  showDeadline?: boolean;
}

// Bir kaydın bir "kapasiteyi" (ör. bağlantı tonajı) aşmasını engelleyen kota tanımı.
export interface QuotaRule {
  field: string; // bu kaynaktaki referans alanı (ör. "contract_id")
  amountField: string; // bu kaynaktaki miktar alanı (ör. "quantity")
  capacityTable: string; // kapasitenin okunacağı tablo/görünüm (ör. "sellable_contracts")
  capacityField: string; // kapasite kolonu (ör. "quantity")
  statusField?: string; // hariç tutulacak durumlar için durum kolonu
  excludeStatus?: string[]; // toplama dahil edilmeyecek durumlar (ör. ["cancelled"])
}

export interface ResourceConfig {
  table: string;
  title: string;
  singular: string;
  writeRoles: Role[];
  fields: FieldDef[];
  listFields: string[];
  // Filtre kenar çubuğu artık otomatik: reference/select/boolean -> açılır liste,
  // date/number/money -> aralık, geri kalan (text/textarea/select_other/...) ->
  // serbest metin arama. Tüm alanlar için ayrıca listelemeye gerek yok (bkz.
  // resource-manager.tsx). file/map alanları filtrelenemez.
  orderBy?: { column: string; ascending?: boolean };
  filter?: Record<string, string | number | boolean | string[]>;
  defaultValues?: Record<string, unknown>;
  quota?: QuotaRule;
  // Yeni kayıt açılırken o günün TCMB kurunu (usd_try/eur_try/fx_date) otomatik doldur.
  fxCapture?: boolean;
  // Silme işlemini soft-delete'e çevirir (DELETE yerine column=false yapar).
  softDelete?: { column: string };
  // true ise bu kaynağın "text" tipi alanları (textarea/notlar hariç) yazarken
  // otomatik BÜYÜK HARFE çevrilir — veri girişini standartlaştırır. Kasıtlı
  // olarak yerel ayarsız (Türkçe değil): "i" -> "I" (İngilizce/ASCII), "İ" değil.
  uppercaseText?: boolean;
  // true ise sayfa açılışında yalnızca en son (orderBy'a göre) 20 kayıt
  // çekilir/render edilir; "Daha Fazla Göster" ile tümü açılır. Yalnızca
  // KRONOLOJİK (created_at/tarih DESC) kayıtlar için anlamlıdır — ada göre
  // alfabetik listelerde (firmalar, depolar) "ilk 20" kafa karıştırır,
  // bu yüzden genele değil yalnızca gerekene açılır.
  limitToRecent?: boolean;
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
  { value: "surveyor", label: "Gözetim Şirketi", color: "yellow" },
  { value: "port", label: "Liman", color: "gray" },
  { value: "carrier", label: "Nakliyeci", color: "red" },
  { value: "agent", label: "Acente", color: "purple" },
  // Broker ikiye ayrılır: Hammadde Brokeri (satın alma, sözleşme aracısı —
  // sözleşme açılışında seçilir) ve Gemi Brokeri (operasyon, navlun/gemi
  // aracısı — gözetim/liman/nakliyeci/acente gibi ship-ops'tan atanır).
  { value: "broker", label: "Hammadde Brokeri", color: "green" },
  { value: "ship_broker", label: "Gemi Brokeri", color: "blue" },
];

export const LOCATION_TYPE_OPTIONS: SelectOption[] = [
  { value: "warehouse", label: "Depo", color: "blue" },
  { value: "factory", label: "Fabrika", color: "purple" },
  { value: "foreign", label: "Yurtdışı Depo", color: "yellow" },
];

// Elle yazmaya kapalı: miktarın birimi yalnızca bu ikisinden seçilir.
export const UNIT_OPTIONS: SelectOption[] = [
  { value: "ton", label: "TON" },
  { value: "kg", label: "KG" },
];

export const EXPENSE_TYPE_OPTIONS: SelectOption[] = [
  { value: "storage", label: "Depolama", color: "blue" },
  { value: "handling", label: "Elleçleme", color: "purple" },
  { value: "loading", label: "Yükleme", color: "green" },
  { value: "port", label: "Liman", color: "gray" },
  { value: "customs", label: "Gümrük", color: "yellow" },
  { value: "demurrage", label: "Demuraj", color: "red" },
  { value: "freight", label: "Navlun", color: "blue" },
  { value: "insurance", label: "Sigorta", color: "purple" },
  { value: "survey", label: "Gözetim Ücreti", color: "yellow" },
  { value: "commission", label: "Komisyon", color: "green" },
  { value: "finance", label: "Finansman", color: "gray" },
  { value: "other", label: "Diğer", color: "gray" },
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
  { value: "origin_in", label: "Yurtdışı Depo Girişi", color: "yellow" },
  { value: "transfer", label: "Transfer", color: "blue" },
  { value: "to_factory", label: "Fabrikaya", color: "purple" },
  { value: "outbound_sale", label: "Satış Çıkışı", color: "red" },
  { value: "adjustment", label: "Düzeltme", color: "gray" },
];

export const SALES_STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Taslak", color: "gray" },
  { value: "confirmed", label: "Onaylandı", color: "blue" },
  { value: "delivered", label: "Teslim Edildi", color: "purple" },
  { value: "invoiced", label: "Faturalandı", color: "green" },
  { value: "cancelled", label: "İptal", color: "red" },
];

export const SALE_TYPE_OPTIONS: SelectOption[] = [
  { value: "TRANSİT", label: "Transit", color: "yellow" },
  { value: "MİLLİ", label: "Milli", color: "blue" },
];

// Depoya giren malın gümrük/menşe durumu (satıştaki Transit/Milli'den ayrı —
// burada iki seçenek de farklı: depo stoğu bazen yerli tedarik, bazen
// gümrüklenmiş/millileşmiş mal olabiliyor).
export const STOCK_STATUS_OPTIONS: SelectOption[] = [
  { value: "MİLLİ", label: "Milli", color: "blue" },
  { value: "YERLİ", label: "Yerli", color: "green" },
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
  writeRoles: ["admin", "purchasing", "sales", "operations"],
  orderBy: { column: "name", ascending: true },
  uppercaseText: true,
  listFields: ["name", "type", "city", "phone"],
  fields: [
    { name: "name", label: "Firma Adı", type: "text", required: true, unique: true },
    { name: "type", label: "Tür", type: "select", options: COMPANY_TYPE_OPTIONS, required: true },
    { name: "city", label: "Şehir", type: "text" },
    { name: "country", label: "Ülke", type: "text" },
    // Özellikle Liman türü için: haritadan tam konum işaretlenebilir (ör.
    // gümrüklü sahanın nerede olduğu) — warehousesResource ile aynı widget.
    { name: "lat", label: "Tam Konum (Haritadan Seç)", type: "map", pairField: "lng" },
    { name: "phone", label: "Telefon", type: "tel" },
    { name: "email", label: "E-posta", type: "email" },
    { name: "address", label: "Adres", type: "textarea" },
    { name: "logo_url", label: "Firma Logosu (PNG/JPG)", type: "file", bucket: "company-logos" },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const contactsResource: ResourceConfig = {
  table: "contacts",
  title: "Kişiler",
  singular: "Kişi",
  // companiesResource ile aynı: firma açabilen rol, o firmaya kişi de ekleyebilmeli.
  // RLS (contacts_write 0018 + can_see_company 0019) operasyona zaten izin veriyor;
  // burada UI'daki "Ekle" düğmesi de açılır. (_view rolleri ham rolle hariç kalır.)
  writeRoles: ["admin", "purchasing", "sales", "operations"],
  orderBy: { column: "full_name", ascending: true },
  uppercaseText: true,
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

// contacts (companies) ile AYNI desen, depo için — bkz. 0064. Ayrı bir tablo:
// contacts.company_id NOT NULL olduğundan bu ilişkiyi contacts'a eklemek o
// tabloyu riske atardı.
export const warehouseContactsResource: ResourceConfig = {
  table: "warehouse_contacts",
  title: "Depo Yetkilileri",
  singular: "Yetkili",
  writeRoles: ["admin", "operations"],
  orderBy: { column: "full_name", ascending: true },
  uppercaseText: true,
  listFields: ["full_name", "title", "phone", "email"],
  fields: [
    { name: "warehouse_id", label: "Depo", type: "reference", ref: { table: "warehouses", labelField: "name" }, required: true },
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
  writeRoles: ["admin", "purchasing", "sales", "operations"],
  orderBy: { column: "created_at", ascending: false },
  listFields: ["subject", "activity_type", "company_id", "due_date", "status", "created_at"],
  fields: [
    { name: "subject", label: "Konu", type: "text", required: true },
    { name: "activity_type", label: "Tür", type: "select", options: ACTIVITY_TYPE_OPTIONS, required: true },
    { name: "company_id", label: "Firma", type: "reference", ref: { table: "companies", labelField: "name" } },
    { name: "due_date", label: "Tarih", type: "date" },
    { name: "status", label: "Durum", type: "select", options: ACTIVITY_STATUS_OPTIONS, required: true },
    { name: "description", label: "Açıklama", type: "textarea" },
    // Notu/aktiviteyi oluşturduğum GÜN kenara not düşülsün istendi — due_date
    // (aktivitenin kendi tarihi) ile karışmasın diye ayrı etiket.
    { name: "created_at", label: "Oluşturulma Tarihi", type: "date", readOnly: true },
  ],
};

export const purchaseContractsResource: ResourceConfig = {
  table: "purchase_contracts",
  title: "Satın Alma Sözleşmeleri",
  singular: "Sözleşme",
  writeRoles: ["admin", "purchasing"],
  defaultValues: { unit: "ton", currency: "USD" },
  orderBy: { column: "created_at", ascending: false },
  listFields: ["contract_no", "supplier_id", "product_id", "quantity", "eta", "status", "created_by"],
  fxCapture: true,
  uppercaseText: true,
  fields: [
    // Sözleşme No artık ZORUNLU DEĞİL: sonradan da girilebilir (DB'de zaten
    // NOT NULL değil; uq_pc_contract_no yalnızca DOLU değerlerde benzersizlik
    // ister — 0035_data_integrity.sql — yani boş bırakmak hâlâ güvenli).
    { name: "contract_no", label: "Sözleşme No", type: "text", unique: true },
    { name: "contract_date", label: "Sözleşme Tarihi", type: "date", required: true },
    { name: "supplier_id", label: "Tedarikçi", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["supplier", "both"] } }, required: true },
    // Hammadde Brokeri: sözleşme açılışında seçilir. Gemi Brokeri (ship_broker_id)
    // BUNUN AYRISI — aşağıda, agent_id ile birlikte formHidden (ship-ops'tan atanır).
    { name: "broker_id", label: "Hammadde Brokeri", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["broker"] } } },
    { name: "product_id", label: "Ürün (Yağlı Tohum)", type: "reference", ref: { table: "products", labelField: "name", filter: { is_active: ["true"] } } },
    { name: "quantity", label: "Miktar", type: "number", required: true, positive: true },
    { name: "unit", label: "Birim", type: "select", options: UNIT_OPTIONS, required: true, inlineAfter: true },
    { name: "price", label: "Birim Fiyat", type: "money", required: true, positive: true },
    { name: "currency", label: "Para Birimi", type: "select", options: CURRENCY_OPTIONS },
    // Miktar × Birim Fiyat — yeni kayıtta canlı otomatik hesaplanır (bkz.
    // FieldDef.multiplyOf, resource-manager.tsx), gerekirse elle revize edilir.
    { name: "contract_amount", label: "Sözleşme Tutarı", type: "money", multiplyOf: ["quantity", "price"] },
    { name: "incoterm", label: "Teslim Şekli", type: "select", options: INCOTERM_OPTIONS },
    { name: "origin_country", label: "Menşe Ülke", type: "text" },
    { name: "loading_port", label: "Yükleme Limanı", type: "text" },
    { name: "vessel", label: "Gemi / Araç", type: "text" },
    { name: "eta", label: "ETA (Tahmini Varış)", type: "date" },
    { name: "laycan_start", label: "Laycan Başlangıç", type: "date" },
    { name: "laycan_end", label: "Laycan Bitiş", type: "date" },
    { name: "status", label: "Durum", type: "select", options: CONTRACT_STATUS_OPTIONS, required: true },
    // Sözleşme açılışında zorunlu DEĞİL: ship-ops sayfasındaki "Operasyon
    // Tarafları" kartından (gözetim/liman/nakliyeci ile aynı akış) sonradan
    // atanır (bkz. assign_ship_parties, 0057). formHidden -> formdan gizli
    // ama Detay görünümünde ve DB'de kalır (bkz. resource-manager.tsx).
    { name: "assigned_to", label: "Operasyon Sorumlusu", type: "reference", ref: { table: "profiles", labelField: "full_name", filter: { role: ["operations"] } }, formHidden: true },
    { name: "agent_id", label: "Acente (Yükleme Takibi)", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["agent"] } }, formHidden: true },
    // Gemi Brokeri: gözetim/liman/nakliyeci/acente gibi sözleşme açılışında
    // DEĞİL, gemi netleştikçe ship-ops'taki "Operasyon Tarafları" kartından atanır.
    { name: "ship_broker_id", label: "Gemi Brokeri", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["ship_broker"] } }, formHidden: true },
    { name: "payment_due_date", label: "Öngörülen Ödeme Tarihi", type: "date" },
    // Alıcı artık sabit dizi değil, Yönetim -> Alıcılar'dan düzenlenebilir liste
    // (principals -- "Kimin Adına" -- ile AYNI desen, bkz. buyersResource).
    { name: "buyer_id", label: "Alıcı", type: "reference", ref: { table: "buyers", labelField: "name" } },
    { name: "principal_id", label: "Kimin Adına", type: "reference", ref: { table: "principals", labelField: "name" } },
    { name: "created_at", label: "Sisteme Giriş Tarihi", type: "date", readOnly: true },
    // profiles yerine profile_names (geniş okunabilir, yalnızca ad) — bkz.
    // ship-ops-page.tsx'teki "Giren" kolonuyla aynı desen.
    { name: "created_by", label: "Ekleyen", type: "reference", ref: { table: "profile_names", labelField: "full_name" }, readOnly: true },
    { name: "contract_file_url", label: "Sözleşme Dosyası (PDF)", type: "file", bucket: "contracts" },
    { name: "usd_try", label: "USD/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "eur_try", label: "EUR/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "fx_date", label: "Kur Tarihi", type: "date" },
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
  listFields: ["movement_date", "contract_id", "product_id", "warehouse_id", "movement_type", "quantity", "created_by"],
  limitToRecent: true,
  fields: [
    { name: "movement_date", label: "Tarih", type: "date", required: true },
    { name: "movement_time", label: "Saat", type: "time", inlineAfter: true },
    { name: "contract_id", label: "Kaynak Sözleşme (Gemi)", type: "reference", ref: { table: "purchase_contracts", labelField: "vessel", labelFields: ["vessel", "contract_no"] }, autofill: { product_id: "product_id", unit: "unit" } },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name", filter: { is_active: ["true"] } } },
    { name: "warehouse_id", label: "Depo / Fabrika", type: "reference", ref: { table: "warehouses", labelField: "name" }, required: true },
    { name: "movement_type", label: "Hareket Tipi", type: "select", options: MOVEMENT_TYPE_OPTIONS, required: true },
    { name: "quantity", label: "Miktar", type: "number", required: true, positive: true },
    { name: "unit", label: "Birim", type: "text" },
    // Girişte (Giriş / Yurtdışı Depo Girişi / Düzeltme) malın durumu — opsiyonel.
    { name: "stock_status", label: "Milli / Yerli", type: "select", options: STOCK_STATUS_OPTIONS },
    { name: "vehicle_plate", label: "Araç Plakası", type: "text" },
    { name: "driver_name", label: "Şoför", type: "text" },
    // Gemiden boşaltma (ship-ops-page.tsx) da, buradaki elle giriş de AYNI
    // tabloya yazar — ikisi için de kim girdiğini gösterir (bkz. DB default
    // auth.uid(); profile_names geniş okunabilir, yalnızca ad).
    { name: "created_by", label: "Giren", type: "reference", ref: { table: "profile_names", labelField: "full_name" }, readOnly: true },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const salesOrdersResource: ResourceConfig = {
  table: "sales_orders",
  title: "Satışlar",
  singular: "Satış",
  writeRoles: ["admin", "sales"],
  defaultValues: { unit: "ton", currency: "TRY" },
  // En yakın son teslim tarihi en üstte (kullanıcı isteği: sevkiyatı en
  // yaklaşan satış ilk sırada görünsün). final_sale_date NULL olan (eski/
  // geçiş öncesi) kayıtlar Postgres'in varsayılan davranışıyla en sona düşer.
  orderBy: { column: "final_sale_date", ascending: true },
  listFields: ["order_no", "customer_id", "sale_type", "product_id", "quantity", "final_sale_date", "status", "created_by"],
  fxCapture: true,
  uppercaseText: true,
  // Kaynak bağlantı (gemi) artık elle seçilmiyor: fn_sales_order_autofill_contract
  // trigger'ı (0048) product_id + quantity'ye göre uygun bağlantıyı otomatik
  // atıyor ve DB'de aynı "fazla satış" kontrolünü zaten yapıyor — bu yüzden
  // burada ayrıca istemci tarafı kota kontrolüne gerek kalmadı.
  fields: [
    { name: "order_no", label: "Satış No", type: "text", unique: true },
    { name: "customer_id", label: "Müşteri", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["customer", "both"] } }, required: true },
    { name: "sale_type", label: "Satış Tipi", type: "select", options: SALE_TYPE_OPTIONS, required: true },
    // Şehir: depoların bulunduğu şehirler otomatik listelenir (optionsSource);
    // listede yoksa "Diğer" ile serbest yazılabilir (büyük harfe çevrilir). "Diğer"
    // metin kutusu için yeterli genişlik kalsın diye ayrı satırda (inlineAfter yok).
    { name: "city", label: "Şehir", type: "select_other", optionsSource: { table: "warehouses", column: "city" }, required: true },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name", filter: { is_active: ["true"] } }, required: true },
    // Kaynak bağlantı (gemi) artık burada seçilmiyor — trigger otomatik atar
    // (bkz. üstteki not). Detay görünümünde hangi bağlantıya düştüğü görünür.
    { name: "contract_id", label: "Kaynak Bağlantı (Gemi)", type: "reference", ref: { table: "sellable_contracts", labelField: "vessel", labelFields: ["vessel", "contract_no"] }, formHidden: true },
    // Çıkış deposu artık TEK seçim değil: kaydettikten sonra "Detay" görünümünde
    // "Sevkiyat Depoları" bölümünden çoklu depo seçilir (sale_warehouses).
    { name: "quantity", label: "Miktar", type: "number", required: true, positive: true },
    { name: "unit", label: "Birim", type: "select", options: UNIT_OPTIONS, required: true, inlineAfter: true },
    { name: "price", label: "Birim Fiyat", type: "money", min: 0 },
    { name: "currency", label: "Para Birimi", type: "select", options: CURRENCY_OPTIONS, inlineAfter: true },
    // Sevkiyatın bitirilmesi beklenen son gün — yaklaştıkça/geçtikçe Satışlar
    // panelinde ve Satış Operasyon ekranında uyarı rozeti gösterilir.
    { name: "final_sale_date", label: "Son Teslim Tarihi", type: "date", required: true, showDeadline: true },
    { name: "status", label: "Durum", type: "select", options: SALES_STATUS_OPTIONS, required: true },
    { name: "usd_try", label: "USD/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "eur_try", label: "EUR/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "fx_date", label: "Kur Tarihi", type: "date" },
    { name: "created_by", label: "Satışı Giren", type: "reference", ref: { table: "profile_names", labelField: "full_name" }, readOnly: true },
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
  listFields: ["contract_no", "vessel", "product_id", "quantity", "eta", "status"],
  fields: [
    { name: "contract_no", label: "Sözleşme No", type: "text" },
    { name: "vessel", label: "Gemi / Araç", type: "text" },
    { name: "product_id", label: "Ürün", type: "reference", ref: { table: "products", labelField: "name", filter: { is_active: ["true"] } } },
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
  defaultValues: { unit: "ton", is_active: true },
  orderBy: { column: "name", ascending: true },
  filter: { is_active: true },
  softDelete: { column: "is_active" },
  listFields: ["name", "code", "category", "unit", "is_active"],
  fields: [
    { name: "name", label: "Ürün Adı", type: "text", required: true, unique: true },
    { name: "code", label: "Kod", type: "text", unique: true },
    { name: "category", label: "Kategori", type: "text" },
    { name: "unit", label: "Birim", type: "text" },
    { name: "hs_code", label: "GTİP / HS Kodu", type: "text", placeholder: "100590000019" },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};

export const warehousesResource: ResourceConfig = {
  table: "warehouses",
  title: "Depolar / Fabrikalar",
  singular: "Depo",
  writeRoles: ["admin", "operations"],
  orderBy: { column: "name", ascending: true },
  uppercaseText: true,
  listFields: ["name", "type", "city", "lat", "capacity", "is_active"],
  fields: [
    { name: "name", label: "Ad", type: "text", required: true, unique: true },
    { name: "type", label: "Tür", type: "select", options: LOCATION_TYPE_OPTIONS, required: true },
    // Tek antrepoda birden fazla bölüm/depo olabilir — gerekirse bu bölümün
    // bağlı olduğu ana depo/antrepo buradan seçilir (opsiyonel).
    { name: "parent_id", label: "Bağlı Olduğu Ana Depo (Antrepo)", type: "reference", ref: { table: "warehouses", labelField: "name" } },
    // Ürün bazen limanın kendi gümrüklü sahasında bekler — bu depo/bölüm
    // fiilen bir limanın içindeyse buradan işaretlenir (opsiyonel).
    { name: "port_id", label: "Bulunduğu Liman (Gümrüklü Saha)", type: "reference", ref: { table: "companies", labelField: "name", filter: { type: ["port"] } } },
    { name: "city", label: "Şehir", type: "text" },
    { name: "country", label: "Ülke", type: "text", placeholder: "Yurtdışı depo için" },
    // Tek widget: haritaya tıkla ya da "Konumumu Kullan" ile tam enlem/boylam
    // gir. Doluysa Harita sekmesi city/country tahmini yerine bunu kullanır.
    { name: "lat", label: "Tam Konum (Haritadan Seç)", type: "map", pairField: "lng" },
    { name: "capacity", label: "Kapasite", type: "number", min: 0 },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};

// Operasyon / depo masrafları: depolama-elleçleme gibi DEPO giderleri ve
// demuraj-navlun-sigorta-gözetim gibi GEMİ giderleri tek tabloda. Depo veya
// bağlantıdan en az biri seçilmelidir (DB kuralı); bağlantıya bağlanan masraf
// maliyet raporunda o geminin kârından düşer. fxCapture günün TCMB kurunu yazar.
export const warehouseExpensesResource: ResourceConfig = {
  table: "warehouse_expenses",
  title: "Operasyon / Depo Masrafları",
  singular: "Masraf",
  writeRoles: ["admin", "operations", "maliyet"],
  defaultValues: { currency: "USD", expense_type: "storage" },
  orderBy: { column: "expense_date", ascending: false },
  listFields: ["expense_date", "warehouse_id", "expense_type", "contract_id", "amount", "currency"],
  fxCapture: true,
  fields: [
    { name: "expense_date", label: "Tarih", type: "date", required: true },
    { name: "warehouse_id", label: "Depo / Fabrika (depo gideri ise)", type: "reference", ref: { table: "warehouses", labelField: "name" } },
    { name: "expense_type", label: "Masraf Türü", type: "select", options: EXPENSE_TYPE_OPTIONS, required: true },
    { name: "contract_id", label: "Bağlantı (Gemi) — maliyete yansır", type: "reference", ref: { table: "purchase_contracts", labelField: "vessel", labelFields: ["vessel", "contract_no"] } },
    { name: "amount", label: "Tutar", type: "money", required: true, min: 0 },
    { name: "currency", label: "Para Birimi", type: "select", options: CURRENCY_OPTIONS },
    { name: "usd_try", label: "USD/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "eur_try", label: "EUR/TRY (TCMB)", type: "number", placeholder: "Otomatik" },
    { name: "fx_date", label: "Kur Tarihi", type: "date" },
    { name: "notes", label: "Notlar", type: "textarea" },
  ],
};

export const principalsResource: ResourceConfig = {
  table: "principals",
  title: "Adına Alınanlar",
  singular: "Firma",
  writeRoles: ["admin"],
  orderBy: { column: "name", ascending: true },
  listFields: ["name", "is_active"],
  fields: [
    { name: "name", label: "Firma Adı", type: "text", required: true, unique: true },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};

// Sözleşmedeki "Alıcı" alanı artık sabit bir dizi değil, bu yönetilebilir
// listeden seçiliyor — principalsResource ile birebir aynı desen (0068).
export const buyersResource: ResourceConfig = {
  table: "buyers",
  title: "Alıcılar",
  singular: "Alıcı",
  writeRoles: ["admin"],
  orderBy: { column: "name", ascending: true },
  listFields: ["name", "is_active"],
  fields: [
    { name: "name", label: "Alıcı Adı", type: "text", required: true, unique: true },
    { name: "is_active", label: "Aktif", type: "boolean" },
  ],
};
