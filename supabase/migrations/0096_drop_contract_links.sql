-- =============================================================================
-- Sunar Tarımsal CRM - İlişkili Sözleşmeler (contract_links) kaldırıldı
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği (0092'de eklenen özelliği geri aldı): "sözleşme seçmek
-- saçma değil mi zaten belli sözleşme, sistemin yalın olması gerekiyor sen
-- bir şey ekledikçe sistem daha da karmaşık bir hal almaya başlıyor gibi
-- hissediyorum." — frontend'den (contract-links.tsx, ship-ops-page.tsx'teki
-- kullanımı) kaldırıldı, tablo da burada siliniyor.
--
-- BİLİNEN TEKNİK BORÇ: bu oturumda DROP TABLE da (diğer DROP'lar gibi) zaman
-- aşımına uğradı — tablo canlıda hâlâ duruyor ama artık hiçbir frontend kodu
-- tarafından okunmuyor/yazılmıyor, zararsız. Bağlantı stabilize olunca bu
-- migration'ı (tek başına) yeniden çalıştırmak yeterli.
-- =============================================================================

drop table if exists public.contract_links;
