-- =============================================================================
-- Sunar Tarımsal CRM - "Sevkiyat Depoları" beyaz listesi kaldırıldı
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: satışçının sevkiyat depolarını önceden seçmesine gerek
-- yok — operasyoncu zaten hangi depodan yükleyeceğini biliyor. sale_warehouses
-- tablosu (0046) ve fn_sm_guard()'daki bunu zorunlu kılan kontrol kaldırıldı;
-- "Depodan" çıkışı artık HERHANGİ bir aktif yurtiçi depodan yapılabilir
-- (mevcut stok kontrolü — v_balance kontrolü — aynen geçerli, o ayrı bir kural).
-- Tablo boş olduğundan (kontrol edildi) veri kaybı yok.
-- =============================================================================

create or replace function public.fn_sm_guard()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
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
end $function$;

drop table if exists public.sale_warehouses;
