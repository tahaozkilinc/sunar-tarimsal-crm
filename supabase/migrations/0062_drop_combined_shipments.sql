-- Sunar Tarımsal CRM - "Kombine Gemiler" özelliği tamamen kaldırıldı
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "kombine gemiler kısmınıda tamamen sil". Bu özellik aynı
-- fiziksel gemide farklı tedarikçilerden gelen birden fazla purchase_contract'ı
-- birleştirmek içindi (0027) — kullanıcının asıl ihtiyacı (barge ile yurtdışı
-- depoya aktarım, oradan fabrikaya ayrı bir gemi ayarlanarak çekim) bu değil;
-- mevcut yurtdışı depo / stok hareketi altyapısıyla karşılanacak (ayrı konu).
--
-- Kaldırılan uygulama kodu: purchasing-tabs.tsx "Kombine Gemiler" sekmesi,
-- combinedShipmentsResource, ship-ops-page.tsx + pending-arrivals.tsx'teki
-- tüm kombine mantığı (siblings, perContractStats, grup görünümü).
--
-- SIRALAMA ÖNEMLİ: önce external_contracts view'i combined_shipment_id
-- kolonunu artık SEÇMEYECEK şekilde değiştirilir (view bu kolona bağımlıyken
-- kolon DÜŞÜRÜLEMEZ), sonra purchase_contracts.combined_shipment_id kolonu
-- (bununla birlikte FK kısıtı) düşürülür, sonra combined_shipments tablosu
-- (artık ona referans veren hiçbir şey kalmadığından) düşürülür.
--
-- NOT: combined_shipments tablosunda halihazırda gerçek/aktif gemi verisi
-- varsa GERİ ALINAMAZ şekilde silinir. Supabase MCP bu oturumda kimlik
-- doğrulaması gerektirdiğinden bu migration canlıya uygulanamadı/doğrulanamadı
-- — uygulamadan önce canlıda combined_shipments'ta veri olup olmadığını
-- (ve varsa hangi bağlantıların etkilendiğini) kontrol edin.

create or replace view public.external_contracts as
select
  pc.id,
  pc.contract_no,
  pc.vessel,
  pc.product_id,
  null::uuid as supplier_id,          -- tedarikçi dış firmadan gizli
  pc.quantity,
  pc.unit,
  pc.eta,
  pc.status,
  pc.origin_country,
  pc.loading_port,
  pc.surveyor_id,
  pc.port_id,
  pc.carrier_id,
  pc.agent_id,
  pc.assigned_to
from public.purchase_contracts pc
where public.is_my_carrier_ship(pc.id)
   or public.is_my_surveyor_ship(pc.id)
   or public.is_my_agent_ship(pc.id);

revoke all on public.external_contracts from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.external_contracts from authenticated;
grant select on public.external_contracts to authenticated;

drop function if exists public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid);

alter table public.purchase_contracts
  drop column if exists combined_shipment_id;

drop table if exists public.combined_shipments;
