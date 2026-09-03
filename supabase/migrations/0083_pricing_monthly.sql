-- =============================================================================
-- Sunar Tarımsal CRM - Anlaşmalı fiyata 4. model: AYLIK SABİT
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: bazen anlaşma tonajdan bağımsız, HER AY tekrar eden sabit
-- bir tutar şeklinde olabiliyor (annual'ın aylık karşılığı — flat'tan farkı,
-- flat tüm dönem için TEK bir toplam tutarken monthly her ay yinelenir).
-- =============================================================================

alter table public.pricing_agreements drop constraint pricing_agreements_pricing_model_check;
alter table public.pricing_agreements add constraint pricing_agreements_pricing_model_check
  check (pricing_model in ('per_ton', 'annual', 'monthly', 'flat'));

comment on column public.pricing_agreements.price is
  'pricing_model''e göre anlam değişir: per_ton -> $/ton, annual -> $/yıl, monthly -> $/ay, flat -> toplam sabit tutar.';
