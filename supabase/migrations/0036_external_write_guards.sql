-- =============================================================================
-- Sunar Tarımsal CRM - DIŞ ROL yazma korumaları (nakliyeci / gozetim / acente)
-- Sıra: 36 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Dış firmalara sistem açılırken yanlış/kasıtlı bozuk veri girişine karşı,
-- 0035'teki genel korumaların üstüne DIŞ ROLLERE ÖZEL kurallar:
--
-- 1) Hareket TİPİ kilidi: nakliyeci/gozetim yalnızca 'inbound' (araç boşaltma);
--    acente yalnızca 'origin_in' / 'transfer' (yurtdışı depo akışı). Başka tip
--    (ör. adjustment ile stok oynamak) dış rolden gelemez.
-- 2) Kayıt başına tonaj tavanı: dış rol girişlerinde (inbound/origin_in)
--    kayıt başına 100 ton (kamyon ~40t, vagon ~65-70t; 100 güvenli tavan).
--    5.000 ton gibi "yanlışlıkla toplam girme" hatası kapıda reddedilir.
-- 3) Tarih penceresi (yalnız INSERT'te ve UPDATE'te tarih DEĞİŞİYORSA):
--    dış rol [bugün-7, yarın]; iç roller [bugün-365, yarın]. 2062 gibi
--    klavye hataları ve geleceğe veri girme kapanır.
-- 4) Sahiplik: dış rol yalnızca KENDİ oluşturduğu hareketi günceller/siler;
--    operasyonun veya başka firmanın kaydına dokunamaz. Fotoğraflarda da aynı.
-- =============================================================================

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

  -- Gemi durumu kilidi (0035)
  if v_row.contract_id is not null then
    select status into v_status from public.purchase_contracts where id = v_row.contract_id;
    if v_status = 'cancelled' and tg_op in ('INSERT','UPDATE') then
      raise exception 'İptal edilmiş bağlantıya stok hareketi girilemez';
    end if;
    if v_status = 'completed' and not public.is_admin() then
      raise exception 'Tamamlanmış gemide hareket ekleme/değiştirme/silme yalnızca yönetici yetkisidir';
    end if;
  end if;

  -- 4) Sahiplik: dış rol yalnız kendi kaydını değiştirir/siler
  if v_ext and tg_op in ('UPDATE','DELETE') then
    if old.created_by is distinct from auth.uid() then
      raise exception 'Yalnızca kendi girdiğiniz kaydı değiştirebilir/silebilirsiniz';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    -- 1) Dış rol hareket tipi kilidi
    if v_ext then
      if v_base in ('nakliyeci','gozetim') and new.movement_type <> 'inbound' then
        raise exception 'Bu rol yalnızca araç boşaltma (Giriş) kaydı girebilir';
      end if;
      if v_base = 'acente' and new.movement_type not in ('origin_in','transfer') then
        raise exception 'Acente yalnızca yurtdışı depo girişi ve gemiye yükleme kaydı girebilir';
      end if;
      -- 2) Kayıt başına tavan (girişlerde)
      if new.movement_type in ('inbound','origin_in') and new.quantity > 100 then
        raise exception 'Tek kayıtta en fazla 100 ton girilebilir (araç/vagon başına kayıt girin)';
      end if;
    end if;

    -- 3) Tarih penceresi (INSERT veya tarih değişen UPDATE)
    if tg_op = 'INSERT' or new.movement_date is distinct from old.movement_date then
      if new.movement_date > current_date + 1 then
        raise exception 'Hareket tarihi gelecekte olamaz';
      end if;
      if v_ext and new.movement_date < current_date - 7 then
        raise exception 'Dış kullanıcılar en fazla 7 gün geriye kayıt girebilir';
      end if;
      if not v_ext and new.movement_date < current_date - 365 then
        raise exception 'Hareket tarihi 1 yıldan eski olamaz';
      end if;
    end if;

    -- Depodan çıkış bakiyeyi aşamaz (0035)
    if new.movement_type in ('transfer','to_factory') and new.warehouse_id is not null then
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
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.fn_sm_guard() from anon, authenticated, public;

-- 4b) Fotoğraf silme: dış rol yalnız kendi yüklediğini siler
drop policy if exists mp_delete on public.movement_photos;
create policy mp_delete on public.movement_photos for delete to authenticated
  using (
    public.can_write_movement(movement_id)
    and (
      public.auth_base_role() in ('admin','operations')
      or created_by = auth.uid()
    )
  );
