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
