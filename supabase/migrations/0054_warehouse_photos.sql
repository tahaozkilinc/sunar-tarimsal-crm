-- Sunar Tarımsal CRM - Depo fotoğrafları
-- ----------------------------------------------------------------------------
-- contract_photos (0022) ile AYNI desen, depo için. warehouses_select zaten
-- "using (true)" (herkes okur) olduğundan contract_photos'taki gibi ayrı bir
-- can_access_* yardımcı fonksiyona gerek yok — okuma doğrudan true.

insert into storage.buckets (id, name, public)
values ('warehouse-photos', 'warehouse-photos', false)
on conflict (id) do nothing;

create table if not exists public.warehouse_photos (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  path         text not null,
  label        text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_wp_warehouse on public.warehouse_photos(warehouse_id);

alter table public.warehouse_photos enable row level security;

drop policy if exists wp_select on public.warehouse_photos;
create policy wp_select on public.warehouse_photos for select to authenticated
  using (true);

drop policy if exists wp_insert on public.warehouse_photos;
create policy wp_insert on public.warehouse_photos for insert to authenticated
  with check (public.auth_role() in ('admin','operations'));

drop policy if exists wp_delete on public.warehouse_photos;
create policy wp_delete on public.warehouse_photos for delete to authenticated
  using (public.auth_role() in ('admin','operations'));

-- ----------------------------------------------------------------------------
-- Storage politikaları (kova bazlı; asıl gizlilik path'i tutan tablodadır)
-- ----------------------------------------------------------------------------
drop policy if exists warehouse_photos_read on storage.objects;
create policy warehouse_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'warehouse-photos');

drop policy if exists warehouse_photos_insert on storage.objects;
create policy warehouse_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'warehouse-photos' and public.auth_role() in ('admin','operations'));

drop policy if exists warehouse_photos_delete on storage.objects;
create policy warehouse_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'warehouse-photos' and public.auth_role() in ('admin','operations'));
