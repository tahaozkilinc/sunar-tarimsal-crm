-- Sunar Tarımsal CRM - Deniz Broker: CRM erişimi
-- ----------------------------------------------------------------------------
-- 'broker_sea' de tıpkı 'broker' (Hammadde Broker) gibi purchasing rolüne
-- açılıyor -- aynı sekme grubu, sadece ayrı bir liste (bkz. crm-tabs.tsx).
-- Sipariş (purchase_contracts.broker_id) açılırken firma seçimi hâlâ SADECE
-- type='broker' (Hammadde) ile filtreleniyor (resources.ts) -- bu migration
-- onu DEĞİŞTİRMİYOR, yalnızca CRM'de yeni türü görünür/eklenebilir kılıyor.
-- Aktiviteler (crm_activities) için AYRI bir module GEREKMİYOR: Deniz Broker,
-- Hammadde Broker ile aynı module='broker' kovasını paylaşıyor (activityModuleFor,
-- company-detail-view.tsx) -- 0066'daki act_select/act_write zaten bu kovayı
-- purchasing'e açık tutuyor, dokunulmadı.

create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales','finans')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() in ('sales','sales_ops','finans') and c.type in ('customer','both')) or
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier','agent')) or
        (public.auth_base_role() = 'purchasing' and c.type in ('broker','broker_sea'))
      )
    )
  end;
$$;

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both','broker','broker_sea'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier','agent'))
  );
