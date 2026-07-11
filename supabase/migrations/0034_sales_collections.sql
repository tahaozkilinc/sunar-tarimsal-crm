-- =============================================================================
-- Sunar Tarımsal CRM - Satış tahsilat takibi + satış görünürlük düzeltmeleri
-- Sıra: 34 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) sales_orders: is_paid / payment_ref / paid_at — alış tarafındaki ödeme
--    onayının (0017) satış tarafındaki simetriği. Tahsilatlar finans ekranından
--    set_sale_paid RPC'siyle işaretlenir (referans zorunlu).
-- 2) so_select DÜZELTME: politika ham auth_role() kullanıyordu; bu yüzden
--    sales_view (salt-okunur satış) satışları HİÇ göremiyordu. auth_base_role'e
--    çevrildi ve tahsilat için 'finans' eklendi.
-- 3) can_see_company DÜZELTME: finans müşteri adlarını göremiyordu; tahsilat
--    ekranı için finans'a customer/both okuma eklendi (tedarikçi görünürlüğü
--    değişmedi; o payment_schedule definer view'ı ile sınırlı kalır).
-- =============================================================================

alter table public.sales_orders
  add column if not exists is_paid     boolean not null default false,
  add column if not exists payment_ref text,
  add column if not exists paid_at     timestamptz;

-- 2) Satış okuma: _view düzeltmesi + finans
drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated
  using (public.auth_base_role() in ('admin','sales','maliyet','viewer','finans'));

-- 3) Firma görünürlüğü: finans müşterileri (tahsilat) okur
create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales','finans')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() = 'sales' and c.type in ('customer','both')) or
        (public.auth_base_role() = 'finans' and c.type in ('customer','both')) or
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier'))
      )
    )
  end;
$$;

-- 1) Tahsilat işaretleme RPC'si (0017 set_contract_paid deseni)
create or replace function public.set_sale_paid(
  p_sale_id     uuid,
  p_paid        boolean,
  p_payment_ref text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_base_role() not in ('admin', 'finans') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  if p_paid and (p_payment_ref is null or length(btrim(p_payment_ref)) = 0) then
    raise exception 'Tahsilat referansı girmeden ödendi işaretlenemez';
  end if;

  update public.sales_orders
  set is_paid     = p_paid,
      payment_ref = case when p_paid then btrim(p_payment_ref) else payment_ref end,
      paid_at     = case when p_paid then now() else null end
  where id = p_sale_id;

  if not found then
    raise exception 'Satış bulunamadı';
  end if;
end $$;

grant execute on function public.set_sale_paid(uuid, boolean, text) to authenticated;
revoke execute on function public.set_sale_paid(uuid, boolean, text) from anon, public;
