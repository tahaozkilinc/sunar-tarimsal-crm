-- Sunar Tarımsal CRM - Acente'ye de gözetim/liman/nakliyeci gibi CRM erişimi
-- ----------------------------------------------------------------------------
-- Acente (agent) şirket türü zaten vardı (purchase_contracts.agent_id,
-- companies.type) ama CRM tarafında (companies_select/insert/update/delete,
-- contacts_select/write -> hepsi can_see_company() üzerinden) operasyon
-- rolüne yalnızca surveyor/port/carrier açıktı — agent unutulmuştu. Bu yüzden
-- operasyon rolü, Acente türündeki firmaları hiç GÖREMİYORDU (boş liste),
-- yenisini de EKLEYEMİYORDU (RLS reddi). CRM'de yeni "Acente" sekmesinin
-- çalışması için bu iki tanım agent'ı da içerecek şekilde güncellenir.
-- crm_activities'e DOKUNULMADI: module='operations' zaten şirket türünden
-- bağımsız (surveyor/port/carrier/agent aynı module değerini paylaşıyor).

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
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier','agent'))
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
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier','agent'))
  );
