-- =============================================================================
-- Sunar Tarımsal CRM - Satış Operasyon: ENUM değerleri (1/2)
-- Sıra: 42 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Yeni enum değerleri AYRI dosyada: ALTER TYPE ... ADD VALUE ile eklenen bir
-- değer aynı transaction içinde kullanılamaz. Kullanım 0043'tedir.
--
-- - user_role 'sales_ops'      : satış sevkiyat memuru. İç (firma dışı değil)
--   ama dar yetkili rol — yalnızca satış çıkış (araç) kaydı girer; fiyat/
--   müşteri ticari koşullarını GÖREMEZ (nakliyeci/gozetim/acente'ye paralel
--   "yalnızca operasyonel görünüm" ilkesi, şirket içi bir role uygulanmış hali).
-- - movement_type 'outbound_sale': depodan veya gemiden doğrudan satışla çıkan
--   mal. 'transfer' ile KARIŞTIRILMAZ (transfer depolar arası / gemiye yükleme
--   anlamına gelir, satış değildir) — ayrı tip, raporlarda net ayrım sağlar.
-- =============================================================================

alter type public.user_role     add value if not exists 'sales_ops';
alter type public.movement_type add value if not exists 'outbound_sale';
