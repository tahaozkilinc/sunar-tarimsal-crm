-- =============================================================================
-- Sunar Tarımsal CRM - Yükleme limanına tahmini varış (loading_eta)
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "yükleme limanına tahmini varış'ı da eklemek gerekiyor, o
-- yok onu da sisteme ekleyebilir misin." — Zaman çizelgesi artık 3 noktalı:
--   loading_eta (yükleme limanına varış) -> etd (yükleme limanından kalkış,
--   0081) -> eta (boşaltma limanına varış). ETD/ETA ile aynı desen: opsiyonel,
--   hem Bağlantı (sözleşme açılışı) hem ship-ops'tan (Operasyon Tarafları
--   kartı, assign_ship_parties) güncellenebilir.
--
-- 0086-0099'da öğrenilen desenle: eski overload'lar SİLİNMEDEN (create or
-- replace ile) yeni (15 parametreli) overload eklendi, doğru yetkilerle
-- (yalnızca authenticated) ayrıca sertleştirildi. Eski overload'ları silme
-- denemesi bu kez de zaman aşımına uğradı — frontend artık hep 15
-- parametreliyi çağırdığından işlevsel bir sorun yok.
-- =============================================================================

alter table public.purchase_contracts
  add column loading_eta date;

comment on column public.purchase_contracts.loading_eta is
  'Yükleme limanına tahmini varış (opsiyonel) — ETD''den önceki aşama; gemi henüz yüklenmeden önce limana varış tahmini.';

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
  p_loading_agent_id uuid default null,
  p_eta date default null,
  p_loading_tonnage numeric default null,
  p_etd date default null,
  p_discharge_tonnage numeric default null,
  p_loading_eta date default null
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
      loading_agent_id = p_loading_agent_id,
      eta = p_eta,
      loading_tonnage = p_loading_tonnage,
      etd = p_etd,
      discharge_tonnage = p_discharge_tonnage,
      loading_eta = p_loading_eta
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric, date) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric, date) from anon, public;

-- Eski overload'ları silmeyi dene — ortam sorunu düzeldiyse çalışır, aksi
-- halde "if exists" sayesinde migration yine başarıyla biter.
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric);

-- external_contracts: dış roller için loading_eta de en sona eklendi (CREATE
-- OR REPLACE VIEW mevcut kolonları yeniden sıralayamıyor/adlandıramıyor).
create or replace view public.external_contracts as
select
  id, contract_no, vessel, product_id,
  null::uuid as supplier_id,
  quantity, unit, eta, status, origin_country, loading_port,
  surveyor_id, port_id, carrier_id, agent_id, assigned_to, ship_broker_id,
  loading_port_id, loading_surveyor_id, loading_agent_id, loading_tonnage,
  etd, discharge_tonnage, loading_eta
from public.purchase_contracts pc
where public.is_my_carrier_ship(pc.id) or public.is_my_surveyor_ship(pc.id) or public.is_my_agent_ship(pc.id);
