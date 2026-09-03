// Uygulamadaki temel veri tipleri. Şema genişledikçe burayı da genişletin.

export type Role =
  | "admin"
  | "purchasing"
  | "operations"
  | "sales"
  | "finans"
  | "maliyet"
  | "viewer"
  | "nakliyeci"
  | "gozetim"
  | "acente"
  | "sales_ops"
  | "purchasing_view"
  | "operations_view"
  | "sales_view"
  | "pending";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  phone: string | null;
  is_active: boolean;
  company_id: string | null; // nakliyeci/gozetim -> bağlı olduğu 'carrier'/'surveyor' firma
  language: "tr" | "en"; // arayüz dili — Profilim sayfasından kullanıcı kendi seçer
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  // broker = Hammadde Brokeri (satın alma, sözleşme aracısı), ship_broker =
  // Gemi Brokeri (operasyon, navlun/gemi aracısı) — ikisi ayrı roller.
  type: "supplier" | "customer" | "both" | "surveyor" | "port" | "carrier" | "agent" | "broker" | "ship_broker";
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  lat: number | null; // haritadan seçilen tam konum — ör. Liman'ın gümrüklü sahası
  lng: number | null;
  logo_url: string | null;
  notes: string | null;
  product_tags: string[]; // bu firmanın (tedarikçi) getirdiği ürünler — sözleşmelerden otomatik türetilir
  created_at: string;
}

export interface Contact {
  id: string;
  company_id: string;
  full_name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Product {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  unit: string;
  hs_code: string | null; // GTİP kodu
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  type: "warehouse" | "factory" | "foreign"; // foreign = yurtdışı depo
  parent_id: string | null; // doluysa bu bir antrepo bölümü/alt deposu
  port_id: string | null; // doluysa bu depo/bölüm bir limanın gümrüklü sahasında
  city: string | null;
  country: string | null;
  lat: number | null; // haritadan seçilen tam konum (doluysa city/country tahmininin önüne geçer)
  lng: number | null;
  capacity: number | null;
  is_active: boolean;
}

// Depo/liman ile anlaşmalı fiyat (tarife) — fiilen oluşan bir masraf değil,
// standing bir anlaşma kaydı (bkz. warehouse_expenses ile farkı, resources.ts).
export interface PricingAgreement {
  id: string;
  target_type: "warehouse" | "port";
  warehouse_id: string | null;
  port_id: string | null;
  pricing_model: "per_ton" | "annual" | "monthly" | "flat";
  price: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseContract {
  id: string;
  contract_no: string | null;
  contract_date: string | null; // sözleşmenin kendi tarihi (created_at -> sisteme girildiği an, ayrı)
  supplier_id: string | null;
  product_id: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  contract_amount: number | null; // = quantity × price, yeni kayıtta otomatik hesaplanır, elle revize edilebilir
  currency: string;
  incoterm: string | null;
  origin_country: string | null;
  loading_port: string | null;
  vessel: string | null;
  etd: string | null; // tahmini kalkış — gantt çubuğunun başlangıcı (laycan DEĞİL)
  eta: string | null;
  laycan_start: string | null;
  laycan_end: string | null;
  status: string;
  payment_due_date: string | null;
  buyer_id: string | null;
  principal_id: string | null;
  contract_file_url: string | null;
  assigned_to: string | null;
  surveyor_id: string | null;
  port_id: string | null;
  carrier_id: string | null;
  agent_id: string | null; // yurtdışı yükleme takip acentesi
  broker_id: string | null; // Hammadde Brokeri — sözleşme açılışında seçilir
  ship_broker_id: string | null; // Gemi Brokeri — ship-ops'tan sonradan atanır
  created_at: string;
  notes: string | null;
}

export interface Buyer {
  id: string;
  name: string;
  is_active: boolean;
}

export interface StockMovement {
  id: string;
  contract_id: string | null;
  product_id: string | null;
  warehouse_id: string | null;
  movement_type: string;
  quantity: number;
  unit: string;
  stock_status: string | null; // Milli/Antrepo ya da "Diğer" ile serbest metin (opsiyonel)
  customs_declaration_no: string | null; // gümrük beyanname no — Milli: IM..., Antrepo: AN...
  movement_date: string;
  movement_time: string | null; // opsiyonel: aracın fiilen hareket ettiği saat
  vehicle_plate: string | null;
  driver_name: string | null;
  sale_id: string | null; // outbound_sale: hangi satışa ait sevkiyat
  notes: string | null;
  created_by: string | null;
}

export interface SalesOrder {
  id: string;
  order_no: string | null;
  customer_id: string; // zorunlu: stok bir müşteriye gider
  // contract_id artık ELLE seçilmiyor: fn_sales_order_autofill_contract()
  // trigger'ı (0048), product_id + quantity'ye göre uygun (kalan tonajı yeten,
  // ETA'sı en yakın) bağlantıyı otomatik atar. "Bağlantısız satış olmaz"
  // kuralı DB'de aynen geçerli — yalnızca kim seçtiği değişti.
  contract_id: string;
  sale_type: string | null; // Depodan/Gemiden/Antrepodan ya da "Diğer" ile serbest metin
  city: string | null; // depoların bulunduğu şehirlerden seçilir, gerekirse serbest (büyük harf)
  product_id: string; // zorunlu: artık kullanıcı doğrudan ürünü seçiyor (gemi değil)
  // warehouse_id yok: hangi depodan sevk edileceğine burada değil, sevkiyat
  // anında Satış Operasyon ekranında (sales-dispatch.tsx) operasyoncu karar verir.
  quantity: number;
  unit: string;
  price: number | null;
  currency: string;
  delivery_date: string | null; // teslim penceresi başlangıcı
  delivery_date_to: string | null; // teslim penceresi bitişi (opsiyonel)
  final_sale_date: string | null; // sevkiyatın bitirilmesi beklenen son gün
  status: string;
  payment_due_date: string | null; // müşterinin ödeyeceği vade
  dispatch_closed_at: string | null; // operasyoncu "Sevkiyatı Bitir" dediyse dolu
  dispatch_closed_by: string | null;
  notes: string | null;
}

export interface CrmActivity {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  module: "purchasing" | "sales" | "operations" | "broker";
  activity_type: string;
  subject: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}
