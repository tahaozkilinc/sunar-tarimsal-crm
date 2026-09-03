-- =============================================================================
-- Sunar Tarımsal CRM - Sözleşmeye ETD (Tahmini Kalkış) eklendi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: Bağlantı Özet'teki gantt çubuğu "yolda" süresini laycan
-- (yükleme penceresi, sefer değil) yerine ETD -> ETA aralığından göstersin.
-- ETD opsiyonel: girilmezse çubuk doğrudan ETA'da (ince) başlar.
-- =============================================================================

alter table public.purchase_contracts
  add column if not exists etd date;

comment on column public.purchase_contracts.etd is
  'Tahmini kalkış tarihi (opsiyonel) — gantt çubuğunun başlangıcı; laycan yükleme penceresinden ayrı.';
