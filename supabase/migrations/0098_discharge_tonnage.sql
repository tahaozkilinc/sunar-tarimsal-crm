-- =============================================================================
-- Sunar Tarımsal CRM - Boşaltma Tonajı artık Yükleme Tonajı gibi tek bir
-- sayı olarak doğrudan giriliyor (araç/depo bazlı giriş birikimli toplamı
-- DEĞİL).
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "boşaltma kısmında gene anlaşma tonajı yükleme tonajını
-- yaz, orada gemi bitince biz boşaltma tonajını yazacağız. araç araç yazma
-- işini iptal et ona gerek yok. giriş listesi... kaldır." — Admin/Operasyon
-- tarafında artık Sözleşme / Yükleme / Boşaltma tek birer sayı olarak
-- karşılaştırılıyor; stock_movements'a dayalı "Toplu Depo Girişi" ve "Giriş
-- Listesi" ship-ops sayfasından kaldırıldı (bkz. ship-ops-page.tsx).
--
-- Not: stock_movements tablosu VE nakliyeci/gözetim'in "Hızlı Araç Girişi"
-- akışı SİLİNMEDİ — depo/envanter muhasebesi ve dış rollerin tek giriş
-- mekanizması hâlâ buna dayanıyor (Stok Hareketleri sekmesinden yönetiliyor).
-- Sadece ship-ops'un kendi ekranındaki bitişik giriş formları/listesi
-- kaldırıldı; discharge_tonnage tamamen ayrı, elle girilen bir alan.
--
-- 0086-0098'de öğrenilen desenle: eski overload'lar SİLİNMEDEN (create or
-- replace ile) yeni (14 parametreli) overload eklendi, doğru yetkilerle
-- (yalnızca authenticated) ayrıca sertleştirildi. Eski overload'ları silme
-- denemesi bu kez de zaman aşımına uğradı — frontend artık hep 14
-- parametreliyi çağırdığından işlevsel bir sorun yok.
-- =============================================================================

alter table public.purchase_contracts
  add column discharge_tonnage numeric check (discharge_tonnage >= 0);

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
  p_discharge_tonnage numeric default null
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
      discharge_tonnage = p_discharge_tonnage
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric) from anon, public;

-- Eski overload'ları silmeyi dene — ortam sorunu düzeldiyse çalışır, aksi
-- halde "if exists" sayesinde migration yine başarıyla biter.
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric);
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date);

-- external_contracts: dış roller için discharge_tonnage de en sona eklendi
-- (CREATE OR REPLACE VIEW mevcut kolonları yeniden sıralayamıyor/
-- adlandıramıyor). Dış roller bu alanı DÜZENLEYEMİYOR (Operasyon Tarafları
-- kartı canManage-only), ama ship-ops-page.tsx'in CONTRACT_COLS seçimi tüm
-- rollerde aynı; view'da yoksa "column does not exist" (42703) hatası olur.
create or replace view public.external_contracts as
select
  id, contract_no, vessel, product_id,
  null::uuid as supplier_id,
  quantity, unit, eta, status, origin_country, loading_port,
  surveyor_id, port_id, carrier_id, agent_id, assigned_to, ship_broker_id,
  loading_port_id, loading_surveyor_id, loading_agent_id, loading_tonnage,
  etd, discharge_tonnage
from public.purchase_contracts pc
where public.is_my_carrier_ship(pc.id) or public.is_my_surveyor_ship(pc.id) or public.is_my_agent_ship(pc.id);
