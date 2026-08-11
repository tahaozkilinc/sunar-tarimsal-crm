-- Sunar Tarımsal CRM - Satışta "Son Satış Tarihi" (sevkiyatın bitirilmesi
-- beklenen son gün)
-- ----------------------------------------------------------------------------
-- Nullable: mevcut kayıtlar tahmini bir tarihle "düzeltilmiyor" — yalnızca
-- formda (UI) yeni satışlar için zorunlu.

alter table public.sales_orders
  add column if not exists final_sale_date date;

comment on column public.sales_orders.final_sale_date is
  'Son satış (sevkiyatın bitirilmesi beklenen) tarihi — yaklaştıkça/geçtikçe Satışlar ve Satış Operasyon ekranlarında uyarı gösterilir.';
