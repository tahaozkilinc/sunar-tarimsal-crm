// Uygulamadaki temel veri tipleri. Şema genişledikçe burayı da genişletin.

export type Role =
  | "admin"
  | "purchasing"
  | "operations"
  | "sales"
  | "finans"
  | "maliyet"
  | "viewer"
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
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  type: "supplier" | "customer" | "both";
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
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
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  type: "warehouse" | "factory";
  city: string | null;
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
  vehicle_plate: string | null;
  driver_name: string | null;
  notes: string | null;
}

export interface SalesOrder {
  id: string;
  order_no: string | null;
  customer_id: string | null;
  contract_id: string | null;
  product_id: string | null;
  warehouse_id: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  currency: string;
  delivery_date: string | null;
  status: string;
  notes: string | null;
}

export interface CrmActivity {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  module: "purchasing" | "sales";
  activity_type: string;
  subject: string;
  description: string | null;
  due_date: string | null;
  status: string;
}
