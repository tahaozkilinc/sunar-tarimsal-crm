-- =============================================================================
-- Sunar Tarımsal CRM - Satış Operasyon: sevkiyat takibi (2/2)
-- Sıra: 43 -> 0042'den (enum) SONRA çalıştırın. (Idempotent.)
--
-- AMAÇ: Operasyon tarafında olduğu gibi (sözleşme ≠ fiili boşaltma), satış
-- tarafında da satış kaydı (sales_orders, TİCARİ/kâğıt üzerinde) ile fiili
-- araç çıkışı (stock_movements 'outbound_sale', FİZİKİ) ayrılır. Depo stoğu
-- (inventory view) artık satış kaydı oluşturulduğu AN değil, araç fiilen
-- çıktığında düşer — kullanıcının talebi tam olarak budur.
--
-- Akış: depodan çıkış (warehouse_id dolu, contract_id BOŞ — hangi orijinal
-- alım partisinden geldiği depo stoğunu etkilemez) VEYA gemiden doğrudan
-- çıkış (warehouse_id BOŞ, contract_id dolu — hangi gemiden). İkisi de
-- sales_orders.id'ye (sale_id) bağlanır.
-- =============================================================================

-- 1) stock_movements: hangi satışa ait olduğu
alter table public.stock_movements
  add column if not exists sale_id uuid references public.sales_orders(id) on delete set null;
create index if not exists idx_sm_sale on public.stock_movements(sale_id);

-- ---------------------------------------------------------------------------
-- 2) inventory view YENİDEN TANIMLANIR: satılan tonaj artık sales_orders'tan
--    DEĞİL, fiili 'outbound_sale' hareketlerinden hesaplanır.
--      Giriş  : inbound / origin_in / adjustment
--      Çıkış  : transfer / to_factory / outbound_sale
-- ---------------------------------------------------------------------------
create or replace view public.inventory
with (security_invoker = on) as
with mv as (
  select
    product_id,
    warehouse_id,
    sum(case
      when movement_type in ('inbound','origin_in','adjustment') then quantity
      else 0
    end) as received,
    sum(case
      when movement_type in ('transfer','to_factory','outbound_sale') then quantity
      else 0
    end) as relocated_out
  from public.stock_movements
  where warehouse_id is not null
  group by product_id, warehouse_id
)
select
  w.id    as warehouse_id,
  w.name  as warehouse_name,
  w.type  as location_type,
  pr.id   as product_id,
  pr.name as product_name,
  coalesce(mv.received, 0)                                as received_qty,
  coalesce(mv.relocated_out, 0)                            as sold_qty,
  coalesce(mv.received, 0) - coalesce(mv.relocated_out, 0) as available_qty
from public.warehouses w
join public.products pr on true
left join mv on mv.warehouse_id = w.id and mv.product_id = pr.id
where coalesce(mv.received, 0) <> 0 or coalesce(mv.relocated_out, 0) <> 0;

-- ---------------------------------------------------------------------------
-- 3) Geçiş: mevcut (depo bağlı) satışlar için karşılık gelen sevkiyat kaydı
--    yoksa oluştur — aksi halde bu migration sonrası mevcut satışlar depo
--    stoğunu artık etkilemez hale gelir ve mevcut tonaj rakamları aniden
--    değişir. (Idempotent: sale_id başına en fazla bir kez çalışır.)
-- ---------------------------------------------------------------------------
insert into public.stock_movements
  (contract_id, product_id, warehouse_id, movement_type, quantity, unit,
   movement_date, sale_id, notes, created_by)
select
  null, so.product_id, so.warehouse_id, 'outbound_sale', so.quantity, so.unit,
  coalesce(so.delivery_date, current_date), so.id,
  'Geçmiş satıştan otomatik oluşturuldu (0043 geçişi)', so.created_by
from public.sales_orders so
where so.status <> 'cancelled'
  and so.warehouse_id is not null
  and so.quantity > 0
  and so.quantity <= 100000
  and not exists (select 1 from public.stock_movements sm where sm.sale_id = so.id);

-- ---------------------------------------------------------------------------
-- 4) fn_sm_guard genişletilir: outbound_sale dengeyi de etkiler; sales_ops
--    yalnızca outbound_sale girebilir ve yalnızca kendi kaydını değiştirir/siler.
-- ---------------------------------------------------------------------------
create or replace function public.fn_sm_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row public.stock_movements;
  v_status text;
  v_balance numeric;
  v_base text := public.auth_base_role();
  v_ext boolean := v_base in ('nakliyeci','gozetim','acente');
begin
  v_row := coalesce(new, old);

  if v_row.contract_id is not null then
    select status into v_status from public.purchase_contracts where id = v_row.contract_id;
    if v_status = 'cancelled' and tg_op in ('INSERT','UPDATE') then
      raise exception 'İptal edilmiş bağlantıya stok hareketi girilemez';
    end if;
    if v_status = 'completed' and not public.is_admin() then
      raise exception 'Tamamlanmış gemide hareket ekleme/değiştirme/silme yalnızca yönetici yetkisidir';
    end if;
  end if;

  -- Dış roller: yalnız kendi kaydı. sales_ops: iç rol ama aynı disiplin —
  -- bir sevkiyat memuru başka bir memurun girdiği aracı değiştiremez/silemez.
  if (v_ext or v_base = 'sales_ops') and tg_op in ('UPDATE','DELETE') then
    if old.created_by is distinct from auth.uid() then
      raise exception 'Yalnızca kendi girdiğiniz kaydı değiştirebilir/silebilirsiniz';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    if v_ext then
      if v_base in ('nakliyeci','gozetim') and new.movement_type <> 'inbound' then
        raise exception 'Bu rol yalnızca araç boşaltma (Giriş) kaydı girebilir';
      end if;
      if v_base = 'acente' and new.movement_type not in ('origin_in','transfer') then
        raise exception 'Acente yalnızca yurtdışı depo girişi ve gemiye yükleme kaydı girebilir';
      end if;
      if new.movement_type in ('inbound','origin_in') and new.quantity > 100 then
        raise exception 'Tek kayıtta en fazla 100 ton girilebilir (araç/vagon başına kayıt girin)';
      end if;
    end if;

    if v_base = 'sales_ops' and new.movement_type <> 'outbound_sale' then
      raise exception 'Bu rol yalnızca satış çıkış (araç) kaydı girebilir';
    end if;

    if tg_op = 'INSERT' or new.movement_date is distinct from old.movement_date then
      if new.movement_date > current_date + 1 then
        raise exception 'Hareket tarihi gelecekte olamaz';
      end if;
      if (v_ext or v_base = 'sales_ops') and new.movement_date < current_date - 7 then
        raise exception 'Bu rol en fazla 7 gün geriye kayıt girebilir';
      end if;
      if not v_ext and v_base <> 'sales_ops' and new.movement_date < current_date - 365 then
        raise exception 'Hareket tarihi 1 yıldan eski olamaz';
      end if;
    end if;

    if new.movement_type in ('transfer','to_factory','outbound_sale') and new.warehouse_id is not null then
      select coalesce(sum(case
          when movement_type in ('inbound','origin_in','adjustment') then quantity
          when movement_type in ('transfer','to_factory','outbound_sale') then -quantity
          else 0 end), 0)
        into v_balance
      from public.stock_movements
      where warehouse_id = new.warehouse_id
        and product_id is not distinct from new.product_id
        and (tg_op = 'INSERT' or id <> new.id);
      if new.quantity > v_balance + 0.001 then
        raise exception 'Depoda yeterli stok yok: mevcut % ton, çıkış % ton olamaz',
          round(v_balance, 3), round(new.quantity, 3);
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.fn_sm_guard() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 5) Satış tamamen sevk edilince otomatik 'delivered' (mark_contract_arrived
--    ile aynı desen — yalnızca ileri yönde, geri almaz).
-- ---------------------------------------------------------------------------
create or replace function public.fn_mark_sale_delivered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_qty numeric;
  v_dispatched numeric;
begin
  if new.movement_type = 'outbound_sale' and new.sale_id is not null then
    select quantity into v_qty from public.sales_orders where id = new.sale_id;
    select coalesce(sum(quantity), 0) into v_dispatched
      from public.stock_movements where sale_id = new.sale_id and movement_type = 'outbound_sale';
    if v_qty is not null and v_dispatched >= v_qty - 0.001 then
      update public.sales_orders
         set status = 'delivered'
       where id = new.sale_id and status in ('draft','confirmed');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fn_mark_sale_delivered() from anon, authenticated, public;

drop trigger if exists trg_mark_sale_delivered on public.stock_movements;
create trigger trg_mark_sale_delivered
  after insert on public.stock_movements
  for each row execute function public.fn_mark_sale_delivered();

-- ---------------------------------------------------------------------------
-- 6) Sevkiyatı olan satış yalnızca admin tarafından silinebilir
--    (fn_pc_delete_guard ile aynı desen, satış tarafı).
-- ---------------------------------------------------------------------------
create or replace function public.fn_so_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin()
     and exists (select 1 from public.stock_movements where sale_id = old.id) then
    raise exception 'Bu satışa bağlı sevkiyat kaydı var; silme yalnızca yönetici yetkisidir';
  end if;
  return old;
end $$;
revoke execute on function public.fn_so_delete_guard() from anon, authenticated, public;

drop trigger if exists trg_so_delete_guard on public.sales_orders;
create trigger trg_so_delete_guard
  before delete on public.sales_orders
  for each row execute function public.fn_so_delete_guard();

-- ---------------------------------------------------------------------------
-- 7) RLS: stock_movements okuma/yazma + movement_photos + firma görünürlüğü
-- ---------------------------------------------------------------------------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer','sales_ops')
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
    or (public.auth_role() in ('sales','sales_ops') and movement_type = 'outbound_sale')
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'operations' and contract_id is null)
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
    or (public.auth_role() = 'acente'     and public.is_my_agent_ship(contract_id))
    or (public.auth_role() in ('sales','sales_ops') and movement_type = 'outbound_sale')
  );

-- movement_photos: sales_ops de kendi sevkiyat kaydına irsaliye/foto ekleyebilsin
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
        or (public.auth_role() in ('sales','sales_ops') and m.movement_type = 'outbound_sale')
      )
  );
$$;

-- Firma görünürlüğü: sales_ops müşteri adını okuyabilsin (fiyatı değil)
create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales','finans')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() in ('sales','sales_ops','finans') and c.type in ('customer','both')) or
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier'))
      )
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 8) dispatch_sales: sales_ops'un göreceği FİYATSIZ satış görünümü
--    (sellable_contracts ile aynı desen — auth_role() filtresi görünümde).
-- ---------------------------------------------------------------------------
create or replace view public.dispatch_sales
with (security_invoker = off) as
  select so.id, so.order_no, so.customer_id, so.contract_id, so.product_id,
         so.warehouse_id, so.quantity, so.unit, so.delivery_date, so.status
  from public.sales_orders so
  where public.auth_base_role() in ('admin','sales','sales_ops','maliyet')
    and so.status not in ('cancelled');

grant select on public.dispatch_sales to authenticated;
