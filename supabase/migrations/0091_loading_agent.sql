-- =============================================================================
-- Sunar Tarımsal CRM - Operasyon Tarafları'na Yükleme Acente eklendi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: yükleme ve boşaltmada acente de FARKLI olabiliyor (ör.
-- Köstence'de yükleme acentesi, Toros'ta boşaltma acentesi) — mevcut tek
-- "Acente" (agent_id) alanı artık "Boşaltma Acente" olarak kalıyor
-- (surveyor_id/loading_surveyor_id, port_id/loading_port_id ile AYNI desen:
-- mevcut alan boşaltma tarafı, yeni alan yükleme tarafı), yanına yeni bir
-- "Yükleme Acente" (loading_agent_id) alanı eklendi. Tek bir ortak alan
-- olduğunda iki taraf da istemeden aynı değere "kilitleniyordu" — asıl sorun
-- buydu, artık bağımsız iki kolon/iki state.
--
-- 0086/0087/0088'de öğrenilen dersle: eski (9 parametreli) overload silinip
-- yeni (10 parametreli) için aynı anon+public hardening TEK migration'da
-- tekrarlanıyor.
-- =============================================================================

alter table public.purchase_contracts add column loading_agent_id uuid references public.companies(id);
comment on column public.purchase_contracts.loading_agent_id is
  'Yükleme (menşe) acentesi — agent_id (boşaltma/varış acentesi) ile aynı desen. Yükleme ve boşaltmada farklı acenteler olabiliyor.';

create or replace view public.external_contracts as
select id,
  contract_no,
  vessel,
  product_id,
  NULL::uuid as supplier_id,
  quantity,
  unit,
  eta,
  status,
  origin_country,
  loading_port,
  surveyor_id,
  port_id,
  carrier_id,
  agent_id,
  assigned_to,
  ship_broker_id,
  loading_port_id,
  loading_surveyor_id,
  loading_agent_id
from purchase_contracts pc
where is_my_carrier_ship(id) or is_my_surveyor_ship(id) or is_my_agent_ship(id);

drop function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);

create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id uuid default null,
  p_carrier_id uuid default null,
  p_agent_id uuid default null,
  p_assigned_to uuid default null,
  p_ship_broker_id uuid default null,
  p_loading_port_id uuid default null,
  p_loading_surveyor_id uuid default null,
  p_loading_agent_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      ship_broker_id = p_ship_broker_id,
      loading_port_id = p_loading_port_id,
      loading_surveyor_id = p_loading_surveyor_id,
      loading_agent_id = p_loading_agent_id
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;
