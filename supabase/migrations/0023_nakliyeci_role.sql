-- =============================================================================
-- Sunar Tarımsal CRM - Nakliyeci rolü
-- Sıra: 23 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Nakliyeci: dışarıdan nakliye firması kullanıcısı. SADECE kendi firmasına
-- atanmış gemilerde (purchase_contracts.carrier_id = kendi firması) araç bazlı
-- TONAJ girer ve istenirse irsaliye (foto/PDF) ekler. Başka hiçbir şeye erişmez:
-- bağlantı/satış/CRM/maliyet yok; gözetim/liman/nakliyeci ATAMASI yapamaz;
-- gemiyi bitiremez; gemi numune galerisine yazamaz (okuyabilir).
--
-- Bağlama: profiles.company_id, nakliyeci kullanıcısını bir 'carrier' firmaya
-- bağlar; admin bu firmayı kullanıcı yönetiminden atar.
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan
--   ilk "alter type" satırını TEK BAŞINA çalıştır, sonra dosyanın kalanını çalıştır.
-- =============================================================================

alter type public.user_role add value if not exists 'nakliyeci';

alter table public.profiles
  add column if not exists company_id uuid references public.companies(id) on delete set null;

-- Giriş yapan nakliyeci kullanıcısının bağlı olduğu firma.
create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_company_id() to authenticated;

-- Gemi, giriş yapan nakliyecinin firmasına mı atanmış?
create or replace function public.is_my_carrier_ship(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.purchase_contracts pc
    where pc.id = p_contract_id
      and pc.carrier_id is not null
      and pc.carrier_id = public.my_company_id()
  );
$$;
grant execute on function public.is_my_carrier_ship(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- purchase_contracts: nakliyeci yalnızca kendi gemilerini OKUR (yazamaz).
-- ---------------------------------------------------------------------------
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer')
    or (public.auth_base_role() = 'nakliyeci' and public.is_my_carrier_ship(id))
  );

-- ---------------------------------------------------------------------------
-- stock_movements: nakliyeci kendi gemilerinin araçlarını okur + yazar.
-- ---------------------------------------------------------------------------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_base_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_base_role() = 'nakliyeci' and public.is_my_carrier_ship(contract_id))
  );

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'nakliyeci' and public.is_my_carrier_ship(contract_id))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'nakliyeci' and public.is_my_carrier_ship(contract_id))
  );

-- ---------------------------------------------------------------------------
-- movement_photos: nakliyeci kendi gemilerinin araçlarına irsaliye ekleyebilsin.
-- (Okuma can_access_movement -> sm_select'i miras alır; yazma aşağıda.)
-- ---------------------------------------------------------------------------
create or replace function public.can_write_movement(p_movement_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stock_movements m
    where m.id = p_movement_id
      and (
        public.is_admin()
        or (public.auth_role() = 'operations' and public.can_access_ship(m.contract_id))
        or (public.auth_role() = 'nakliyeci' and public.is_my_carrier_ship(m.contract_id))
      )
  );
$$;

-- Storage: nakliyeci de movement-photos kovasına yükleyip silebilsin.
drop policy if exists movement_photos_insert on storage.objects;
create policy movement_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'movement-photos' and public.auth_role() in ('admin','operations','nakliyeci'));

drop policy if exists movement_photos_delete on storage.objects;
create policy movement_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'movement-photos' and public.auth_role() in ('admin','operations','nakliyeci'));
