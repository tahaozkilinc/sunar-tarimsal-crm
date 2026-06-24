-- =============================================================================
-- Sunar Tarımsal CRM - Araç (stok hareketi) bazlı fotoğraflar (irsaliye/numune)
-- Sıra: 21 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Operasyon ekibi, gemi boşaltmada her araç girişine (stock_movements) bir veya
-- birden çok fotoğraf ekleyebilir (irsaliye, numune vb.). Fotoğraflar tarayıcıda
-- sıkıştırılıp private "movement-photos" Storage kovasına yüklenir; yalnızca yol
-- bu tabloda saklanır, görseller imzalı URL ile açılır.
--
-- Erişim, ilgili stok hareketiyle (ve dolayısıyla gemiyle) AYNI kurala uyar:
--   - okuma: stok hareketini görebilen herkes (sm_select neyi görüyorsa)
--   - yazma: admin + operasyon (yalnızca erişebildiği gemi -> can_access_ship);
--            _view (salt-okunur) roller yazamaz.
-- =============================================================================

-- Private Storage kovası ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('movement-photos', 'movement-photos', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- movement_photos : bir araç girişine (stock_movements) bağlı fotoğraf yolları
-- ----------------------------------------------------------------------------
create table if not exists public.movement_photos (
  id           uuid primary key default gen_random_uuid(),
  movement_id  uuid not null references public.stock_movements(id) on delete cascade,
  path         text not null,
  label        text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mp_movement on public.movement_photos(movement_id);

alter table public.movement_photos enable row level security;

-- ----------------------------------------------------------------------------
-- Erişim yardımcıları
-- ----------------------------------------------------------------------------
-- Okuma: SECURITY INVOKER -> stock_movements'ın kendi RLS'sini (sm_select) miras
-- alır. Böylece "bu hareketi görebiliyor muyum?" sorusu tek yerde tanımlı kalır
-- ve _view rolleri dahil her durum otomatik tutarlı olur.
create or replace function public.can_access_movement(p_movement_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.stock_movements m where m.id = p_movement_id);
$$;

-- Yazma: admin veya erişebildiği gemiye sahip operasyon (sm_write ile birebir).
-- SECURITY DEFINER -> hareketin contract_id'sini güvenle okuyup can_access_ship'e
-- sorar; rol kontrolü açıkça yapıldığından _view roller hariç tutulur.
create or replace function public.can_write_movement(p_movement_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stock_movements m
    where m.id = p_movement_id
      and (
        public.is_admin()
        or (public.auth_role() = 'operations' and public.can_access_ship(m.contract_id))
      )
  );
$$;

grant execute on function public.can_access_movement(uuid) to authenticated;
grant execute on function public.can_write_movement(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS politikaları
-- ----------------------------------------------------------------------------
drop policy if exists mp_select on public.movement_photos;
create policy mp_select on public.movement_photos for select to authenticated
  using (public.can_access_movement(movement_id));

drop policy if exists mp_insert on public.movement_photos;
create policy mp_insert on public.movement_photos for insert to authenticated
  with check (public.can_write_movement(movement_id));

drop policy if exists mp_delete on public.movement_photos;
create policy mp_delete on public.movement_photos for delete to authenticated
  using (public.can_write_movement(movement_id));

-- ----------------------------------------------------------------------------
-- Storage politikaları (kova bazlı; asıl gizlilik path'i tutan tablodadır,
-- contracts kovasıyla aynı yaklaşım)
-- ----------------------------------------------------------------------------
drop policy if exists movement_photos_read on storage.objects;
create policy movement_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'movement-photos');

drop policy if exists movement_photos_insert on storage.objects;
create policy movement_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'movement-photos' and public.auth_role() in ('admin','operations'));

drop policy if exists movement_photos_delete on storage.objects;
create policy movement_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'movement-photos' and public.auth_role() in ('admin','operations'));
