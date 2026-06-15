-- =============================================================================
-- Sunar Tarımsal CRM - Gemi bazlı operasyon ataması + şoför bilgisi + maliyet RLS düzeltmesi
-- Sıra: 12 -> önceki migration'lardan SONRA, Supabase SQL Editor'de çalıştırın.
-- (Idempotent'tir; tekrar çalıştırmak güvenlidir.)
--
-- 1) purchase_contracts.assigned_to: gemiye atanan operasyon kullanıcısı.
--    Bir kullanıcıya en az bir gemi atanmışsa, stock_movements'ta SADECE
--    kendisine atanan gemi(ler)i görür/yazar. Hiçbir gemi atanmamış kullanıcılar
--    ve atanmamış gemiler için davranış aynı kalır (genel havuz, mevcut durum).
-- 2) stock_movements.driver_name: çekim/boşaltma kaydındaki şoför adı.
-- 3) sm_select politikasında "maliyet" rolü eksikti -> /cost/[id] raporundaki
--    "Operasyon (Boşaltma)" bölümü maliyet kullanıcıları için her zaman boş
--    görünüyordu (bosaltilan = 0). Diğer maliyet politikalarıyla (0007) tutarlı
--    hale getirildi.
-- =============================================================================

alter table public.purchase_contracts
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.stock_movements
  add column if not exists driver_name text;

create index if not exists idx_pc_assigned_to on public.purchase_contracts(assigned_to);

-- Bir stok hareketinin contract_id'sine göre operasyon erişimi var mı?
-- - Kullanıcıya en az bir gemi atanmışsa: SADECE kendisine atanan gemi(ler)e erişir.
-- - Kullanıcıya hiç gemi atanmamışsa: atanmamış (genel havuz) hareketlere erişir.
-- admin bu fonksiyonu kullanmaz; politika tarafında zaten tam yetkilidir.
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

-- ---------------------------------------------------------------------------
-- stock_movements: maliyet okuyabilsin, operasyon erişimi atamaya göre daralsın
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- profiles: "Operasyon Sorumlusu" seçimi için purchasing/admin tüm profilleri görsün
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_assign on public.profiles;
create policy profiles_select_assign on public.profiles for select to authenticated
  using (public.auth_role() in ('admin','purchasing'));
