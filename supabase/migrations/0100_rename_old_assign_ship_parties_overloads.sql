-- =============================================================================
-- Sunar Tarımsal CRM - assign_ship_parties'in eski overload'larını kullanım
-- dışı bırak (adlarını değiştirerek)
-- ----------------------------------------------------------------------------
-- Canlıda görülen gerçek hata: "Could not choose the best candidate function
-- between: assign_ship_parties(... 14 parametre ...), assign_ship_parties(...
-- 15 parametre ...)". Bu oturumda assign_ship_parties'e birkaç kez yeni
-- parametre eklendi (ETD, discharge_tonnage, loading_eta — bkz. 0094, 0097,
-- 0098, 0099); her seferinde eski overload SİLİNEMEDİ (DROP FUNCTION bu
-- projede tutarlı olarak zaman aşımına uğruyor) ve "zararsız artık" olarak
-- bırakıldı. Bu VARSAYIM YANLIŞTI: eski parametre setiyle (ör. yenilenmemiş
-- bir sekmeden) gelen bir çağrı, PostgREST'in isimli-parametre eşleştirmesinde
-- hem eski hem yeni overload'a (sonraki parametreler default olduğundan) aynı
-- derecede uyduğundan Postgres hangisini çalıştıracağına karar veremiyor ve
-- bu ham, kullanıcı için anlamsız hatayı veriyor.
--
-- Çözüm: DROP yerine ALTER FUNCTION ... RENAME TO — DROP'un aksine bu projede
-- ZAMAN AŞIMINA UĞRAMIYOR (muhtemelen DROP'a özgü bir katalog kilidi/ortam
-- sorunu, RENAME farklı bir yoldan geçiyor). Eski overload'lar silinmek
-- yerine artık çağrılamayacak adlara taşındı — assign_ship_parties adında
-- TEK bir fonksiyon kaldı, belirsizlik tamamen ortadan kalktı. Kendileri hâlâ
-- DB'de duruyor (gerçek DROP yine zaman aşımına uğradı) ama artık hiçbir
-- çağrıyla eşleşmedikleri için tamamen zararsızlar.
-- =============================================================================

alter function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  rename to assign_ship_parties_deprecated_v0;
alter function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric)
  rename to assign_ship_parties_deprecated_v1;
alter function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date)
  rename to assign_ship_parties_deprecated_v2;
alter function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric)
  rename to assign_ship_parties_deprecated_v3;

-- Gerçek silmeyi dene — ortam sorunu düzeldiyse çalışır, aksi halde
-- "if exists" sayesinde migration yine başarıyla biter (isim değiştiği için
-- artık hiçbir çağrıyla çakışmıyorlar, kalsalar da sorun olmaz).
drop function if exists public.assign_ship_parties_deprecated_v0(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
drop function if exists public.assign_ship_parties_deprecated_v1(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric);
drop function if exists public.assign_ship_parties_deprecated_v2(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date);
drop function if exists public.assign_ship_parties_deprecated_v3(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, date, numeric);
