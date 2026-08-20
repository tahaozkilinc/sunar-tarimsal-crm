-- =============================================================================
-- Sunar Tarımsal CRM - Liman konumu + limanın gümrüklü sahasındaki depo
-- ----------------------------------------------------------------------------
-- 1) companies.lat/lng: warehouses ile AYNI "haritadan tam konum" alanı,
--    özellikle Liman (type='port') firmaları için — ürün bazen limanın kendi
--    gümrüklü sahasında bekliyor, bu firmanın nerede olduğu işaretlenebilsin.
-- 2) warehouses.port_id: bir depo/bölüm fiilen bir limanın içindeyse (gümrüklü
--    saha), buradan o liman firmasına bağlanır (opsiyonel). Stok hâlâ SADECE
--    warehouses üzerinden tutulur (stock_movements.warehouse_id) — bu yalnızca
--    "bu depo hangi limanda" ilişkisini ekler, yeni bir stok kavramı DEĞİL.
--    Tip kısıtı (yalnızca type='port' firma seçilebilmesi) UI tarafında
--    (resources.ts ref.filter) sağlanır — surveyor_id/carrier_id/agent_id ile
--    aynı desen, DB'de ayrı bir CHECK/trigger yok.
-- =============================================================================

alter table public.companies
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.warehouses
  add column if not exists port_id uuid references public.companies(id);
