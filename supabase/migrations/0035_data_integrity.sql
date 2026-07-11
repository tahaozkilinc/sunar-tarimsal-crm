-- =============================================================================
-- Sunar Tarımsal CRM - Veri bütünlüğü sertleştirmesi (sabotaj + kullanıcı hatası)
-- Sıra: 35 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- İlke: UI kontrolleri atlatılabilir (API'ye doğrudan istek = sabotaj yolu);
-- bu kurallar VERİTABANINDA yaşar, hiçbir istemci atlayamaz.
--
-- 1) CHECK kısıtları: saçma sayılar (0/negatif miktar, negatif fiyat, imkânsız
--    kur, ters laycan) hiçbir yoldan yazılamaz.
-- 2) UNIQUE: sözleşme no / satış no (büyük-küçük harf duyarsız) tekrarlanamaz.
-- 3) Stok koruması: depodan ÇIKIŞ (transfer/fabrikaya) mevcut bakiyeyi aşamaz.
-- 4) Fazla satış koruması: bir bağlantıya bağlı satışların toplamı bağlantı
--    tonajını aşamaz (UI'daki kota kuralının DB'deki karşılığı).
-- 5) Akış kilitleri: iptal gemiye hareket girilemez; tamamlanmış gemiye
--    hareket ekleme/silme yalnızca admin; bağlı kaydı olan bağlantıyı yalnızca
--    admin silebilir; ÖDENMİŞ kayıtları admin dışında kimse değiştiremez/silemez.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) CHECK kısıtları (mevcut veri doğrulandı: ihlal yok)
-- ---------------------------------------------------------------------------
alter table public.purchase_contracts drop constraint if exists ck_pc_qty_pos;
alter table public.purchase_contracts add constraint ck_pc_qty_pos check (quantity > 0);
alter table public.purchase_contracts drop constraint if exists ck_pc_price;
alter table public.purchase_contracts add constraint ck_pc_price check (price is null or price >= 0);
alter table public.purchase_contracts drop constraint if exists ck_pc_laycan;
alter table public.purchase_contracts add constraint ck_pc_laycan
  check (laycan_start is null or laycan_end is null or laycan_end >= laycan_start);
alter table public.purchase_contracts drop constraint if exists ck_pc_fx;
alter table public.purchase_contracts add constraint ck_pc_fx check (
  (usd_try is null or (usd_try > 0 and usd_try < 1000)) and
  (eur_try is null or (eur_try > 0 and eur_try < 1000))
);

alter table public.sales_orders drop constraint if exists ck_so_qty_pos;
alter table public.sales_orders add constraint ck_so_qty_pos check (quantity > 0);
alter table public.sales_orders drop constraint if exists ck_so_price;
alter table public.sales_orders add constraint ck_so_price check (price is null or price >= 0);
alter table public.sales_orders drop constraint if exists ck_so_fx;
alter table public.sales_orders add constraint ck_so_fx check (
  (usd_try is null or (usd_try > 0 and usd_try < 1000)) and
  (eur_try is null or (eur_try > 0 and eur_try < 1000))
);

-- Hareket: düzeltme İMZALI (+/−) olabilir ama sıfır olamaz; diğer tipler > 0.
-- Tek harekette 100.000 tonu aşan giriş parmak hatasıdır.
alter table public.stock_movements drop constraint if exists ck_sm_qty;
alter table public.stock_movements add constraint ck_sm_qty check (
  quantity <> 0
  and abs(quantity) <= 100000
  and (movement_type = 'adjustment' or quantity > 0)
);

alter table public.warehouse_expenses drop constraint if exists ck_we_fx;
alter table public.warehouse_expenses add constraint ck_we_fx check (
  (usd_try is null or (usd_try > 0 and usd_try < 1000)) and
  (eur_try is null or (eur_try > 0 and eur_try < 1000))
);

-- ---------------------------------------------------------------------------
-- 2) Teklik: sözleşme/satış numarası (case-insensitive; boşlar hariç)
-- ---------------------------------------------------------------------------
create unique index if not exists uq_pc_contract_no
  on public.purchase_contracts (lower(contract_no)) where contract_no is not null;
create unique index if not exists uq_so_order_no
  on public.sales_orders (lower(order_no)) where order_no is not null;

-- ---------------------------------------------------------------------------
-- 3+5a) Stok hareketi koruması (tek trigger):
--   - iptal gemiye hareket yazılamaz; tamamlanmış gemide ekleme/değiştirme/silme
--     yalnızca admin
--   - transfer / to_factory, depo+ürün bakiyesini aşamaz
-- SECURITY DEFINER: bakiye, RLS'ten bağımsız TÜM hareketlerle hesaplanmalı
-- (ör. nakliyeci yalnızca kendi gemisini görür ama bakiye herkesinkiyle oluşur).
-- ---------------------------------------------------------------------------
create or replace function public.fn_sm_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row public.stock_movements;
  v_status text;
  v_balance numeric;
begin
  v_row := coalesce(new, old);

  -- Gemi durumu kilidi
  if v_row.contract_id is not null then
    select status into v_status from public.purchase_contracts where id = v_row.contract_id;
    if v_status = 'cancelled' and tg_op in ('INSERT','UPDATE') then
      raise exception 'İptal edilmiş bağlantıya stok hareketi girilemez';
    end if;
    if v_status = 'completed' and not public.is_admin() then
      raise exception 'Tamamlanmış gemide hareket ekleme/değiştirme/silme yalnızca yönetici yetkisidir';
    end if;
  end if;

  -- Depodan çıkış bakiyeyi aşamaz (yalnızca INSERT/UPDATE + çıkış tipleri)
  if tg_op in ('INSERT','UPDATE') and new.movement_type in ('transfer','to_factory')
     and new.warehouse_id is not null then
    select coalesce(sum(case
        when movement_type in ('inbound','origin_in','adjustment') then quantity
        when movement_type in ('transfer','to_factory') then -quantity
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

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.fn_sm_guard() from anon, authenticated, public;

drop trigger if exists trg_sm_guard on public.stock_movements;
create trigger trg_sm_guard
  before insert or update or delete on public.stock_movements
  for each row execute function public.fn_sm_guard();

-- ---------------------------------------------------------------------------
-- 4) Fazla satış koruması: bağlantı tonajı DB'de de aşılamaz
-- ---------------------------------------------------------------------------
create or replace function public.fn_so_oversell_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap numeric;
  v_sold numeric;
begin
  if new.contract_id is null or new.status = 'cancelled' then
    return new;
  end if;
  select quantity into v_cap from public.purchase_contracts where id = new.contract_id;
  if v_cap is null then return new; end if;
  select coalesce(sum(quantity), 0) into v_sold
  from public.sales_orders
  where contract_id = new.contract_id
    and status <> 'cancelled'
    and (tg_op = 'INSERT' or id <> new.id);
  if v_sold + new.quantity > v_cap + 0.001 then
    raise exception 'Bağlantı tonajı aşılıyor: bağlantı % ton, satılmış % ton, kalan % ton',
      round(v_cap, 3), round(v_sold, 3), round(greatest(v_cap - v_sold, 0), 3);
  end if;
  return new;
end $$;
revoke execute on function public.fn_so_oversell_guard() from anon, authenticated, public;

drop trigger if exists trg_so_oversell on public.sales_orders;
create trigger trg_so_oversell
  before insert or update on public.sales_orders
  for each row execute function public.fn_so_oversell_guard();

-- ---------------------------------------------------------------------------
-- 5b) Bağlı kaydı olan bağlantıyı yalnızca admin silebilir
-- ---------------------------------------------------------------------------
create or replace function public.fn_pc_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (
       exists (select 1 from public.sales_orders where contract_id = old.id)
    or exists (select 1 from public.stock_movements where contract_id = old.id)
  ) then
    raise exception 'Bu bağlantıya bağlı satış/stok hareketi var; silme yalnızca yönetici yetkisidir';
  end if;
  return old;
end $$;
revoke execute on function public.fn_pc_delete_guard() from anon, authenticated, public;

drop trigger if exists trg_pc_delete_guard on public.purchase_contracts;
create trigger trg_pc_delete_guard
  before delete on public.purchase_contracts
  for each row execute function public.fn_pc_delete_guard();

-- ---------------------------------------------------------------------------
-- 5d) DÜZELTME — "Gemiyi Bitir" operasyonda sessizce başarısızdı:
--     pc_write yalnız admin+purchasing olduğundan operasyonun
--     update({status:'completed'}) çağrısı RLS'te 0 satır güncelliyordu
--     (UI tamamlandı gösterip yenilemede geri dönüyordu). Statü geçişi artık
--     yetki kontrollü DEFINER RPC ile yapılır (assign_ship_parties deseni).
--     Kombine gemi için birden çok bağlantıyı tek çağrıda tamamlar.
-- ---------------------------------------------------------------------------
create or replace function public.complete_ships(p_contract_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_contract_ids is null or array_length(p_contract_ids, 1) is null then
    raise exception 'Gemi belirtilmedi';
  end if;
  foreach v_id in array p_contract_ids loop
    if not (
      public.is_admin()
      or (public.auth_role() = 'operations' and public.can_access_ship(v_id))
    ) then
      raise exception 'Bu işlem için yetkiniz yok';
    end if;
    update public.purchase_contracts
       set status = 'completed'
     where id = v_id and status <> 'cancelled';
  end loop;
end $$;
grant execute on function public.complete_ships(uuid[]) to authenticated;
revoke execute on function public.complete_ships(uuid[]) from anon, public;

-- ---------------------------------------------------------------------------
-- 5c) ÖDENMİŞ kayıt kilidi: admin dışında değiştirilemez/silinemez.
--     (set_contract_paid / set_sale_paid SECURITY DEFINER olduğundan finansın
--      ödeme işaretleme akışı etkilenmez.)
-- ---------------------------------------------------------------------------
drop policy if exists pc_write on public.purchase_contracts;
create policy pc_write on public.purchase_contracts for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'purchasing' and not coalesce(is_paid, false))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'purchasing' and not coalesce(is_paid, false))
  );

drop policy if exists so_write on public.sales_orders;
create policy so_write on public.sales_orders for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'sales' and not coalesce(is_paid, false))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'sales' and not coalesce(is_paid, false))
  );
