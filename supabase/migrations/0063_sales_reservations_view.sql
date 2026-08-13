-- Sunar Tarımsal CRM - Stok sayfasında "rezerve" (bekleyen satış) göstergesi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: taslak/onaylanmış ama henüz fiilen sevk edilmemiş satışlar
-- Stok ekranında "bu miktar aslında satılabilir değil, rezerve" şeklinde
-- görünsün. inventory view'ı (0043) artık yalnızca FİİLİ sevkiyatı (stock_
-- movements 'outbound_sale') düşüyor — bu doğru (fiziksel gerçeklik), ama
-- henüz sevk edilmemiş satış TONAJI hiçbir yerde "rezerve" olarak görünmüyor.
--
-- sales_orders tablosu fiyat/müşteri gibi ticari bilgiler içerdiğinden so_select
-- politikası dar (admin, sales, maliyet, viewer, finans) — Stok ekranını asıl
-- kullanan operasyon ve satış operasyon rolleri bunu okuyamaz. 0026/0037/0055'teki
-- ile AYNI desen: yalnızca rezervasyon hesabı için gereken dar kolonlarla
-- (fiyat/müşteri YOK) SECURITY DEFINER bir görünüm eklenir, tüm iç rollere açılır.

create or replace view public.sales_reservations
with (security_invoker = off) as
select id, product_id, quantity, status
from public.sales_orders
where status <> 'cancelled';

revoke all on public.sales_reservations from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.sales_reservations from authenticated;
grant select on public.sales_reservations to authenticated;
