-- =============================================================================
-- Sunar Tarımsal CRM - Pasif kullanıcıyı FİİLEN kilitle (is_active şimdiye
-- kadar kozmetikti)
-- Sıra: 40 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- BULGU: Yönetim → Kullanıcılar'daki "Pasif" anahtarı yalnızca profiles.is_active
-- kolonunu günceller. Sistemdeki HER RLS politikası ve HER yetki kontrolü
-- auth_role() / auth_base_role() / is_admin() fonksiyonlarına dayanır; hiçbiri
-- is_active'e bakmıyordu. Sonuç: "Pasif" işaretlenen bir kullanıcı (işten
-- ayrılan çalışan, sözleşmesi biten nakliyeci/gözetim/acente firması) oturumu
-- açık kaldığı sürece TÜM yetkilerini korumaya devam ediyordu — kilit yalnızca
-- görünüşteydi.
--
-- ÇÖZÜM: Bu üç merkezi fonksiyon tüm politikaların/guard fonksiyonlarının
-- ortak temelidir (39 migration boyunca hepsi bunların üzerine kurulu). Üçüne
-- de is_active=true şartı eklemek, tek dokunuşla sistemin TAMAMINA yayılır —
-- tek tek onlarca politikayı değiştirmeye gerek yok.
--   auth_role() / auth_base_role() NULL döner       -> her "= 'rol'" karşılaştırması
--                                                       NULL olur (SQL'de yanlış sayılır)
--   is_admin() false döner                          -> admin ayrıcalığı da düşer
--
-- profiles_select politikası (0002: id = auth.uid() or is_admin()) bu
-- fonksiyonlara dayanmadığından etkilenmez: pasif kullanıcı kendi satırını
-- (rolünü, pasif durumunu) yine okuyabilir — uygulama net bir mesajla
-- oturumu kapatabilsin diye bilinçli olarak böyle bırakıldı.
-- =============================================================================

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.auth_base_role()
returns text language sql stable security definer set search_path = public as $$
  select case
    when right(role::text, 5) = '_view' then left(role::text, length(role::text) - 5)
    else role::text
  end
  from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;
