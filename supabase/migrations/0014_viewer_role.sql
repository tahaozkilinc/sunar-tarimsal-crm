-- =============================================================================
-- Sunar Tarımsal CRM - "viewer" (Görüntüleyici) salt-okunur rolü
-- Sıra: 14 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- viewer: tüm modülleri GÖRÜR, hiçbir şeyi DEĞİŞTİREMEZ.
--   - Tüm ana tablolarda SELECT verilir.
--   - Hiçbir write (insert/update/delete) politikasına eklenmez -> RLS yazmayı
--     varsayılan olarak reddeder. Böylece görüntüleyici hiçbir kayıt açamaz/
--     düzenleyemez/silemez.
--   - Yönetim (kullanıcı yönetimi) ve audit_log'a erişimi YOKTUR.
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan,
--      ilk satırı (alter type) TEK BAŞINA çalıştır, sonra dosyanın kalanını çalıştır.
-- =============================================================================

alter type public.user_role add value if not exists 'viewer';

-- profiles: görüntüleyici, atama/oluşturan adlarının görünmesi için profilleri okuyabilsin
drop policy if exists profiles_select_assign on public.profiles;
create policy profiles_select_assign on public.profiles for select to authenticated
  using (public.auth_role() in ('admin','purchasing','viewer'));

-- companies / contacts: görüntüleyiciye ayrı (permissive) okuma politikası
drop policy if exists companies_select_viewer on public.companies;
create policy companies_select_viewer on public.companies for select to authenticated
  using (public.auth_role() = 'viewer');

drop policy if exists contacts_select_viewer on public.contacts;
create policy contacts_select_viewer on public.contacts for select to authenticated
  using (public.auth_role() = 'viewer');

-- purchase_contracts
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin','purchasing','operations','maliyet','viewer'));

-- stock_movements
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

-- sales_orders
drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin','sales','maliyet','viewer'));

-- crm_activities (görüntüleyici tüm modülleri okur)
drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or public.auth_role() = 'viewer'
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
  );

-- payment_schedule görünümü (Finans) — viewer da görebilsin
drop view if exists public.payment_schedule cascade;
create view public.payment_schedule
with (security_invoker = off) as
  select id, contract_no, payment_due_date, eta, status
  from public.purchase_contracts
  where public.auth_role() in ('admin', 'finans', 'viewer')
    and payment_due_date is not null
    and status <> 'cancelled';
grant select on public.payment_schedule to authenticated;

-- sellable_contracts görünümü — viewer da görebilsin
create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet', 'viewer')
    and c.status <> 'cancelled';
grant select on public.sellable_contracts to authenticated;
