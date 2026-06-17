-- =============================================================================
-- Sunar Tarımsal CRM — TEK DOSYA KURULUM (0001 → 0012)
-- Yeni bir Supabase projesinde TEK SEFERDEKİ kurulum için.
--
-- KULLANIM:
--   Supabase Dashboard → SQL Editor → Yeni sorgu → Bu dosyayı yapıştır → Çalıştır
--
-- UYARI: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan
--   adım 1 ve 2'yi ALT BÖLÜM başlıklarındaki talimatlara göre AYRI çalıştır.
--   Pratikte çoğu zaman tek seferde geçer.
-- =============================================================================


-- ============================================================
-- BÖLÜM 1/12 — Şema (tablolar, enum'lar, fonksiyonlar, trigger'lar)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Enum tipleri
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

-- Ortak yardımcı: updated_at tazeleme
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- profiles
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

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

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

-- companies
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

-- contacts
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

-- products
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

-- warehouses
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

-- purchase_contracts
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

-- stock_movements
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

-- sales_orders
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

-- crm_activities
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

-- inventory view
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


-- ============================================================
-- BÖLÜM 2/12 — RLS Politikaları
-- ============================================================

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

alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.contacts            enable row level security;
alter table public.products            enable row level security;
alter table public.warehouses          enable row level security;
alter table public.purchase_contracts  enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.sales_orders        enable row level security;
alter table public.crm_activities      enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (true);

drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.auth_role() in ('admin','purchasing','operations'))
  with check (public.auth_role() in ('admin','purchasing','operations'));

drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses for select to authenticated
  using (true);

drop policy if exists warehouses_write on public.warehouses;
create policy warehouses_write on public.warehouses for all to authenticated
  using (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));

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

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.can_see_company(company_id));

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts for all to authenticated
  using (public.can_see_company(company_id))
  with check (public.can_see_company(company_id));

drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin','purchasing','operations'));

drop policy if exists pc_write on public.purchase_contracts;
create policy pc_write on public.purchase_contracts for all to authenticated
  using (public.auth_role() in ('admin','purchasing'))
  with check (public.auth_role() in ('admin','purchasing'));

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (public.auth_role() in ('admin','operations','purchasing','sales'));

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (public.auth_role() in ('admin','operations'))
  with check (public.auth_role() in ('admin','operations'));

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin','sales'));

drop policy if exists so_write on public.sales_orders;
create policy so_write on public.sales_orders for all to authenticated
  using (public.auth_role() in ('admin','sales'))
  with check (public.auth_role() in ('admin','sales'));

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


-- ============================================================
-- BÖLÜM 3/12 — Başlangıç verisi + Admin hesabı
-- ============================================================

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

insert into public.warehouses (name, type, city)
select v.name, v.type::public.location_type, v.city
from (values
  ('Merkez Depo', 'warehouse', 'İstanbul'),
  ('Liman Deposu', 'warehouse', 'İzmir'),
  ('Ezme Fabrikası', 'factory', 'Tekirdağ')
) as v(name, type, city)
where not exists (select 1 from public.warehouses w where w.name = v.name);

-- Admin kullanıcısı (başarısız olursa panelden oluşturun)
do $$
declare
  v_uid uuid;
  v_email text := 'taha.ozkilinc@sunaryatirim.com.tr';
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    begin
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email,
        extensions.crypt('Sunar19*', extensions.gen_salt('bf')),
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
    exception when others then
      raise notice 'Admin SQL ile oluşturulamadı (%): Supabase panelinden Authentication > Users > Add user (Auto Confirm) ile % / Sunar19* oluşturun.', sqlerrm, v_email;
      v_uid := null;
    end;
  end if;

  if v_uid is not null then
    insert into public.profiles (id, email, full_name, role)
    values (v_uid, v_email, 'Taha Özkılınç', 'admin')
    on conflict (id) do update set role = 'admin', is_active = true;
  end if;
end $$;


-- ============================================================
-- BÖLÜM 4/12 — Operasyon boşaltma trigger'ı
-- ============================================================

create or replace function public.mark_contract_arrived()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.movement_type = 'inbound' and new.contract_id is not null then
    update public.purchase_contracts
       set status = 'arrived'
     where id = new.contract_id
       and status in ('draft', 'active', 'in_transit');
  end if;
  return new;
end $$;

drop trigger if exists trg_mark_contract_arrived on public.stock_movements;
create trigger trg_mark_contract_arrived
  after insert on public.stock_movements
  for each row execute function public.mark_contract_arrived();


-- ============================================================
-- BÖLÜM 5/12 — Ödeme tarihi, alıcı alanları + Finans rolü
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan
-- bu bölümü AYRI bir sorgu olarak (tek başına) çalıştır, ardından devam et.
-- ============================================================

alter table public.purchase_contracts
  add column if not exists payment_due_date date,
  add column if not exists buyer text,
  add column if not exists on_behalf text;

alter type public.user_role add value if not exists 'finans';

create or replace view public.payment_schedule
with (security_invoker = off) as
  select id, contract_no, payment_due_date, eta, status
  from public.purchase_contracts
  where public.auth_role() in ('admin', 'finans')
    and payment_due_date is not null
    and status <> 'cancelled';

grant select on public.payment_schedule to authenticated;


-- ============================================================
-- BÖLÜM 6/12 — Yükleme limanı + "Kimin Adına" listesi
-- ============================================================

alter table public.purchase_contracts
  add column if not exists loading_port text,
  add column if not exists principal_id uuid;

create table if not exists public.principals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.purchase_contracts
    add constraint purchase_contracts_principal_id_fkey
    foreign key (principal_id) references public.principals(id) on delete set null;
exception when duplicate_object then null; end $$;

insert into public.principals (name)
select v.name from (values
  ('ELİTA'), ('SUNAR MISIR'), ('SUNAR UN YEM'), ('TİCARET')
) as v(name)
where not exists (select 1 from public.principals p where p.name = v.name);

alter table public.principals enable row level security;
drop policy if exists principals_select on public.principals;
create policy principals_select on public.principals for select to authenticated using (true);
drop policy if exists principals_write on public.principals;
create policy principals_write on public.principals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- BÖLÜM 7/12 — Maliyet rolü + satışın bağlantı görünümü
--
-- NOT: Burada da "ALTER TYPE ... ADD VALUE" var. Hata alırsan
-- ilk satırı tek başına çalıştır, ardından devam et.
-- ============================================================

alter type public.user_role add value if not exists 'maliyet';

drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin', 'purchasing', 'operations', 'maliyet'));

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin', 'sales', 'maliyet'));

create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet')
    and c.status <> 'cancelled';

grant select on public.sellable_contracts to authenticated;


-- ============================================================
-- BÖLÜM 8/12 — Maliyet rolü firma adlarını görebilsin
-- ============================================================

drop policy if exists companies_select_maliyet on public.companies;
create policy companies_select_maliyet on public.companies for select to authenticated
  using (public.auth_role() = 'maliyet');


-- ============================================================
-- BÖLÜM 9/12 — Denetim kaydı (audit log)
-- ============================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  actor       uuid,
  actor_email text,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists idx_audit_changed_at on public.audit_log(changed_at desc);
create index if not exists idx_audit_table on public.audit_log(table_name);
create index if not exists idx_audit_record on public.audit_log(record_id);

alter table public.audit_log enable row level security;

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
begin
  select email into v_email from public.profiles where id = v_actor;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, old_data)
    values (tg_table_name, old.id, tg_op, v_actor, v_email, to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, old_data, new_data)
    values (tg_table_name, new.id, tg_op, v_actor, v_email, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, new_data)
    values (tg_table_name, new.id, tg_op, v_actor, v_email, to_jsonb(new));
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','contacts','products','warehouses',
    'purchase_contracts','stock_movements','sales_orders',
    'crm_activities','principals'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()',
      t
    );
  end loop;
end $$;


-- ============================================================
-- BÖLÜM 10/12 — Sözleşme dosyaları için Storage kovası
-- ============================================================

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

drop policy if exists contracts_read on storage.objects;
create policy contracts_read on storage.objects for select to authenticated
  using (bucket_id = 'contracts');

drop policy if exists contracts_insert on storage.objects;
create policy contracts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));

drop policy if exists contracts_update on storage.objects;
create policy contracts_update on storage.objects for update to authenticated
  using (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'))
  with check (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));

drop policy if exists contracts_delete on storage.objects;
create policy contracts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));


-- ============================================================
-- BÖLÜM 11/12 — TCMB döviz kuru alanları
-- ============================================================

alter table public.purchase_contracts
  add column if not exists usd_try numeric,
  add column if not exists eur_try numeric,
  add column if not exists fx_date date;

alter table public.sales_orders
  add column if not exists usd_try numeric,
  add column if not exists eur_try numeric,
  add column if not exists fx_date date;


-- ============================================================
-- BÖLÜM 12/12 — Gemi bazlı operasyon ataması + şoför bilgisi + maliyet RLS düzeltmesi
-- ============================================================

alter table public.purchase_contracts
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.stock_movements
  add column if not exists driver_name text;

create index if not exists idx_pc_assigned_to on public.purchase_contracts(assigned_to);

create or replace function public.can_access_ship(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from public.purchase_contracts where assigned_to = auth.uid()
    ) then p_contract_id is not null and exists (
      select 1 from public.purchase_contracts pc
      where pc.id = p_contract_id and pc.assigned_to = auth.uid()
    )
    else p_contract_id is null or not exists (
      select 1 from public.purchase_contracts pc
      where pc.id = p_contract_id and pc.assigned_to is not null
    )
  end;
$$;

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_role() in ('admin','purchasing','sales','maliyet')
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

drop policy if exists profiles_select_assign on public.profiles;
create policy profiles_select_assign on public.profiles for select to authenticated
  using (public.auth_role() in ('admin','purchasing'));


-- ============================================================
-- BÖLÜM 13/13 — Stok (inventory) görünümü düzeltmesi
-- Transfer/fabrikaya hareketleri kaynaktan düşer (çift sayım önlenir).
-- ============================================================

create or replace view public.inventory
with (security_invoker = on) as
with mv as (
  select
    product_id,
    warehouse_id,
    sum(case
      when movement_type = 'inbound' then quantity
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
  coalesce(mv.received, 0)                                 as received_qty,
  coalesce(outs.sold, 0) + coalesce(mv.relocated_out, 0)  as sold_qty,
  coalesce(mv.received, 0)
    - coalesce(outs.sold, 0)
    - coalesce(mv.relocated_out, 0)                       as available_qty
from public.warehouses w
join public.products pr on true
left join mv   on mv.warehouse_id = w.id and mv.product_id = pr.id
left join outs on outs.warehouse_id = w.id and outs.product_id = pr.id
where coalesce(mv.received, 0) <> 0
   or coalesce(mv.relocated_out, 0) <> 0
   or coalesce(outs.sold, 0) <> 0;


-- ============================================================
-- BÖLÜM 14/14 — "viewer" (Görüntüleyici) salt-okunur rolü
-- Tüm modülleri okur, hiçbir şeyi değiştiremez (write politikası yok).
-- ============================================================

alter type public.user_role add value if not exists 'viewer';

drop policy if exists profiles_select_assign on public.profiles;
create policy profiles_select_assign on public.profiles for select to authenticated
  using (public.auth_role() in ('admin','purchasing','viewer'));

drop policy if exists companies_select_viewer on public.companies;
create policy companies_select_viewer on public.companies for select to authenticated
  using (public.auth_role() = 'viewer');

drop policy if exists contacts_select_viewer on public.contacts;
create policy contacts_select_viewer on public.contacts for select to authenticated
  using (public.auth_role() = 'viewer');

drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_role() in ('admin','purchasing','operations','maliyet','viewer'));

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
  );

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('admin','sales','maliyet','viewer'));

drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or public.auth_role() = 'viewer'
    or (public.auth_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_role() = 'sales' and module = 'sales')
  );

create or replace view public.payment_schedule
with (security_invoker = off) as
  select id, contract_no, payment_due_date, eta, status
  from public.purchase_contracts
  where public.auth_role() in ('admin', 'finans', 'viewer')
    and payment_due_date is not null
    and status <> 'cancelled';
grant select on public.payment_schedule to authenticated;

create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet', 'viewer')
    and c.status <> 'cancelled';
grant select on public.sellable_contracts to authenticated;


-- ============================================================
-- BÖLÜM 15/15 — Kendi profilini güncelleme + rol başına salt-okunur roller
-- update_my_profile() + auth_base_role() + "_view" rolleri (taban rolüyle okur,
-- yazamaz). finans/maliyet zaten salt-okunur; tümü için global "viewer".
-- ============================================================

alter type public.user_role add value if not exists 'purchasing_view';
alter type public.user_role add value if not exists 'operations_view';
alter type public.user_role add value if not exists 'sales_view';

create or replace function public.update_my_profile(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'İsim boş olamaz';
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = auth.uid();
end $$;
grant execute on function public.update_my_profile(text) to authenticated;

create or replace function public.auth_base_role()
returns text language sql stable security definer set search_path = public as $$
  select case
    when right(role::text, 5) = '_view' then left(role::text, length(role::text) - 5)
    else role::text
  end
  from public.profiles where id = auth.uid();
$$;

create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() = 'sales' and c.type in ('customer','both'))
      )
    )
  end;
$$;

drop policy if exists profiles_select_assign on public.profiles;
create policy profiles_select_assign on public.profiles for select to authenticated
  using (public.auth_base_role() in ('admin','purchasing','viewer'));

drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer'));

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_base_role() = 'operations' and public.can_access_ship(contract_id))
  );

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_base_role() in ('admin','sales','maliyet','viewer'));

drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or public.auth_base_role() = 'viewer'
    or (public.auth_base_role() = 'purchasing' and module = 'purchasing')
    or (public.auth_base_role() = 'sales' and module = 'sales')
  );

drop view if exists public.payment_schedule;
create view public.payment_schedule
with (security_invoker = off) as
  select
    pc.id, pc.contract_no, pc.vessel, pc.payment_due_date, pc.eta, pc.status,
    pc.quantity, pc.price, pc.currency, pc.usd_try, pc.eur_try,
    co.name as supplier_name, pr.name as product_name
  from public.purchase_contracts pc
  left join public.companies co on co.id = pc.supplier_id
  left join public.products  pr on pr.id = pc.product_id
  where public.auth_base_role() in ('admin', 'finans', 'viewer')
    and pc.payment_due_date is not null
    and pc.status <> 'cancelled';
grant select on public.payment_schedule to authenticated;

create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_base_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet', 'viewer')
    and c.status <> 'cancelled';
grant select on public.sellable_contracts to authenticated;


-- ============================================================
-- KURULUM TAMAMLANDI
-- Admin: taha.ozkilinc@sunaryatirim.com.tr / Sunar19*
-- (Admin kullanıcısı oluşturulamazsa yukarıdaki NOTICE mesajını okuyun.)
-- ============================================================
