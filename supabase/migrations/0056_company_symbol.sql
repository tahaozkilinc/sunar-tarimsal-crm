-- Sunar Tarımsal CRM - Firmaya kısa bir "sembol" (kod/işaret) eklenebilsin
-- ----------------------------------------------------------------------------
-- Bilerek EN BASİT/EN DÜŞÜK RİSKLİ tasarım: tek bir nullable text kolonu.
-- Yeni tablo yok, yeni Storage kovası yok (logo_url zaten ayrı bir alan —
-- bu ondan BAĞIMSIZ, ek bir kısa metin alanı), yeni RLS politikası da
-- GEREKMİYOR: companies üzerindeki mevcut companies_select/insert/update/
-- delete politikaları zaten TÜM kolonları (bu yeni kolon dahil) kapsıyor,
-- ayrıca bir şey tanımlamaya gerek yok. Yalnızca makul bir uzunluk sınırı
-- (kazayla dev bir metin yapıştırılmasın diye) eklendi.

alter table public.companies
  add column if not exists symbol text;

alter table public.companies
  add constraint companies_symbol_length_check
  check (symbol is null or char_length(symbol) <= 20);

comment on column public.companies.symbol is
  'Firma için kısa, serbest bir sembol/kod (opsiyonel) — logo_url''den bağımsız, listede hızlı tanımak için.';
