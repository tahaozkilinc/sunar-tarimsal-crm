-- =============================================================================
-- Sunar Tarımsal CRM - Stok (inventory) görünümü düzeltmesi
-- Sıra: 13 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- SORUN: Eski görünüm 'inbound','transfer','to_factory' hareketlerinin hepsini
--   ARTI olarak topluyordu. Transfer/fabrikaya gönderiminde kaynak depodan düşüş
--   olmadığı için aynı mal iki yerde sayılıyor, toplam stok ŞİŞİYORDU.
--
-- ÇÖZÜM (çift kayıt mantığı, mevcut tek-depo şemasıyla):
--   inbound              -> deponun stoğuna GİRİŞ (+)
--   transfer / to_factory-> deponun stoğundan ÇIKIŞ (−) (mal o depodan ayrılır)
--   adjustment           -> stok düzeltmesi: pozitif miktar artırır,
--                           negatif miktar azaltır (işaretli)
--   satış (sales_orders) -> deponun stoğundan ÇIKIŞ (−)
-- Bir malı A deposundan B'ye taşımak için: B'ye 'inbound', A'da 'transfer/to_factory'
-- girilir; böylece toplam değişmez, dağılım doğru olur.
-- =============================================================================

create or replace view public.inventory
with (security_invoker = on) as
with mv as (
  select
    product_id,
    warehouse_id,
    -- depoya giren (boşaltma) + işaretli düzeltme
    sum(case
      when movement_type = 'inbound' then quantity
      when movement_type = 'adjustment' then quantity
      else 0
    end) as received,
    -- depodan çıkan (başka depoya / fabrikaya sevk)
    sum(case
      when movement_type in ('transfer','to_factory') then quantity
      else 0
    end) as relocated_out
  from public.stock_movements
  where warehouse_id is not null
  group by product_id, warehouse_id
),
outs as (
  select product_id, warehouse_id, sum(quantity) as sold
  from public.sales_orders
  where status <> 'cancelled' and warehouse_id is not null
  group by product_id, warehouse_id
)
select
  w.id    as warehouse_id,
  w.name  as warehouse_name,
  w.type  as location_type,
  pr.id   as product_id,
  pr.name as product_name,
  coalesce(mv.received, 0)                                        as received_qty,
  coalesce(outs.sold, 0) + coalesce(mv.relocated_out, 0)         as sold_qty,
  coalesce(mv.received, 0)
    - coalesce(outs.sold, 0)
    - coalesce(mv.relocated_out, 0)                              as available_qty
from public.warehouses w
join public.products pr on true
left join mv   on mv.warehouse_id = w.id and mv.product_id = pr.id
left join outs on outs.warehouse_id = w.id and outs.product_id = pr.id
where coalesce(mv.received, 0) <> 0
   or coalesce(mv.relocated_out, 0) <> 0
   or coalesce(outs.sold, 0) <> 0;
