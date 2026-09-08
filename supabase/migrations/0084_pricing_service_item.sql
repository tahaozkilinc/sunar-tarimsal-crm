-- =============================================================================
-- Sunar Tarımsal CRM - Anlaşmalı fiyata "Hizmet Kalemi" (liman)
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: liman anlaşmalarında fiyatın HANGİ hizmete ait olduğu da
-- seçilebilsin (Gemi Tahliye / Liman Tahliye / Diğer) — aksi halde aynı liman
-- için farklı hizmetlerin fiyatları tek listede karışıp zaman içindeki artışı
-- takip etmeyi anlamsızlaştırıyor. select_other deseni (bkz. sale_type,
-- stock_status) — sabit kısıt yok, "Diğer" ile serbest metin de yazılabilir.
-- Depo anlaşmalarında bu alan kullanılmaz (UI'da formHidden), boş kalır.
-- =============================================================================

alter table public.pricing_agreements add column service_item text;

comment on column public.pricing_agreements.service_item is
  'Liman hizmet kalemi (ör. Gemi Tahliye / Liman Tahliye / Diğer) — yalnızca target_type=port için anlamlı, depo anlaşmalarında boş kalır.';
