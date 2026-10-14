-- =============================================================================
-- Sunar Tarımsal CRM - Operasyon sayfasından ETD de güncellenebiliyor
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "yükleme kısmı kullanışlı değil... ETA yazmışsın bu
-- yüklemeyle ETA'nın bir önemi yok, boşaltmanın ETA'yla bir alakası var,
-- ETA değil oraya ETD yapman lazım (limandan tahmini çıkış)... boşaltma
-- için ETA gerekiyor ne zaman gelecek diye." — ETD (yükleme limanından
-- tahmini kalkış) zaten purchase_contracts'ta vardı (0081, Bağlantı
-- modülünden girilebiliyordu) ama ship-ops'tan (operasyon) güncellenemiyordu.
-- Artık eta/loading_tonnage ile AYNI RPC'den (assign_ship_parties) yazılabiliyor.
--
-- 0086-0097'de öğrenilen desenle: eski overload'lar SİLİNMEDEN (create or
-- replace ile) yeni (13 parametreli) overload eklendi, doğru yetkilerle
-- (yalnızca authenticated) ayrıca sertleştirildi. Eski (10 ve 12 parametreli)
-- overload'ları silme denemesi bu kez de zaman aşımına uğradı — frontend
-- artık hep 13 parametreliyi çağırdığından işlevsel bir sorun yok.
-- =============================================================================

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
  p_etd date default null
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
      etd = p_etd
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date) from anon, public;

-- Eski overload'ları silmeyi dene — ortam sorunu düzeldiyse çalışır, aksi
-- halde "if exists" sayesinde migration yine başarıyla biter.
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric);

-- external_contracts: dış roller (nakliyeci/gözetim/acente) için fiyatsız
-- güvenli görünüm — assign_ship_parties'in yazdığı her kolon burada da
-- okunabilir olmalı, aksi halde ship-ops-page.tsx bu rollerde "column does
-- not exist" (42703) hatası verir. etd eksikti, en sona eklendi (CREATE OR
-- REPLACE VIEW mevcut kolonları yeniden sıralayamıyor/adlandıramıyor).
create or replace view public.external_contracts as
select
  id, contract_no, vessel, product_id,
  null::uuid as supplier_id,
  quantity, unit, eta, status, origin_country, loading_port,
  surveyor_id, port_id, carrier_id, agent_id, assigned_to, ship_broker_id,
  loading_port_id, loading_surveyor_id, loading_agent_id, loading_tonnage,
  etd
from public.purchase_contracts pc
where public.is_my_carrier_ship(pc.id) or public.is_my_surveyor_ship(pc.id) or public.is_my_agent_ship(pc.id);
