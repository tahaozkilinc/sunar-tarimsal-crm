-- =============================================================================
-- Sunar Tarımsal CRM - TCMB döviz kuru alanları (USD bazlı raporlama için)
-- Sıra: 11 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- Bağlantı (alış) ve satış kayıtlarına, kaydın oluşturulduğu GÜNÜN TCMB
-- kurları yazılır. Böylece raporlar geçmişe dönük olarak da o günkü kura göre
-- USD'ye çevrilebilir (kur sonradan değişse bile rapor tutarlı kalır).
--   usd_try : 1 USD = ? TL (TCMB döviz satış)
--   eur_try : 1 EUR = ? TL (TCMB döviz satış)
--   EUR/USD paritesi = eur_try / usd_try
--   fx_date : kurun alındığı tarih
-- =============================================================================

alter table public.purchase_contracts
  add column if not exists usd_try numeric,
  add column if not exists eur_try numeric,
  add column if not exists fx_date date;

alter table public.sales_orders
  add column if not exists usd_try numeric,
  add column if not exists eur_try numeric,
  add column if not exists fx_date date;
