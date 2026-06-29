-- =============================================================================
-- Sunar Tarımsal CRM - SECURITY DEFINER view'lerden anon erişimini kaldır
-- Sıra: 26 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- GERÇEK AÇIK: profile_names / sellable_contracts / payment_schedule view'leri
-- SECURITY DEFINER (RLS'i bypass eder) ve 'anon' rolüne SELECT verilmişti.
-- Özellikle profile_names'in rol filtresi olmadığından, herkese açık anon
-- anahtarıyla giriş yapmadan /rest/v1/profile_names'ten TÜM kullanıcı adları
-- çekilebiliyordu. Bu view'ler yalnızca authenticated tarafından, kendi
-- içlerindeki auth_base_role() kontrolüyle kullanılmalı.
--
-- Not: Bu view'ler bilinçli olarak DEFINER'dır (satış sellable_contracts'ı,
-- finans payment_schedule'ı purchase_contracts TABLOSUNA erişmeden, sınırlı
-- kolonlarla görür). security_invoker'a çevirmek bu rollerin erişimini bozar
-- ya da fiyat/tedarikçi gibi alanları açar; bu yüzden definer korunur, sadece
-- anon erişimi kapatılır.
-- =============================================================================

revoke all on public.profile_names      from anon, public;
revoke all on public.sellable_contracts from anon, public;
revoke all on public.payment_schedule   from anon, public;

-- authenticated: salt-okunur view'lerde yalnızca SELECT kalsın
revoke insert, update, delete, truncate, references, trigger on public.profile_names      from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.sellable_contracts from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.payment_schedule   from authenticated;

grant select on public.profile_names      to authenticated;
grant select on public.sellable_contracts to authenticated;
grant select on public.payment_schedule   to authenticated;
