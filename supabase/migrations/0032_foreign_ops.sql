-- =============================================================================
-- Sunar Tarımsal CRM - Yurtdışı operasyon: yapı + RLS (2/2)
-- Sıra: 32 -> 0031'den (enum değerleri) SONRA çalıştırın. (Idempotent.)
--
-- Akış: farklı bağlantıların malı yurtdışı depoda (location_type='foreign')
-- stoklanır, sonra gemiye yüklenir; Türkiye'deki boşaltma mevcut gemi
-- operasyonudur (değişmez).
--   - Depoya giriş  : stock_movements 'origin_in' (+) yurtdışı depoda
--     ('inbound' DEĞİL: inbound tüm ekranlarda "Türkiye'ye geldi" demektir)
--   - Gemiye yükleme: stock_movements 'transfer'  (−) yurtdışı depodan
--
-- 1) warehouses.country: yurtdışı depolar için ülke.
-- 2) purchase_contracts.agent_id + combined_shipments.agent_id: bağlantıyı
--    yurtdışında takip eden acente firması (companies.type='agent').
-- 3) acente rolü RLS: nakliyeci/gozetim'e paralel — yalnızca agent_id'si kendi
--    firması olan bağlantıları görür, onların stok hareketini girer.
-- 4) mark_contract_arrived: YURTDIŞI depoya 'inbound' bağlantıyı 'arrived'
--    YAPMAZ (mal daha Türkiye'ye gelmedi); yalnızca yurtiçi inbound tetikler.
-- 5) warehouse_expenses: depo masrafları (depolama/elleçleme/yükleme...);
--    maliyet raporuna bağlantı bazında yansır.
-- =============================================================================

-- 1) Depolara ülke alanı
alter table public.warehouses
  add column if not exists country text;

-- 2) Acente referansları
alter table public.purchase_contracts
  add column if not exists agent_id uuid references public.companies(id) on delete set null;
create index if not exists idx_pc_agent on public.purchase_contracts(agent_id);

alter table public.combined_shipments
  add column if not exists agent_id uuid references public.companies(id) on delete set null;

-- 3) Acente yardımcı fonksiyonu (nakliyeci/gozetim deseni)
create or replace function public.is_my_agent_ship(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.purchase_contracts pc
    where pc.id = p_contract_id
      and pc.agent_id is not null
      and pc.agent_id = public.my_company_id()
  );
$$;
grant execute on function public.is_my_agent_ship(uuid) to authenticated;
revoke execute on function public.is_my_agent_ship(uuid) from anon, public;

-- purchase_contracts: acente kendi bağlantılarını OKUR
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer')
    or (public.auth_base_role() = 'nakliyeci' and public.is_my_carrier_ship(id))
    or (public.auth_base_role() = 'gozetim'   and public.is_my_surveyor_ship(id))
    or (public.auth_base_role() = 'acente'    and public.is_my_agent_ship(id))
  );

-- stock_movements: acente kendi bağlantılarının hareketlerini OKUR + YAZAR
-- (0029'daki "operasyon, gemisiz/manuel hareket" kolu KORUNUR)
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_base_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_base_role() = 'operations' and contract_id is null)
    or (public.auth_base_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_base_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
    or (public.auth_base_role() = 'acente'     and public.is_my_agent_ship(contract_id))
  );

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'operations' and contract_id is null)
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
    or (public.auth_role() = 'acente'     and public.is_my_agent_ship(contract_id))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'operations' and contract_id is null)
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
    or (public.auth_role() = 'acente'     and public.is_my_agent_ship(contract_id))
  );

-- movement_photos yazma: acente de irsaliye/foto ekleyebilsin
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
        or (public.auth_role() = 'acente'     and public.is_my_agent_ship(m.contract_id))
      )
  );
$$;

drop policy if exists movement_photos_insert on storage.objects;
create policy movement_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'movement-photos'
    and public.auth_role() in ('admin','operations','nakliyeci','gozetim','acente')
  );

drop policy if exists movement_photos_delete on storage.objects;
create policy movement_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'movement-photos'
    and public.auth_role() in ('admin','operations','nakliyeci','gozetim','acente')
  );

-- combined_shipments: acente, kendi bağlantısını içeren kombine gemiyi OKUR
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
    or (public.auth_base_role() = 'acente' and exists (
      select 1 from public.purchase_contracts pc
      where pc.combined_shipment_id = combined_shipments.id
        and public.is_my_agent_ship(pc.id)
    ))
  );

-- ---------------------------------------------------------------------------
-- Taraf atama RPC'leri: acente parametresi eklendi.
-- Eski 4-parametreli imza DÜŞÜRÜLÜR (PostgREST'te overload belirsizliği
-- olmasın); yeni imza p_agent_id default null ile geriye uyumludur.
-- ---------------------------------------------------------------------------
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid);
create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null,
  p_agent_id    uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_admin()
    or (public.auth_role() = 'operations' and public.can_access_ship(p_contract_id))
  ) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end $$;
grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid) from anon, public;

drop function if exists public.assign_combined_ship_parties(uuid, uuid, uuid, uuid);
create or replace function public.assign_combined_ship_parties(
  p_combined_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null,
  p_agent_id    uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.auth_role() = 'operations') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.combined_shipments
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id
  where id = p_combined_id;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id
  where combined_shipment_id = p_combined_id;
end $$;
grant execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid, uuid) from anon, public;

-- ---------------------------------------------------------------------------
-- 4) Varış otomasyonu: yurtdışı girişler zaten 'origin_in' tipiyle yazıldığı
--    için 'inbound' tetikleyicisine hiç girmez. Ek savunma olarak, biri elle
--    yurtdışı depoya 'inbound' girerse de 'arrived' TETİKLENMEZ.
-- ---------------------------------------------------------------------------
create or replace function public.mark_contract_arrived()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.movement_type = 'inbound' and new.contract_id is not null then
    -- Yurtdışı (foreign) depoya giriş, malın Türkiye'ye geldiği anlamına gelmez.
    if not exists (
      select 1 from public.warehouses w
      where w.id = new.warehouse_id and w.type = 'foreign'
    ) then
      update public.purchase_contracts
         set status = 'arrived'
       where id = new.contract_id
         and status in ('draft', 'active', 'in_transit');
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4b) inventory görünümü: 'origin_in' de stok GİRİŞİ sayılır (yurtdışı depo
--     stoğu Stok Durumu/Harita'da görünsün). 0013'teki tanımın origin_in
--     eklenmiş hali; diğer mantık birebir aynıdır.
--       origin_in / inbound  -> deponun stoğuna GİRİŞ (+)
--       adjustment           -> işaretli düzeltme (+/−)
--       transfer / to_factory-> deponun stoğundan ÇIKIŞ (−)
--       satış (sales_orders) -> deponun stoğundan ÇIKIŞ (−)
-- ---------------------------------------------------------------------------
create or replace view public.inventory
with (security_invoker = on) as
with mv as (
  select
    product_id,
    warehouse_id,
    sum(case
      when movement_type = 'inbound' then quantity
      when movement_type = 'origin_in' then quantity
      when movement_type = 'adjustment' then quantity
      else 0
    end) as received,
    sum(case
      when movement_type in ('transfer','to_factory') then quantity
      else 0
    end) as relocated_out
  from public.stock_movements
  where warehouse_id is not null
  group by product_id, warehouse_id
),
outs as (
  select product_id, warehouse_id, sum(quantity) as sold
  from public.sales_orders
  where status <> 'cancelled' and warehouse_id is not null
  group by product_id, warehouse_id
)
select
  w.id    as warehouse_id,
  w.name  as warehouse_name,
  w.type  as location_type,
  pr.id   as product_id,
  pr.name as product_name,
  coalesce(mv.received, 0)                                        as received_qty,
  coalesce(outs.sold, 0) + coalesce(mv.relocated_out, 0)         as sold_qty,
  coalesce(mv.received, 0)
    - coalesce(outs.sold, 0)
    - coalesce(mv.relocated_out, 0)                              as available_qty
from public.warehouses w
join public.products pr on true
left join mv   on mv.warehouse_id = w.id and mv.product_id = pr.id
left join outs on outs.warehouse_id = w.id and outs.product_id = pr.id
where coalesce(mv.received, 0) <> 0
   or coalesce(mv.relocated_out, 0) <> 0
   or coalesce(outs.sold, 0) <> 0;

-- ---------------------------------------------------------------------------
-- 5) warehouse_expenses : depo masrafları (maliyete yansır)
-- ---------------------------------------------------------------------------
create table if not exists public.warehouse_expenses (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  contract_id  uuid references public.purchase_contracts(id) on delete set null,
  expense_type text not null default 'storage', -- storage|handling|loading|port|customs|other
  amount       numeric not null check (amount >= 0),
  currency     text not null default 'USD',
  usd_try      numeric,
  eur_try      numeric,
  fx_date      date,
  expense_date date not null default current_date,
  notes        text,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_we_warehouse on public.warehouse_expenses(warehouse_id);
create index if not exists idx_we_contract  on public.warehouse_expenses(contract_id);

drop trigger if exists trg_we_updated on public.warehouse_expenses;
create trigger trg_we_updated before update on public.warehouse_expenses
  for each row execute function public.set_updated_at();

alter table public.warehouse_expenses enable row level security;

-- Okuma: iç roller (dış roller — nakliyeci/gozetim/acente — masraf GÖREMEZ).
drop policy if exists we_select on public.warehouse_expenses;
create policy we_select on public.warehouse_expenses for select to authenticated
  using (
    public.auth_base_role() in
      ('admin','purchasing','operations','maliyet','finans','viewer')
  );

-- Yazma: admin + operasyon + maliyet (_view rolleri hariç).
drop policy if exists we_write on public.warehouse_expenses;
create policy we_write on public.warehouse_expenses for all to authenticated
  using  (public.auth_role() in ('admin','operations','maliyet'))
  with check (public.auth_role() in ('admin','operations','maliyet'));
