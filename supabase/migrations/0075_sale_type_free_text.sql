-- =============================================================================
-- Sunar Tarımsal CRM - Satış Tipi artık kapalı liste değil (Depodan/Gemiden/
-- Antrepodan + "Diğer" ile serbest metin)
-- ----------------------------------------------------------------------------
-- 0050'de sale_type TRANSİT/MİLLİ ile kapalı bir listeydi. Kullanıcı isteğiyle
-- sevk yeri sınıflandırmasına dönüştürüldü (Depodan/Gemiden/Antrepodan) ve
-- "Diğer" seçilince serbest metin girilebilsin diye kapatan CHECK kaldırıldı
-- (bkz. src/lib/resources.ts "select_other" — sabit seçenek listesinde
-- olmayan bir değer otomatik serbest metin kutusuna düşer, veri kaybı olmaz).
-- Mevcut TRANSİT/MİLLİ kayıtları olduğu gibi kalır, yalnızca artık "Diğer"
-- olarak (serbest metin kutusunda) görünür/düzenlenebilir.
-- =============================================================================

alter table public.sales_orders
  drop constraint if exists sales_orders_sale_type_check;

comment on column public.sales_orders.sale_type is
  'Satışın sevk edildiği yer: Depodan/Gemiden/Antrepodan ya da "Diğer" ile serbest metin.';
