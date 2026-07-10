-- =============================================================================
-- Sunar Tarımsal CRM - Yurtdışı operasyon: ENUM değerleri (1/2)
-- Sıra: 31 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Yeni enum değerleri AYRI dosyada: PostgreSQL, ALTER TYPE ... ADD VALUE ile
-- eklenen bir değerin AYNI transaction içinde kullanılmasına izin vermez.
-- Kullanım 0032'dedir; bu dosya yalnızca değerleri ekler.
--
-- - user_role 'acente'      : yurtdışı yükleme operasyonunu takip eden firma
--                             kullanıcısı (nakliyeci/gozetim'e paralel dış rol).
-- - company_type 'agent'    : acente firması (companies.type).
-- - location_type 'foreign' : yurtdışı depo (menşe ülkede stoklama noktası).
-- - movement_type 'origin_in': yurtdışı depoya giriş. AYRI tip olmalı çünkü
--   'inbound' uygulama genelinde "Türkiye'ye geldi/boşaltıldı" anlamı taşır
--   (gemi operasyonu araç listesi, Çekilen/Kalan, boşaltılan raporu, panel
--   "bu ay giriş"). Yurtdışı girişler bu ekranlara karışmamalıdır.
-- =============================================================================

alter type public.user_role     add value if not exists 'acente';
alter type public.company_type  add value if not exists 'agent';
alter type public.location_type add value if not exists 'foreign';
alter type public.movement_type add value if not exists 'origin_in';
