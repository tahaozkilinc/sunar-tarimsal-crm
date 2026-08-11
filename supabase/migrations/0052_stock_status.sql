-- Sunar Tarımsal CRM - Depoya giren malın gümrük/menşe durumu (Milli / Yerli)
-- ----------------------------------------------------------------------------
-- Aynı depoda bazen gümrüklenmiş (MİLLİ) bazen yerli tedarik (YERLİ) mal aynı
-- anda bulunabiliyor. Giriş hareketinde (Giriş/Yurtdışı Depo Girişi/Düzeltme)
-- işaretlenir; opsiyonel — mevcut kayıtlar boş kalır, zorunlu tutulmadı (henüz
-- bilinmeyen/karma stok da olabilir).

alter table public.stock_movements
  add column if not exists stock_status text;

alter table public.stock_movements
  add constraint stock_movements_stock_status_check
  check (stock_status is null or stock_status in ('MİLLİ','YERLİ'));

comment on column public.stock_movements.stock_status is
  'Girişteki malın durumu: MİLLİ (gümrüklenmiş/millileşmiş) ya da YERLİ (yerli üretim/tedarik). Opsiyonel.';
