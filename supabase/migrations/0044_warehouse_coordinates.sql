-- =============================================================================
-- Sunar Tarımsal CRM - Depo/fabrika için TAM koordinat (haritadan seçilen)
-- Sıra: 44 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Şu ana kadar harita, depo/fabrikanın konumunu 'city'/'country' metninden
-- TAHMİN ediyordu (il merkezi / yurtdışı liman sözlüğü — kaba yaklaşık).
-- Kullanıcı isteği: haritadan tıklayarak TAM konum girmek. warehouses.lat/lng
-- eklendi; doluysa harita bunu birebir kullanır, boşsa eski tahmine düşer
-- (geriye uyumlu — mevcut depolar bozulmaz, sırayla haritadan pinlenebilir).
-- =============================================================================

alter table public.warehouses
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.warehouses drop constraint if exists ck_wh_lat;
alter table public.warehouses add constraint ck_wh_lat check (lat is null or lat between -90 and 90);

alter table public.warehouses drop constraint if exists ck_wh_lng;
alter table public.warehouses add constraint ck_wh_lng check (lng is null or lng between -180 and 180);

-- İkisi birlikte dolu ya da birlikte boş olmalı (yarım koordinat anlamsız).
alter table public.warehouses drop constraint if exists ck_wh_latlng_pair;
alter table public.warehouses add constraint ck_wh_latlng_pair check ((lat is null) = (lng is null));
