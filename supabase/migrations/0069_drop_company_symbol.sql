-- Sunar Tarımsal CRM - Firma "sembol" alanı kaldırıldı
-- ----------------------------------------------------------------------------
-- 0056'da eklenen companies.symbol kolonu kullanılmıyor (hep boş), UI'dan
-- kaldırıldı; kolonu ve ilişkili kısıtı da veritabanından temizliyoruz.

alter table public.companies
  drop constraint if exists companies_symbol_length_check;

alter table public.companies
  drop column if exists symbol;
