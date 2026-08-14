-- Sunar Tarımsal CRM - profile_names: "Operasyon Sorumlusu" seçimi için role eklenir
-- ----------------------------------------------------------------------------
-- ship-ops-page.tsx artık "Operasyon Tarafları" kartından assigned_to (Operasyon
-- Sorumlusu) atayabiliyor (bkz. 0057) ve bu dropdown yalnızca role='operations'
-- kullanıcılarını listelemeli (resources.ts'teki create-formundaki mevcut
-- filter: { role: ["operations"] } ile tutarlı olsun diye). profiles tablosu
-- operasyon rolüne DOĞRUDAN kapalı (bkz. 0012 profiles_select_assign: yalnızca
-- admin/purchasing okur) — bu yüzden zaten var olan dar kapsamlı profile_names
-- view'i (id, full_name; e-posta/telefon YOK) genişletilir: role eklenir.
-- role, email/telefon gibi hassas değil (rol etiketleri uygulamada zaten her
-- yerde görünür) ve CREATE OR REPLACE VIEW ile SONA eklenmesi güvenlidir
-- (mevcut sütunlar değişmez/silinmez, grant'ler korunur).

create or replace view public.profile_names
with (security_invoker = off) as
  select id, full_name, role from public.profiles;
