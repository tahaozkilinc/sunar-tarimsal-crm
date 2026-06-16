-- =============================================================================
-- Sunar Tarımsal CRM – Ödeme planı görünümü v2
-- Sıra: 16 – 0015'ten SONRA çalıştırın. (Idempotent – CREATE OR REPLACE)
--
-- Değişiklik: payment_schedule view'una tutar alanları (price, quantity,
-- currency, usd_try, eur_try) + tedarikçi ve ürün adı eklendi.
-- Böylece finans rolü ödenecek tutarı da görür.
-- =============================================================================

create or replace view public.payment_schedule
with (security_invoker = off) as
  select
    pc.id,
    pc.contract_no,
    pc.vessel,
    pc.payment_due_date,
    pc.eta,
    pc.status,
    pc.quantity,
    pc.price,
    pc.currency,
    pc.usd_try,
    pc.eur_try,
    co.name  as supplier_name,
    pr.name  as product_name
  from public.purchase_contracts pc
  left join public.companies co on co.id = pc.supplier_id
  left join public.products  pr on pr.id = pc.product_id
  where public.auth_base_role() in ('admin', 'finans', 'viewer')
    and pc.payment_due_date is not null
    and pc.status <> 'cancelled';

grant select on public.payment_schedule to authenticated;
