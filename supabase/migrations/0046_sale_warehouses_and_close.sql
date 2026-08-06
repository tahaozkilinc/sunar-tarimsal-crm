-- =============================================================================
-- Sunar Tarımsal CRM - Satışta çoklu depo + sevkiyat kapatma + bağlantı zorunlu
-- Sıra: 46 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) sales_orders.contract_id ZORUNLU: müşteri gibi (0045), bağlantısız satış
--    olmamalı. sales_orders'ta 1 gerçek satır var, hepsinde contract_id dolu
--    (doğrulandı) — geriye dönük sorun yok.
--
-- 2) Çoklu depo: tek warehouse_id yerine sale_warehouses (sale_id×warehouse_id)
--    junction tablosu — bir satış birden fazla depodan sevk edilebilir.
--    Mevcut tek warehouse_id değeri, kolonu düşürmeden önce buraya taşınır.
--
-- 3) Sevkiyatçı KİLİDİ: 'outbound_sale' hareketinde warehouse_id doluysa
--    (yani "Depodan" modu), o depo mutlaka sale_warehouses'ta olmalı — aksi
--    halde reddedilir. ("Gemiden Direkt" modu warehouse_id kullanmadığından
--    bu kısıttan etkilenmez, kendi contract_id kontrolüyle zaten korunuyor.)
--
-- 4) Sevkiyatı Bitir: operasyoncu (sales_ops/sales/admin) close_sale_dispatch
--    RPC'siyle satışı kapatır — tonaj tam eşleşmese bile. Kapatılan satışa
--    yeni sevkiyat girilemez (admin hariç); eksik/fazla tonaj sorgulanabilir
--    (quantity vs. sevk edilen toplam) — UI hem satış tarafında hem operasyon
--    ekranında bunu gösterir.
-- =============================================================================

-- 1) Bağlantı zorunlu
alter table public.sales_orders
  alter column contract_id set not null;

-- Kapatma bilgisi
alter table public.sales_orders
  add column if not exists dispatch_closed_at timestamptz,
  add column if not exists dispatch_closed_by uuid references public.profiles(id) on delete set null;

-- 2) Çoklu depo junction tablosu
create table if not exists public.sale_warehouses (
  sale_id      uuid not null references public.sales_orders(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (sale_id, warehouse_id)
);

alter table public.sale_warehouses enable row level security;

-- Okuma: satışı görebilen herkes (fiyat içermez, sales_ops için de güvenli).
drop policy if exists sw_select on public.sale_warehouses;
create policy sw_select on public.sale_warehouses for select to authenticated
  using (
    public.auth_base_role() in ('admin','sales','maliyet','viewer','sales_ops')
  );

-- Yazma: yalnızca satışı yönetenler (sales_ops depo LİSTESİNİ değiştiremez,
-- yalnızca listedeki depolardan sevkiyat YAPAR — ayrı yetkiler).
drop policy if exists sw_write on public.sale_warehouses;
create policy sw_write on public.sale_warehouses for all to authenticated
  using  (public.auth_role() in ('admin','sales'))
  with check (public.auth_role() in ('admin','sales'));

-- Mevcut tek warehouse_id değerini taşı (kolon düşürülmeden önce).
insert into public.sale_warehouses (sale_id, warehouse_id)
select id, warehouse_id from public.sales_orders
where warehouse_id is not null
on conflict do nothing;

-- dispatch_sales görünümünü warehouse_id'siz yeniden tanımla. CREATE OR REPLACE
-- VIEW mevcut sütun listesini DEĞİŞTİREMEZ (yalnızca sona ekleyebilir); bir
-- sütunu kaldırmak için önce DROP etmek gerekir.
drop view if exists public.dispatch_sales;
create view public.dispatch_sales
with (security_invoker = off) as
  select so.id, so.order_no, so.customer_id, so.contract_id, so.product_id,
         so.quantity, so.unit, so.delivery_date, so.status,
         so.dispatch_closed_at
  from public.sales_orders so
  where public.auth_base_role() in ('admin','sales','sales_ops','maliyet')
    and so.status not in ('cancelled');

grant select on public.dispatch_sales to authenticated;

alter table public.sales_orders drop column if exists warehouse_id;

-- 3+4) fn_sm_guard: depo beyaz listesi + kapatılmış satış kilidi
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

  -- Kapatılmış satışa dokunulamaz (admin hariç) — ekleme/değiştirme/silme.
  if v_row.sale_id is not null and not public.is_admin() then
    if exists (
      select 1 from public.sales_orders so
      where so.id = v_row.sale_id and so.dispatch_closed_at is not null
    ) then
      raise exception 'Bu satışın sevkiyatı kapatılmış; yeni kayıt/değişiklik yalnızca yönetici yapabilir';
    end if;
  end if;

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

    -- Satış çıkışı "Depodan" modundaysa (warehouse_id dolu), o depo
    -- mutlaka satış için seçilen depolar arasında olmalı.
    if new.movement_type = 'outbound_sale' and new.sale_id is not null and new.warehouse_id is not null then
      if not exists (
        select 1 from public.sale_warehouses sw
        where sw.sale_id = new.sale_id and sw.warehouse_id = new.warehouse_id
      ) then
        raise exception 'Bu depo, bu satış için seçilen depolar arasında değil';
      end if;
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

-- Sevkiyatı Bitir: tonaj tam eşleşmese de satışı kapatır.
create or replace function public.close_sale_dispatch(p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_base_role() not in ('admin','sales','sales_ops') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  if not exists (select 1 from public.sales_orders where id = p_sale_id) then
    raise exception 'Satış bulunamadı';
  end if;

  update public.sales_orders
  set dispatch_closed_at = now(),
      dispatch_closed_by = auth.uid(),
      status = case when status in ('draft','confirmed') then 'delivered' else status end
  where id = p_sale_id
    and dispatch_closed_at is null;
end $$;
grant execute on function public.close_sale_dispatch(uuid) to authenticated;
revoke execute on function public.close_sale_dispatch(uuid) from anon, public;
