-- =============================================================================
-- Sunar Tarımsal CRM - Manuel stok hareketleri (gemiye bağlı olmayan)
-- Sıra: 29 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- SORUN: stock_movements üzerinde operasyon rolünün yazma/okuma izni
-- can_access_ship(contract_id) ile veriliyordu. Bu fonksiyon, kullanıcıya EN AZ
-- BİR gemi atanmışsa contract_id NULL için FALSE döner. Dolayısıyla gemi atanmış
-- bir operasyon kullanıcısı, gemiye bağlı OLMAYAN manuel stok hareketi (depolar
-- arası transfer, fabrikaya sevk, sayım düzeltmesi, manuel giriş) YAZAMIYORDU.
--
-- ÇÖZÜM: Manuel hareketler = contract_id IS NULL. Bu hareketler bir gemiye değil,
-- depo/fabrika seviyesine aittir; operasyon rolü gemi atamasından BAĞIMSIZ olarak
-- bunları okuyup yazabilmelidir. Politikalara "contract_id is null" kolu eklenir.
-- Gemiye bağlı hareketlerin (contract_id dolu) kuralı DEĞİŞMEZ — eski davranış
-- (nakliyeci/gözetim/atama bazlı erişim) aynen korunur.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sm_select: operasyon manuel (gemisiz) hareketleri de görür
-- ---------------------------------------------------------------------------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','sales','maliyet','viewer')
    or (public.auth_base_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_base_role() = 'operations' and contract_id is null)
    or (public.auth_base_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_base_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  );

-- ---------------------------------------------------------------------------
-- sm_write: operasyon manuel (gemisiz) hareket yazabilir/silebilir
-- (auth_role() -> _view rolleri hariç, salt-okunur kalır)
-- ---------------------------------------------------------------------------
drop policy if exists sm_write on public.stock_movements;
create policy sm_write on public.stock_movements for all to authenticated
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'operations' and contract_id is null)
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  )
  with check (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'operations' and public.can_access_ship(contract_id))
    or (public.auth_role() = 'operations' and contract_id is null)
    or (public.auth_role() = 'nakliyeci'  and public.is_my_carrier_ship(contract_id))
    or (public.auth_role() = 'gozetim'    and public.is_my_surveyor_ship(contract_id))
  );
