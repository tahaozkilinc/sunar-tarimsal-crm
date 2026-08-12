-- Sunar Tarımsal CRM - TÜİK ithalat karşılaştırması özelliği tamamen kaldırıldı
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "ithalat tuik karşılaştırması olmadı onu sistemden tamamen
-- kaldır çalışmıyor çünkü o fonksiyon". /imports sayfası, tuik-imports.tsx,
-- /api/imports/* route'ları, imports/providers.ts, nav girişi, panel kartı ve
-- vercel.json cron'u uygulama kodundan zaten kaldırıldı; bu migration tabloyu
-- (ve onunla birlikte kendi RLS politikalarını + audit trigger'ını) düşürür.
--
-- products.hs_code kolonuna DOKUNULMADI: bu, Yönetim -> Ürünler'de görünen
-- genel bir alan (GTİP / HS Kodu) — yalnızca bu tabloya bağımlı değil, silinen
-- özellikten bağımsız olarak durabilir.
--
-- NOT: Bu tabloda daha önce elle girilmiş TÜİK verisi varsa GERİ ALINAMAZ
-- şekilde silinir. Supabase MCP bu oturumda kimlik doğrulaması gerektirdiğinden
-- migration canlıya uygulanamadı/doğrulanamadı (tuik_monthly_imports'ta gerçek
-- veri olup olmadığı kontrol edilemedi) — uygulamadan önce buna dikkat edin.

drop table if exists public.tuik_monthly_imports;
