-- =============================================================================
-- Sunar Tarımsal CRM - Kendi profilini güncelleme + rol başına salt-okunur roller
-- Sıra: 15 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) update_my_profile(): kullanıcı SADECE kendi adını değiştirir (rolünü değil).
--    Şifre değişimi Supabase Auth ile yapılır, DB politikası gerektirmez.
-- 2) Rol başına "_view" salt-okunur roller: purchasing_view, operations_view,
--    sales_view. Bunlar taban rolüyle (purchasing/operations/sales) AYNI veriyi
--    OKUR ama hiçbir write politikasına dahil edilmez -> RLS yazmayı reddeder.
--    auth_base_role(), "_view" ekini sökerek SELECT politikalarının tek noktadan
--    bu rolleri de kapsamasını sağlar (her politikayı elle çoğaltmaya gerek yok).
--    finans ve maliyet zaten salt-okunurdur (write politikaları yok), bu yüzden
--    onlar için ayrı "_view" rolü gerekmez. Tümünü görmek için global "viewer".
--
-- NOT: "ALTER TYPE ... ADD VALUE cannot run inside a transaction" hatası alırsan,
--      ilk üç "alter type" satırını TEK TEK çalıştır, sonra kalanını çalıştır.
-- =============================================================================

alter type public.user_role add value if not exists 'purchasing_view';
alter type public.user_role add value if not exists 'operations_view';
alter type public.user_role add value if not exists 'sales_view';

-- Kendi adını güncelleme (rol/yetki değiştirilemez).
create or replace function public.update_my_profile(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'İsim boş olamaz';
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = auth.uid();
end $$;
grant execute on function public.update_my_profile(text) to authenticated;

-- "_view" rolünü taban rolüne indirger (örn. purchasing_view -> purchasing).
-- Diğer roller olduğu gibi döner. SELECT politikaları bunu kullanır.
create or replace function public.auth_base_role()
returns text language sql stable security definer set search_path = public as $$
  select case
    when right(role::text, 5) = '_view' then left(role::text, length(role::text) - 5)
    else role::text
  end
  from public.profiles where id = auth.uid();
$$;

-- Firma görünürlüğü: taban role göre (purchasing_view, purchasing gibi davranır).
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

-- SELECT politikaları: auth_base_role() ile "_view" rolleri taban rolüyle aynı okur.
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

-- Tanımlı görünümler de taban role göre (finans_view yok ama tutarlılık için).
create or replace view public.payment_schedule
with (security_invoker = off) as
  select id, contract_no, payment_due_date, eta, status
  from public.purchase_contracts
  where public.auth_base_role() in ('admin', 'finans', 'viewer')
    and payment_due_date is not null
    and status <> 'cancelled';
grant select on public.payment_schedule to authenticated;

create or replace view public.sellable_contracts
with (security_invoker = off) as
  select c.id, c.contract_no, c.vessel, c.product_id, c.quantity, c.unit,
         c.eta, c.status, c.principal_id, c.origin_country
  from public.purchase_contracts c
  where public.auth_base_role() in ('admin', 'sales', 'purchasing', 'operations', 'maliyet', 'viewer')
    and c.status <> 'cancelled';
grant select on public.sellable_contracts to authenticated;
