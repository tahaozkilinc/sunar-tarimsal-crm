-- =============================================================================
-- Sunar Tarımsal CRM - Gözetim rolü + Kombine Gemi
-- Sıra: 27 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) gozetim: gözetim şirketi kullanıcısı. Nakliyeciye paralel — yalnızca
--    kendi firmasına atanmış gemilerde (purchase_contracts.surveyor_id =
--    kendi firması) araç tonajı girer, irsaliye ekler. Başka hiçbir şeye
--    erişemez: CRM/satın alma/maliyet yok; taraf ataması yapamaz;
--    gemiyi bitiremez.
--    profiles.company_id nakliyecide olduğu gibi burada da "surveyor" tipli
--    firmaya bağlar; admin bu atamayı kullanıcı yönetiminden yapar.
--
-- 2) combined_shipments: aynı fiziksel gemide farklı tedarikçilerden gelen
--    birden fazla purchase_contract'ı birleştiren kayıt.
--    Örnek: 300+300+300 ton, 3 farklı tedarikçi, tek gemi.
--    purchase_contracts.combined_shipment_id bu tabloya FK tutar.
--    Operasyon ekranı combined_shipment_id paylaşan sözleşmeleri tek bir
--    gemi operasyonu olarak gösterir.
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan
--   ilk "alter type" satırını TEK BAŞINA çalıştır, sonra geri kalanını çalıştır.
-- =============================================================================

alter type public.user_role add value if not exists 'gozetim';

-- ---------------------------------------------------------------------------
-- 1a) Gözetim yardımcı fonksiyonu
-- ---------------------------------------------------------------------------
create or replace function public.is_my_surveyor_ship(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.purchase_contracts pc
    where pc.id = p_contract_id
      and pc.surveyor_id is not null
      and pc.surveyor_id = public.my_company_id()
  );
$$;
grant execute on function public.is_my_surveyor_ship(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Kombine Gemi tablosu
-- ---------------------------------------------------------------------------
create table if not exists public.combined_shipments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  vessel      text,
  eta         date,
  surveyor_id uuid references public.companies(id) on delete set null,
  port_id     uuid references public.companies(id) on delete set null,
  carrier_id  uuid references public.companies(id) on delete set null,
  status      text not null default 'active',
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cs_status on public.combined_shipments(status);

alter table public.purchase_contracts
  add column if not exists combined_shipment_id uuid
    references public.combined_shipments(id) on delete set null;
create index if not exists idx_pc_combined on public.purchase_contracts(combined_shipment_id);

-- RLS
alter table public.combined_shipments enable row level security;

drop policy if exists cs_select on public.combined_shipments;
create policy cs_select on public.combined_shipments for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer')
    or (public.auth_base_role() = 'gozetim' and exists (
      select 1 from public.purchase_contracts pc
      where pc.combined_shipment_id = combined_shipments.id
        and public.is_my_surveyor_ship(pc.id)
    ))
    or (public.auth_base_role() = 'nakliyeci' and exists (
      select 1 from public.purchase_contracts pc
      where pc.combined_shipment_id = combined_shipments.id
        and public.is_my_carrier_ship(pc.id)
    ))
  );

drop policy if exists cs_write on public.combined_shipments;
create policy cs_write on public.combined_shipments for all to authenticated
  using  (public.auth_role() in ('admin','purchasing'))
  with check (public.auth_role() in ('admin','purchasing'));

-- RPC: tarafları kombine gemiye ata; bağlı tüm sözleşmelere de yansıt
-- (is_my_surveyor_ship ve is_my_carrier_ship doğru çalışsın diye)
create or replace function public.assign_combined_ship_parties(
  p_combined_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.auth_role() = 'operations') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.combined_shipments
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id
  where id = p_combined_id;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id
  where combined_shipment_id = p_combined_id;
end $$;
grant execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) purchase_contracts: gozetim kendi gemilerini OKUR
-- ---------------------------------------------------------------------------
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer')
    or (public.auth_base_role() = 'nakliyeci' and public.is_my_carrier_ship(id))
    or (public.auth_base_role() = 'gozetim'   and public.is_my_surveyor_ship(id))
  );

-- ---------------------------------------------------------------------------
-- 4) stock_movements: gozetim kendi gemilerini OKUR + YAZAR
-- ---------------------------------------------------------------------------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_base_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_base_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_base_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  );

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  );

-- ---------------------------------------------------------------------------
-- 5) can_write_movement: gozetim de irsaliye yazabilsin
-- ---------------------------------------------------------------------------
create or replace function public.can_write_movement(p_movement_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stock_movements m
    where m.id = p_movement_id
      and (
        public.is_admin()
        or (public.auth_role() = 'operations' and public.can_access_ship(m.contract_id))
        or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(m.contract_id))
        or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(m.contract_id))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6) Storage: gozetim movement-photos kovasına yükleyip silebilsin
-- ---------------------------------------------------------------------------
drop policy if exists movement_photos_insert on storage.objects;
create policy movement_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'movement-photos'
    and public.auth_role() in ('admin','operations','nakliyeci','gozetim')
  );

drop policy if exists movement_photos_delete on storage.objects;
create policy movement_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'movement-photos'
    and public.auth_role() in ('admin','operations','nakliyeci','gozetim')
  );
