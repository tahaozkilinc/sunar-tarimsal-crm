-- =============================================================================
-- Sunar Tarımsal CRM - Gümrükçü: erişim (operations, gözetim/liman/nakliyeci/
-- acente/Gemi Brokeri ile AYNI dörtlü/beşli)
-- ----------------------------------------------------------------------------
-- 0089'da eklenen 'customs_broker' company_type değeri burada gerçek
-- kullanıma kavuşuyor. Gümrükçü de tıpkı gözetim/liman/nakliyeci/acente/
-- Gemi Brokeri gibi operasyona ait sayılıyor (gümrük işlemleri sevkiyat/
-- ithalat sürecinin bir parçası) — operations rolüne görünür/yazılabilir.
-- =============================================================================

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
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier','agent','ship_broker','customs_broker')) or
        (public.auth_base_role() = 'purchasing' and c.type = 'broker')
      )
    )
  end;
$$;

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both','broker'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier','agent','ship_broker','customs_broker'))
  );
