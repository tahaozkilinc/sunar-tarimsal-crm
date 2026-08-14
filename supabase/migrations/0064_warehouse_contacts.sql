-- Sunar Tarımsal CRM - Depo yetkilileri (CRM'de "Depolar" sekmesi için)
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: CRM'den depolarla ilgili bir bölüm, Stok'takiyle AYNI veri
-- üzerinden (ayrı bir kopya değil) ve depodaki kişilerin bilgilerini girebilme.
--
-- contacts tablosu company_id NOT NULL + ON DELETE CASCADE ile companies'e
-- SIKI bağlı (bkz. 0001) — bu kısıtı gevşetmek (nullable yapmak) mevcut,
-- çalışan bir tabloyu riske atar. Bunun yerine contacts'la AYNI, basit desende
-- (id, ad, ünvan, telefon, e-posta, not) TAMAMEN AYRI ve düşük riskli bir
-- tablo eklenir — mevcut contacts'a hiç dokunulmaz.
--
-- RLS, warehouses'ın kendisiyle AYNI: okuma herkese açık (warehouses_select
-- zaten "using (true)"), yazma yalnızca admin+operasyon (warehouses_write ile
-- aynı roller — depo yönetimini kim yapıyorsa kişilerini de o girer).

create table if not exists public.warehouse_contacts (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  full_name    text not null,
  title        text,
  phone        text,
  email        text,
  notes        text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_warehouse_contacts_warehouse on public.warehouse_contacts(warehouse_id);

drop trigger if exists trg_warehouse_contacts_updated on public.warehouse_contacts;
create trigger trg_warehouse_contacts_updated before update on public.warehouse_contacts
  for each row execute function public.set_updated_at();

alter table public.warehouse_contacts enable row level security;

drop policy if exists warehouse_contacts_select on public.warehouse_contacts;
create policy warehouse_contacts_select on public.warehouse_contacts for select to authenticated
  using (true);

drop policy if exists warehouse_contacts_write on public.warehouse_contacts;
create policy warehouse_contacts_write on public.warehouse_contacts for all to authenticated
  using  (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));
