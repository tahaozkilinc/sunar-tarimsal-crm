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
