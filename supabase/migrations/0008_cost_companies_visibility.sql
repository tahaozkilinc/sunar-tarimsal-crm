-- =============================================================================
-- Sunar Tarımsal CRM - Maliyet rolü firma adlarını görebilsin
-- Sıra: 8 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- Maliyet/Kâr-Zarar sayfasında her gemiden hangi müşteriye ne kadar satıldığı
-- gösteriliyor; bunun için "maliyet" rolünün companies tablosunu (sadece okuma)
-- görebilmesi gerekiyor. Mevcut companies_select politikasına dokunmadan,
-- ek bir izinli (permissive) SELECT politikası ekliyoruz -> update/delete
-- yetkisi değişmez, sadece okuma genişler.
-- =============================================================================

drop policy if exists companies_select_maliyet on public.companies;
create policy companies_select_maliyet on public.companies for select to authenticated
  using (public.auth_role() = 'maliyet');
