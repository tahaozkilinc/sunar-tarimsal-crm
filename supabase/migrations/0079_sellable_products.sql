-- =============================================================================
-- Sunar Tarımsal CRM - Satışta yalnızca stokta olan ürünler seçilebilsin
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "zaten olmayan bir şeyi satamayız" — Satış formundaki Ürün
-- alanı artık TÜM ürünler değil, herhangi bir depoda mevcut (available_qty>0)
-- aktif ürünlerden oluşan bu view'a bakıyor (bkz. sellable_contracts ile aynı
-- desen: gerçek tablo yerine "satılabilir" bir view). inventory zaten
-- security_invoker=on olduğundan burada da aynısı yeterli — role bazlı özel
-- bir kısıt gerekmiyor (products zaten tüm authenticated'a açık).
-- =============================================================================

create or replace view public.sellable_products
with (security_invoker = true) as
select p.*
from public.products p
where p.is_active = true
and exists (
  select 1 from public.inventory i
  where i.product_id = p.id and i.available_qty > 0.001
);

grant select on public.sellable_products to authenticated;
