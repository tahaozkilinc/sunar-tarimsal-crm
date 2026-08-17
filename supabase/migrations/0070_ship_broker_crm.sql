-- Sunar Tarımsal CRM - Gemi Brokeri: kolon + erişim + ship-ops ataması
-- ----------------------------------------------------------------------------
-- 0069'da eklenen 'ship_broker' company_type değeri burada gerçek kullanıma
-- kavuşuyor. Gemi Brokeri, gözetim/liman/nakliyeci/acente ile AYNI akışı
-- izler: sözleşme açılışında SEÇİLMEZ (formHidden, bkz. resources.ts),
-- ship-ops sayfasındaki "Operasyon Tarafları" kartından, gemi netleştikçe
-- operasyon tarafından atanır — bu yüzden erişim de o dörtlüyle birebir aynı
-- (operations rolüne görünür/yazılabilir), Hammadde Brokeri'nin (mevcut
-- 'broker' değeri, satın almaya ait) erişimine DOKUNULMUYOR.

alter table public.purchase_contracts
  add column if not exists ship_broker_id uuid references public.companies(id) on delete set null;

create index if not exists idx_pc_ship_broker on public.purchase_contracts(ship_broker_id);

-- can_see_company: ship_broker artık operations'a (surveyor/port/carrier/agent
-- ile aynı satırda) görünür. purchasing'in 'broker' (Hammadde Brokeri)
-- görünürlüğü DEĞİŞMEDİ.
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
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier','agent','ship_broker')) or
        (public.auth_base_role() = 'purchasing' and c.type = 'broker')
      )
    )
  end;
$$;

-- companies_insert: operations artık ship_broker türünde firma da ekleyebilir.
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both','broker'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier','agent','ship_broker'))
  );

-- assign_ship_parties: p_ship_broker_id eklenir (0057'deki AYNI desen —
-- PostgREST overload belirsizliği olmasın diye eski imza düşürülüp yeniden
-- oluşturuluyor). Yetki kontrolü DEĞİŞMİYOR.
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid);
create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null,
  p_agent_id    uuid default null,
  p_assigned_to uuid default null,
  p_ship_broker_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_admin()
    or (public.auth_role() = 'operations' and (
      public.can_access_ship(p_contract_id)
      or exists (
        select 1 from public.purchase_contracts pc
        where pc.id = p_contract_id and pc.assigned_to is null
      )
    ))
  ) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id,
      assigned_to = p_assigned_to,
      ship_broker_id = p_ship_broker_id
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end $$;
grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;
