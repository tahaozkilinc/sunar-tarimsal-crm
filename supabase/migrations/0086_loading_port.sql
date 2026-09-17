-- =============================================================================
-- Sunar Tarımsal CRM - Operasyon Tarafları'na Yükleme Limanı eklendi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: FOB sözleşmelerde yükleme organizasyonunu (menşe limanı)
-- BİZ ayarlıyoruz — mevcut "Liman" (port_id, artık "Boşaltma Limanı" olarak
-- etiketleniyor) yanına, aynı desende (companies, type=port) bir "Yükleme
-- Limanı" (origin) alanı eklendi. Diğer Operasyon Tarafları alanları gibi
-- (surveyor/port/carrier/agent/ship_broker) sözleşme açılışında DEĞİL,
-- ship-ops'taki "Operasyon Tarafları" kartından, gemi netleştikçe atanır —
-- eski loading_port (serbest metin, sözleşme açılışında girilen ön bilgi)
-- olduğu gibi kalır, bu YENİ alan operasyonun kesinleştirdiği referans.
--
-- Bu arada: ship-ops-page.tsx'in dış roller (nakliyeci/gozetim/acente) için
-- kullandığı external_contracts fallback view'ı ship_broker_id'yi hiç
-- içermiyordu (CONTRACT_COLS onu istiyor ama view'da yoktu) — dış rolün ana
-- purchase_contracts sorgusu boş dönüp bu fallback'e düştüğü senaryoda sayfa
-- "column does not exist" hatasıyla patlıyordu (canlıda doğrulandı, bkz.
-- 42703 hatası). Aynı kolon listesine loading_port_id eklenirken bu da
-- düzeltildi.
-- =============================================================================

alter table public.purchase_contracts add column loading_port_id uuid references public.companies(id);
comment on column public.purchase_contracts.loading_port_id is
  'Yükleme (menşe) limanı — port_id (boşaltma/varış limanı) ile aynı desen, companies(type=port) referansı. FOB sözleşmelerde operasyon tarafından ship-ops''tan atanır.';

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
  loading_port_id
from purchase_contracts pc
where is_my_carrier_ship(id) or is_my_surveyor_ship(id) or is_my_agent_ship(id);

create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id uuid default null,
  p_carrier_id uuid default null,
  p_agent_id uuid default null,
  p_assigned_to uuid default null,
  p_ship_broker_id uuid default null,
  p_loading_port_id uuid default null
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
      loading_port_id = p_loading_port_id
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;
