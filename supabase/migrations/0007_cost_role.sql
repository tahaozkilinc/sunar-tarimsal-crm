-- =============================================================================
-- Sunar Tarımsal CRM - Maliyet rolü + satışın bağlantıyı (fiyatsız) görmesi
-- Sıra: 7 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan,
--      ilk satırı tek başına çalıştır, sonra dosyanın tamamını tekrar çalıştır.
-- =============================================================================

alter type public.user_role add value if not exists 'maliyet';

-- Maliyet rolü kâr/zarar için hem alışları hem satışları okuyabilsin
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin', 'purchasing', 'operations', 'maliyet'));

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin', 'sales', 'maliyet'));

-- Satış, yoldaki/bağlanan ürünleri FİYATSIZ görebilsin (satarken kaynak seçmek için).
-- Fiyat ve tedarikçi bu görünümde YOK.
create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet')
    and c.status <> 'cancelled';

grant select on public.sellable_contracts to authenticated;
