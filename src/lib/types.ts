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
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  type: "supplier" | "customer" | "both" | "surveyor" | "port" | "carrier" | "agent";
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  notes: string | null;
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
  hs_code: string | null; // GTİP kodu (TUİK karşılaştırması için)
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  type: "warehouse" | "factory" | "foreign"; // foreign = yurtdışı depo
  city: string | null;
  country: string | null;
  lat: number | null; // haritadan seçilen tam konum (doluysa city/country tahmininin önüne geçer)
  lng: number | null;
  capacity: number | null;
  is_active: boolean;
}

export interface PurchaseContract {
  id: string;
  contract_no: string | null;
  supplier_id: string | null;
  product_id: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  currency: string;
  incoterm: string | null;
  origin_country: string | null;
  loading_port: string | null;
  vessel: string | null;
  eta: string | null;
  laycan_start: string | null;
  laycan_end: string | null;
  status: string;
  payment_due_date: string | null;
  buyer: string | null;
  principal_id: string | null;
  contract_file_url: string | null;
  assigned_to: string | null;
  surveyor_id: string | null;
  port_id: string | null;
  carrier_id: string | null;
  agent_id: string | null; // yurtdışı yükleme takip acentesi
  combined_shipment_id: string | null;
  created_at: string;
  notes: string | null;
}

export interface StockMovement {
  id: string;
  contract_id: string | null;
  product_id: string | null;
  warehouse_id: string | null;
  movement_type: string;
  quantity: number;
  unit: string;
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
  contract_id: string; // zorunlu: bağlantısız satış olmaz
  product_id: string | null;
  // warehouse_id KALDIRILDI: bir satış artık TEK depoya değil, sale_warehouses
  // junction tablosundaki İZİNLİ depo kümesine bağlı (çoklu depo).
  quantity: number;
  unit: string;
  price: number | null;
  currency: string;
  delivery_date: string | null;
  status: string;
  dispatch_closed_at: string | null; // operasyoncu "Sevkiyatı Bitir" dediyse dolu
  dispatch_closed_by: string | null;
  notes: string | null;
}

// sale_warehouses: bir satışın sevk edilebileceği izinli depolar (çoklu).
export interface SaleWarehouse {
  sale_id: string;
  warehouse_id: string;
}

export interface CrmActivity {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  module: "purchasing" | "sales" | "operations";
  activity_type: string;
  subject: string;
  description: string | null;
  due_date: string | null;
  status: string;
}
