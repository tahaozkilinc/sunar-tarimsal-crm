-- =============================================================================
-- Sunar Tarımsal CRM - TEK DOSYA KURULUM
-- Bu dosyanın TAMAMINI Supabase SQL Editor'e yapıştırıp Run deyin (tek seferde).
-- (Şema + güvenlik politikaları + örnek veri + admin hesabı, hepsi sırayla.)
-- =============================================================================

-- ========================== BÖLÜM 1/3: ŞEMA ==================================
-- =============================================================================
-- Sunar Tarımsal CRM - Şema (Tablolar, Enum'lar, Fonksiyonlar, Trigger'lar)
-- Sıra: 1/3 -> bunu Supabase SQL Editor'de İLK çalıştırın.
-- =============================================================================

-- Şifreleme (admin tohumlaması için) -----------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- ENUM tipleri (Esnek: yeni değer eklemek için `alter type ... add value` yeterli)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin','purchasing','operations','sales','pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.company_type as enum ('supplier','customer','both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.location_type as enum ('warehouse','factory');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contract_status as enum ('draft','active','in_transit','arrived','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_type as enum ('inbound','transfer','to_factory','adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sales_status as enum ('draft','confirmed','delivered','invoiced','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum ('call','meeting','email','note','task','visit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_status as enum ('open','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crm_module as enum ('purchasing','sales');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Ortak yardımcılar
-- ----------------------------------------------------------------------------
-- Her satır güncellemesinde updated_at'i tazeler.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- profiles : auth.users tablosunu rol bilgisiyle genişletir
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        public.user_role not null default 'pending',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Rol okuma yardımcıları (SECURITY DEFINER -> RLS'yi bypass eder, recursion engellenir)
create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Yeni auth kullanıcısı oluşunca otomatik profil aç.
-- Admin e-postası otomatik 'admin' rolü alır; diğerleri metadata'daki rolü ya da 'pending'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  desired_role public.user_role;
begin
  begin
    desired_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pending');
  exception when others then
    desired_role := 'pending';
  end;

  if new.email = 'taha.ozkilinc@sunaryatirim.com.tr' then
    desired_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    desired_role
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- companies : CRM cari hesapları (tedarikçi / müşteri)
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        public.company_type not null default 'supplier',
  tax_no      text,
  city        text,
  country     text default 'Türkiye',
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_companies_type on public.companies(type);
create index if not exists idx_companies_name on public.companies(name);

drop trigger if exists trg_companies_updated on public.companies;
create trigger trg_companies_updated before update on public.companies
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- contacts : firma içindeki kişiler
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  full_name   text not null,
  title       text,
  phone       text,
  email       text,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_contacts_company on public.contacts(company_id);

drop trigger if exists trg_contacts_updated on public.contacts;
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- products : hammaddeler (yağlı tohumlar vb.)
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text,
  category    text default 'Yağlı Tohum',
  unit        text not null default 'ton',
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_products_active on public.products(is_active);

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- warehouses : depolar ve fabrikalar
-- ----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        public.location_type not null default 'warehouse',
  city        text,
  capacity    numeric,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_warehouses_updated on public.warehouses;
create trigger trg_warehouses_updated before update on public.warehouses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- purchase_contracts : satın alma sözleşmeleri / alınan yağlı tohum + ETA
-- ----------------------------------------------------------------------------
create table if not exists public.purchase_contracts (
  id              uuid primary key default gen_random_uuid(),
  contract_no     text,
  supplier_id     uuid references public.companies(id) on delete set null,
  product_id      uuid references public.products(id) on delete set null,
  quantity        numeric not null default 0,
  unit            text not null default 'ton',
  price           numeric,
  currency        text not null default 'USD',
  incoterm        text,
  origin_country  text,
  vessel          text,
  eta             date,
  laycan_start    date,
  laycan_end      date,
  status          public.contract_status not null default 'draft',
  contract_file_url text,
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_pc_supplier on public.purchase_contracts(supplier_id);
create index if not exists idx_pc_product on public.purchase_contracts(product_id);
create index if not exists idx_pc_status on public.purchase_contracts(status);
create index if not exists idx_pc_eta on public.purchase_contracts(eta);

drop trigger if exists trg_pc_updated on public.purchase_contracts;
create trigger trg_pc_updated before update on public.purchase_contracts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- stock_movements : operasyon -> hammaddenin depoya / fabrikaya çekilmesi
-- ----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid references public.purchase_contracts(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  movement_type public.movement_type not null default 'inbound',
  quantity      numeric not null default 0,
  unit          text not null default 'ton',
  movement_date date not null default current_date,
  vehicle_plate text,
  notes         text,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_sm_contract on public.stock_movements(contract_id);
create index if not exists idx_sm_warehouse on public.stock_movements(warehouse_id);
create index if not exists idx_sm_product on public.stock_movements(product_id);
create index if not exists idx_sm_date on public.stock_movements(movement_date);

drop trigger if exists trg_sm_updated on public.stock_movements;
create trigger trg_sm_updated before update on public.stock_movements
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- sales_orders : satış kayıtları
-- ----------------------------------------------------------------------------
create table if not exists public.sales_orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text,
  customer_id   uuid references public.companies(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  contract_id   uuid references public.purchase_contracts(id) on delete set null,
  quantity      numeric not null default 0,
  unit          text not null default 'ton',
  price         numeric,
  currency      text not null default 'TRY',
  delivery_date date,
  status        public.sales_status not null default 'draft',
  notes         text,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_so_customer on public.sales_orders(customer_id);
create index if not exists idx_so_product on public.sales_orders(product_id);
create index if not exists idx_so_status on public.sales_orders(status);

drop trigger if exists trg_so_updated on public.sales_orders;
create trigger trg_so_updated before update on public.sales_orders
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- crm_activities : satış & satın alma CRM aktiviteleri (görüşme, görev, not...)
-- ----------------------------------------------------------------------------
create table if not exists public.crm_activities (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  module        public.crm_module not null default 'purchasing',
  activity_type public.activity_type not null default 'note',
  subject       text not null,
  description   text,
  due_date      date,
  status        public.activity_status not null default 'open',
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_act_company on public.crm_activities(company_id);
create index if not exists idx_act_module on public.crm_activities(module);
create index if not exists idx_act_status on public.crm_activities(status);

drop trigger if exists trg_act_updated on public.crm_activities;
create trigger trg_act_updated before update on public.crm_activities
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- inventory : depo/fabrika bazında kullanılabilir stok (giren - satılan)
-- security_invoker=on -> sorgulayan kullanıcının RLS'sine uyar.
-- ----------------------------------------------------------------------------
create or replace view public.inventory
with (security_invoker = on) as
with ins as (
  select product_id, warehouse_id, sum(quantity) as q
  from public.stock_movements
  where movement_type in ('inbound','transfer','to_factory')
  group by product_id, warehouse_id
),
outs as (
  select product_id, warehouse_id, sum(quantity) as q
  from public.sales_orders
  where status <> 'cancelled' and warehouse_id is not null
  group by product_id, warehouse_id
)
select
  w.id   as warehouse_id,
  w.name as warehouse_name,
  w.type as location_type,
  pr.id  as product_id,
  pr.name as product_name,
  coalesce(ins.q, 0) as received_qty,
  coalesce(outs.q, 0) as sold_qty,
  coalesce(ins.q, 0) - coalesce(outs.q, 0) as available_qty
from public.warehouses w
join public.products pr on true
left join ins  on ins.warehouse_id = w.id and ins.product_id = pr.id
left join outs on outs.warehouse_id = w.id and outs.product_id = pr.id
where coalesce(ins.q, 0) <> 0 or coalesce(outs.q, 0) <> 0;

-- ===================== BÖLÜM 2/3: RLS POLİTİKALARI ===========================
-- =============================================================================
-- Sunar Tarımsal CRM - RLS (Satır Bazlı Güvenlik) Politikaları
-- Sıra: 2/3 -> 0001_schema.sql'den SONRA çalıştırın.
--
-- Fonksiyon izolasyonu mantığı:
--   admin       : her şeyi görür/yönetir
--   purchasing  : tedarikçiler, sözleşmeler, satın alma CRM'i
--   operations  : depo/fabrika hareketleri (+ sözleşmeleri okuyabilir)
--   sales       : müşteriler, satışlar, satış CRM'i, stok durumu
--   pending     : hiçbir modüle erişimi yok (rol atanmayı bekler)
-- =============================================================================

-- Firma görünürlüğü yardımcı fonksiyonu (contacts & activities tekrar kullanır)
create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_role() in ('purchasing','operations','sales')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_role() = 'sales' and c.type in ('customer','both'))
      )
    )
  end;
$$;

-- RLS'yi tüm tablolarda aç -----------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.contacts            enable row level security;
alter table public.products            enable row level security;
alter table public.warehouses          enable row level security;
alter table public.purchase_contracts  enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.sales_orders        enable row level security;
alter table public.crm_activities      enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- products (referans veri: herkes okur, yetkili roller yazar)
-- ---------------------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (true);

drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.auth_role() in ('admin','purchasing','operations'))
  with check (public.auth_role() in ('admin','purchasing','operations'));

-- ---------------------------------------------------------------------------
-- warehouses (referans veri: herkes okur, operasyon/admin yazar)
-- ---------------------------------------------------------------------------
drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses for select to authenticated
  using (true);

drop policy if exists warehouses_write on public.warehouses;
create policy warehouses_write on public.warehouses for all to authenticated
  using (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));

-- ---------------------------------------------------------------------------
-- companies (tedarikçi -> purchasing/operations, müşteri -> sales)
-- ---------------------------------------------------------------------------
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.can_see_company(id));

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
  );

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.can_see_company(id))
  with check (public.can_see_company(id));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_admin() or public.can_see_company(id));

-- ---------------------------------------------------------------------------
-- contacts (firmasının görünürlüğüne bağlı)
-- ---------------------------------------------------------------------------
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.can_see_company(company_id));

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts for all to authenticated
  using (public.can_see_company(company_id))
  with check (public.can_see_company(company_id));

-- ---------------------------------------------------------------------------
-- purchase_contracts (purchasing + operations okur; purchasing + admin yazar)
-- ---------------------------------------------------------------------------
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin','purchasing','operations'));

drop policy if exists pc_write on public.purchase_contracts;
create policy pc_write on public.purchase_contracts for all to authenticated
  using (public.auth_role() in ('admin','purchasing'))
  with check (public.auth_role() in ('admin','purchasing'));

-- ---------------------------------------------------------------------------
-- stock_movements (operasyon yazar; ilgili roller okur)
-- ---------------------------------------------------------------------------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (public.auth_role() in ('admin','operations','purchasing','sales'));

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));

-- ---------------------------------------------------------------------------
-- sales_orders (sadece sales + admin) -> satış fiyatları diğerlerinden gizli
-- ---------------------------------------------------------------------------
drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin','sales'));

drop policy if exists so_write on public.sales_orders;
create policy so_write on public.sales_orders for all to authenticated
  using (public.auth_role() in ('admin','sales'))
  with check (public.auth_role() in ('admin','sales'));

-- ---------------------------------------------------------------------------
-- crm_activities (modüle göre: purchasing -> satın alma, sales -> satış)
-- ---------------------------------------------------------------------------
drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
  );

drop policy if exists act_write on public.crm_activities;
create policy act_write on public.crm_activities for all to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
  )
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
  );

-- ================== BÖLÜM 3/3: BAŞLANGIÇ VERİSİ + ADMIN ======================
-- =============================================================================
-- Sunar Tarımsal CRM - Başlangıç Verisi + Admin Hesabı
-- Sıra: 3/3 -> 0002_policies.sql'den SONRA çalıştırın.
--
-- Admin: taha.ozkilinc@sunaryatirim.com.tr (şifre rastgele üretilir, aşağıdaki
-- bloğun NOTICE çıktısında bir kez gösterilir; repoya yazılmaz)
-- (Bu blok idempotent'tir; tekrar çalıştırmak güvenlidir.)
-- =============================================================================

-- Örnek hammaddeler (yağlı tohumlar) -----------------------------------------
insert into public.products (name, code, category, unit)
select v.name, v.code, 'Yağlı Tohum', 'ton'
from (values
  ('Ayçiçeği Tohumu', 'AYC'),
  ('Soya Fasulyesi', 'SOY'),
  ('Kanola (Kolza)', 'KAN'),
  ('Aspir', 'ASP'),
  ('Pamuk Tohumu (Çiğit)', 'PAM'),
  ('Keten Tohumu', 'KET')
) as v(name, code)
where not exists (select 1 from public.products p where p.name = v.name);

-- Örnek depo / fabrika (sonradan Yönetim ekranından düzenlenebilir) -----------
insert into public.warehouses (name, type, city)
select v.name, v.type::public.location_type, v.city
from (values
  ('Merkez Depo', 'warehouse', 'İstanbul'),
  ('Liman Deposu', 'warehouse', 'İzmir'),
  ('Ezme Fabrikası', 'factory', 'Tekirdağ')
) as v(name, type, city)
where not exists (select 1 from public.warehouses w where w.name = v.name);

-- Admin kullanıcısı -----------------------------------------------------------
-- Not: Eğer bu blok ortamınızda hata verirse, kullanıcıyı Supabase panelinden
--      (Authentication -> Users -> Add user, "Auto Confirm User" işaretli)
--      oluşturun; trigger e-postayı görüp otomatik 'admin' rolü atayacaktır.
do $$
declare
  v_uid uuid;
  v_email text := 'taha.ozkilinc@sunaryatirim.com.tr';
  v_temp_password text;
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    -- auth.users şeması GoTrue sürümüne göre değişebilir; hata olursa
    -- script'in geri kalanını bozmadan atla (panelden manuel oluşturulabilir).
    begin
      v_uid := gen_random_uuid();
      v_temp_password := encode(extensions.gen_random_bytes(12), 'hex');

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email,
        extensions.crypt(v_temp_password, extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', 'Taha Özkılınç', 'role', 'admin'),
        '', '', '', ''
      );

      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );

      raise notice 'Admin oluşturuldu: % — geçici şifre: % (kopyalayın; tekrar gösterilmeyecek, ilk girişten sonra hemen değiştirin)', v_email, v_temp_password;
    exception when others then
      raise notice 'Admin kullanıcısı SQL ile oluşturulamadı (%). Lütfen Supabase panelinden Authentication > Users > Add user ile % için kendi belirleyeceğiniz bir şifreyle oluşturun; sistem otomatik admin yapacaktır.', sqlerrm, v_email;
      v_uid := null;
    end;
  end if;

  -- Kullanıcı varsa profil satırını admin olarak garanti et.
  if v_uid is not null then
    insert into public.profiles (id, email, full_name, role)
    values (v_uid, v_email, 'Taha Özkılınç', 'admin')
    on conflict (id) do update set role = 'admin', is_active = true;
  end if;
end $$;
