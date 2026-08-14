-- Sunar Tarımsal CRM - Depo bazlı "satılabilir stok" için rezervasyon inceltme
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: Stok Durumu'nda her depo için "satılabilir" (mevcut -
-- rezerve) tonaj TOPLAM olarak görünsün. Bunun için iki değişiklik gerekiyor:
--
-- 1) sales_reservations (0063) şimdiye kadar iptal DIŞINDAKİ tüm satışları
--    rezerve sayıyordu. Kullanıcı talebi: taslak (draft) bir satış fiyatı
--    henüz belirlenmediyse gerçek bir rezervasyon sayılmasın (ön kayıt/olası
--    satış olabilir) — fiyat girildiyse veya taslağın ötesine geçtiyse
--    (onaylandı/teslim/fatura, ki bu durumda zaten fiyat vardır) rezerve
--    sayılmaya devam eder. Satış gerçekleşirse zaten fiili sevkiyatla
--    (stock_movements outbound_sale) doğrudan düşülüyor; gerçekleşmezse
--    zaten hiç fiziki hareket olmadığından depo stoğu etkilenmez — burada
--    yalnızca "rezerve" GÖRÜNÜMÜ inceltiliyor. Görünüm fiyatı YAYINLAMIYOR
--    (0063'teki dar tasarım aynen korunur), yalnızca WHERE koşuluna eklendi.
-- 2) Rezervasyonu depo(lar)a dağıtmak için hangi satışın hangi depo(lar)dan
--    çıkabileceği (sale_warehouses beyaz listesi) gerekiyor; ama bu tablo
--    operasyon rolüne açık değildi (0046) — Stok ekranını (/inventory)
--    kullanan rollerden biri olduğu için ekleniyor (fiyat/müşteri içermez,
--    sales_ops için zaten güvenli kabul edilmişti).
-- ----------------------------------------------------------------------------

create or replace view public.sales_reservations
with (security_invoker = off) as
select id, product_id, quantity, status
from public.sales_orders
where status <> 'cancelled'
  and (status <> 'draft' or price is not null);

drop policy if exists sw_select on public.sale_warehouses;
create policy sw_select on public.sale_warehouses for select to authenticated
  using (
    public.auth_base_role() in ('admin','sales','maliyet','viewer','sales_ops','operations')
  );
