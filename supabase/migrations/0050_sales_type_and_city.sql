-- Sunar Tarımsal CRM - Satışta "Satış Tipi" (Transit/Milli) ve "Şehir"
-- ----------------------------------------------------------------------------
-- İkisi de NULLABLE: mevcut 2 kayıt tahmini bir değerle "düzeltilmiyor"
-- (yanlış sınıflandırma riski) — yalnızca formda (UI) yeni satışlar için
-- zorunlu. sale_type kapalı bir liste olduğu için CHECK ile DB'de de
-- sınırlandı; city serbest metin (Şehir alanı "Diğer" ile serbest yazılabilir
-- olduğu için burada kapalı liste kısıtı YOK).

alter table public.sales_orders
  add column if not exists sale_type text,
  add column if not exists city text;

alter table public.sales_orders
  add constraint sales_orders_sale_type_check
  check (sale_type is null or sale_type in ('TRANSİT','MİLLİ'));

comment on column public.sales_orders.sale_type is
  'TRANSİT ya da MİLLİ (yurtiçi) satış sınıflandırması.';
comment on column public.sales_orders.city is
  'Satışın yapıldığı şehir — depoların bulunduğu şehirlerden seçilebilir, gerekirse serbest yazılabilir (büyük harf).';
