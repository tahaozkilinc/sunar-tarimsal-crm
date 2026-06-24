-- =============================================================================
-- Sunar Tarımsal CRM - Gemi (sözleşme) bazlı numune fotoğrafları
-- Sıra: 22 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Araç bazlı movement_photos'tan (0021) ayrı olarak, doğrudan gemiye bağlı
-- numune fotoğrafları. "Gemiye ait alınan numunelerin fotoğrafları" tek bir
-- galeride toplanır. Fotoğraflar tarayıcıda sıkıştırılıp private
-- "contract-photos" kovasına yüklenir; yol bu tabloda saklanır.
--
-- Erişim:
--   - okuma: gemiyi (purchase_contracts) görebilen herkes (pc_select neyi
--            görüyorsa) -> can_access_contract, RLS'i miras alır.
--   - yazma: admin + erişebildiği gemiye sahip operasyon (can_access_ship);
--            _view (salt-okunur) roller yazamaz.
-- =============================================================================

-- Private Storage kovası ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('contract-photos', 'contract-photos', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- contract_photos : bir gemiye (purchase_contracts) bağlı numune fotoğrafları
-- ----------------------------------------------------------------------------
create table if not exists public.contract_photos (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.purchase_contracts(id) on delete cascade,
  path         text not null,
  label        text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cp_contract on public.contract_photos(contract_id);

alter table public.contract_photos enable row level security;

-- Okuma yardımcısı: SECURITY INVOKER -> purchase_contracts'ın RLS'sini (pc_select)
-- miras alır; "bu gemiyi görebiliyor muyum?" tek yerde tanımlı kalır.
create or replace function public.can_access_contract(p_contract_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.purchase_contracts c where c.id = p_contract_id);
$$;
grant execute on function public.can_access_contract(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS politikaları (contract_id kolon olduğundan yazma satır içinde kontrol
-- edilir; can_access_ship gemi-bazlı operasyon erişimini, sm_write ile aynı.)
-- ----------------------------------------------------------------------------
drop policy if exists cp_select on public.contract_photos;
create policy cp_select on public.contract_photos for select to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists cp_insert on public.contract_photos;
create policy cp_insert on public.contract_photos for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

drop policy if exists cp_delete on public.contract_photos;
create policy cp_delete on public.contract_photos for delete to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

-- ----------------------------------------------------------------------------
-- Storage politikaları (kova bazlı; asıl gizlilik path'i tutan tablodadır)
-- ----------------------------------------------------------------------------
drop policy if exists contract_photos_read on storage.objects;
create policy contract_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'contract-photos');

drop policy if exists contract_photos_insert on storage.objects;
create policy contract_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-photos' and public.auth_role() in ('admin','operations'));

drop policy if exists contract_photos_delete on storage.objects;
create policy contract_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-photos' and public.auth_role() in ('admin','operations'));
