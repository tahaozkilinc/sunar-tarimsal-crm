-- =============================================================================
-- Sunar Tarımsal CRM - Operasyon CRM'i (gözetim/liman/nakliyeci) + "kim girdi"
-- Sıra: 19 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) company_type: 'surveyor' (gözetim şirketi), 'port' (liman), 'carrier'
--    (nakliyeci) eklenir. crm_module: 'operations' eklenir. Operasyon ekibi
--    artık kendi sekmesinde bu üç tür firmayı ve aktivitelerini yönetir
--    (purchasing/sales CRM'inden tamamen ayrı, sadece admin + operations görür).
-- 2) profile_names: stock_movements.created_by -> "kim girdi" göstermek için
--    dar kapsamlı (id, full_name) görünüm. profiles tablosunun RLS'sini
--    genişletmek yerine (operasyon rolünün diğer rollerin e-posta/telefonunu
--    görmesine gerek yok) sadece ad bilgisini paylaşan ayrı bir view -
--    profiles_select_assign'ı (0012/0015) genişletmek yerine bunu tercih ettik.
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan
--   ilk dört "alter type" satırını TEK TEK çalıştır, sonra kalanını çalıştır.
-- =============================================================================

alter type public.company_type add value if not exists 'surveyor';
alter type public.company_type add value if not exists 'port';
alter type public.company_type add value if not exists 'carrier';
alter type public.crm_module   add value if not exists 'operations';

-- ---------------------------------------------------------------------------
-- companies/contacts: operasyon -> gözetim/liman/nakliyeci türlerini görür+yazar
-- (mevcut supplier/both görünürlüğüne ek; companies_update/delete ve
--  contacts_write üzerindeki is_view_role() koruması 0018'den olduğu gibi kalır)
-- ---------------------------------------------------------------------------
create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() = 'sales' and c.type in ('customer','both')) or
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier'))
      )
    )
  end;
$$;

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier'))
  );

-- ---------------------------------------------------------------------------
-- crm_activities: 'operations' modülü eklenir
-- ---------------------------------------------------------------------------
drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or public.auth_base_role() = 'viewer'
    or (public.auth_base_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_base_role() = 'sales' and module = 'sales')
    or (public.auth_base_role() = 'operations' and module = 'operations')
  );

drop policy if exists act_write on public.crm_activities;
create policy act_write on public.crm_activities for all to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
    or (public.auth_role() = 'operations' and module = 'operations')
  )
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
    or (public.auth_role() = 'operations' and module = 'operations')
  );

-- ---------------------------------------------------------------------------
-- profile_names: "kim girdi" için dar kapsamlı ad dizini (e-posta/telefon yok)
-- ---------------------------------------------------------------------------
create or replace view public.profile_names
with (security_invoker = off) as
  select id, full_name from public.profiles;
grant select on public.profile_names to authenticated;
