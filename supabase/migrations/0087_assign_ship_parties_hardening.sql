-- =============================================================================
-- Sunar Tarımsal CRM - assign_ship_parties: eski 7 parametreli overload temizliği
-- ----------------------------------------------------------------------------
-- 0086'daki "create or replace function ... assign_ship_parties(... 8 param)"
-- Postgres'te YENİ bir overload oluşturdu (parametre SAYISI değiştiği için
-- fonksiyon "kimliği" değişti) — eski 7 parametreli sürüm silinmeden yanında
-- kaldı. Bu hem gereksiz hem de yeni overload, 0025/0030'daki "anon + public'ten
-- EXECUTE kaldır, yalnızca authenticated'a bırak" sertleştirmesini miras
-- almadığından (Postgres privilege'lar imza bazlıdır) yeni imza anon'a açık
-- kalıyordu (canlıda doğrulandı — Supabase security advisor). İkisi de burada
-- düzeltiliyor: eski overload silinir, yeni imza için aynı sertleştirme
-- tekrarlanır.
-- =============================================================================

drop function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid);

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;
