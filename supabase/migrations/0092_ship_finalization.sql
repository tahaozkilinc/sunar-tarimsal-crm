-- =============================================================================
-- Sunar Tarımsal CRM - Gemi finalizasyonu: Yükleme Tonajı + İlişkili Sözleşmeler
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: süreç sonucunda 3 farklı tonaj olması gerekiyor —
-- Sözleşme Tonajı (quantity, zaten var), Yükleme Tonajı (menşede fiilen
-- yüklenen — YENİ), Boşaltma Tonajı (stock_movements'tan canlı hesaplanan,
-- zaten var) — ödeme bu üçü arasındaki farka göre yapılabiliyor. Ayrıca bir
-- gemiye (operasyona) birden fazla sözleşme BİLGİ amaçlı bağlanabilsin
-- (tonaj hesaplarını etkilemez, yalnızca referans/listeleme).
--
-- loading_tonnage'ın YAZILMASI (assign_ship_parties RPC'sinin genişletilmesi)
-- 0094'te — bu dosyada yalnızca kolon + yeni tablo var.
-- =============================================================================

alter table public.purchase_contracts add column loading_tonnage numeric check (loading_tonnage >= 0);
comment on column public.purchase_contracts.loading_tonnage is
  'Fiilen yüklenen tonaj (yükleme sertifikası/draft survey) — sözleşme tonajından (quantity) ve fiilen boşaltılandan (stock_movements toplamı) farklı olabilir; ödeme bu farka göre yapılabiliyor. ship-ops''tan (assign_ship_parties) operasyon tarafından girilir.';

create table public.contract_links (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.purchase_contracts(id) on delete cascade,
  related_contract_id uuid not null references public.purchase_contracts(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  constraint ck_cl_not_self check (contract_id <> related_contract_id),
  constraint uq_cl_pair unique (contract_id, related_contract_id)
);
comment on table public.contract_links is
  'Aynı gemi/sevkiyata ait birden fazla sözleşmeyi BİLGİ amaçlı ilişkilendirir — tonaj hesaplarını etkilemez, yalnızca referans/listeleme içindir (kullanıcı isteği: "sözleşmeler olabiliyor, operasyonun").';

alter table public.contract_links enable row level security;

create policy cl_select on public.contract_links for select to authenticated
  using (public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer'));

create policy cl_write on public.contract_links for all to authenticated
  using (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));

drop trigger if exists trg_audit on public.contract_links;
create trigger trg_audit after insert or update or delete on public.contract_links
  for each row execute function public.fn_audit();

-- Dış roller (nakliyeci/gozetim) için fallback view'ı (0037/0086'da olduğu
-- gibi) ship-ops-page.tsx'in CONTRACT_COLS'una eklenen her yeni kolonla
-- senkron tutulmalı — unutulursa o roller "column does not exist" hatası
-- alır (0086'da keşfedilen, tekrar etmeyelim diye bu sefer AYNI migration'da).
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
  loading_agent_id,
  loading_tonnage
from purchase_contracts pc
where is_my_carrier_ship(id) or is_my_surveyor_ship(id) or is_my_agent_ship(id);
