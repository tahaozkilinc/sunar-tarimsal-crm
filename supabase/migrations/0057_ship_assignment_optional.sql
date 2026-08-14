-- Sunar Tarımsal CRM - "Operasyon Sorumlusu" ataması artık ship-ops sayfasından yapılabilsin
-- ----------------------------------------------------------------------------
-- Bugüne kadar purchase_contracts.assigned_to yalnızca sözleşme AÇILIRKEN
-- (purchasing/admin formunda) seçiliyordu. Kullanıcı isteği: sözleşme açılışında
-- ne Acente (agent_id) ne de Operasyon Sorumlusu (assigned_to) ZORUNLU olsun —
-- ikisi de ship-ops sayfasındaki "Operasyon Tarafları" kartından (gözetim/
-- liman/nakliyeci/acente ile aynı akış) sonradan atanabilsin.
--
-- 1) combined_shipments.assigned_to: kombine gemilerde de aynı akış için
--    (surveyor_id/port_id/carrier_id/agent_id zaten vardı, assigned_to yoktu).
-- 2) assign_ship_parties / assign_combined_ship_parties: p_assigned_to eklenir.
--    Eski 5-parametreli imza DÜŞÜRÜLÜR (0032'deki desenle birebir aynı sebep:
--    PostgREST'te overload belirsizliği olmasın).
-- 3) assign_ship_parties yetki kontrolü GENİŞLETİLİR (yalnızca genişletme,
--    daraltma YOK): can_access_ship(), bir operasyon kullanıcısına HERHANGİ
--    bir gemi atanmışsa o kullanıcıyı SADECE kendi gemisiyle sınırlar (bkz.
--    0012). Bu, henüz KİMSEYE atanmamış (assigned_to is null) yeni bir gemiyi,
--    zaten başka gemisi olan hiçbir operasyon kullanıcısının ilk kez
--    sahiplenememesi anlamına gelirdi (yalnızca admin atayabilirdi) — artık
--    assigned_to formda görünmediğinden HER yeni sözleşme bu duruma düşecek.
--    Bu yüzden "hedef gemi henüz kimseye atanmamış" durumu da yetkiye
--    EKLENDİ (can_access_ship'in kendisi DEĞİŞTİRİLMEDİ; stock_movements
--    RLS'i -- sm_select/sm_write -- ve diğer can_access_ship kullanıcıları
--    etkilenmez).
-- =============================================================================

alter table public.combined_shipments
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_cs_assigned_to on public.combined_shipments(assigned_to);

drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid);
create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null,
  p_agent_id    uuid default null,
  p_assigned_to uuid default null
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
      assigned_to = p_assigned_to
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end $$;
grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;

drop function if exists public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid);
create or replace function public.assign_combined_ship_parties(
  p_combined_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null,
  p_agent_id    uuid default null,
  p_assigned_to uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.auth_role() = 'operations') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.combined_shipments
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id,
      assigned_to = p_assigned_to
  where id = p_combined_id;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id,
      assigned_to = p_assigned_to
  where combined_shipment_id = p_combined_id;
end $$;
grant execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;
