-- =============================================================================
-- Sunar Tarımsal CRM - Stok durumuna "ANTREPO" eklendi
-- ----------------------------------------------------------------------------
-- Gemi boşaltımında mal bazen gümrüklenip millileşiyor (MİLLİ), bazen antrepo
-- (gümrüklü/bonded saha) statüsünde çekiliyor — aynı geminin farklı
-- kısımları bile farklı statüde olabiliyor. Kapsamı toplu depo girişinde
-- (ship-ops-page.tsx) seçilebilsin diye MİLLİ/YERLİ'ye ANTREPO eklendi.
-- =============================================================================

alter table public.stock_movements
  drop constraint if exists stock_movements_stock_status_check;
alter table public.stock_movements
  add constraint stock_movements_stock_status_check
  check (stock_status is null or stock_status in ('MİLLİ', 'YERLİ', 'ANTREPO'));
